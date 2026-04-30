import asyncio
import json
import hashlib
import logging
import shutil
import time
import uuid
from pathlib import Path, PurePosixPath
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from open_webui.config import DATA_DIR
from open_webui.internal.db import get_async_session
from open_webui.models.chat_messages import ChatMessage, ChatMessages
from open_webui.models.chats import Chat, ChatImportForm, Chats
from open_webui.models.folders import Folder
from open_webui.models.memories import Memory
from open_webui.models.notes import Note
from open_webui.models.tags import Tag
from open_webui.models.users import Users
from open_webui.retrieval.vector.async_client import ASYNC_VECTOR_DB_CLIENT
from open_webui.env import WEBUI_AUTH
from open_webui.utils.auth import bearer_security, get_current_user

log = logging.getLogger(__name__)

router = APIRouter()

FRAGMENTS_NOTE_TITLE = 'MemoryVault_Global_Fragments'
MEMORY_VAULT_PREFIX = 'MemoryVault_'
ISOLATED_DRAWER_GROUP_ID = 'system_isolated_drawers'
ARCHIVE_APP_ID = 'open-webui-memory-vault'
DEFAULT_ROOT_DIR = 'archive-packs'


async def get_archive_user(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    auth_token=Depends(bearer_security),
    db: AsyncSession = Depends(get_async_session),
):
    try:
        user = await get_current_user(request, response, background_tasks, auth_token)
        if user.role not in {'user', 'admin'}:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Access prohibited')
        return user
    except HTTPException:
        if WEBUI_AUTH:
            raise

    user = await Users.get_user_by_email('admin@localhost', db=db)
    if user and user.role in {'user', 'admin'}:
        return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Local workspace user is not initialized')


class ArchiveScope(BaseModel):
    chats: bool = True
    archived_chats: bool = True
    notes: bool = True
    memory_vaults: bool = True
    fragments: bool = True
    memories: bool = True
    folders: bool = True
    tags: bool = True
    settings: bool = False
    files: bool = False


class ArchivePackRequest(BaseModel):
    root_dir: str = DEFAULT_ROOT_DIR
    pack_name: Optional[str] = None
    scope: ArchiveScope = Field(default_factory=ArchiveScope)


class ArchiveImportRequest(BaseModel):
    root_dir: str = DEFAULT_ROOT_DIR
    pack_name: str
    mode: str = 'merge'
    conflict: str = 'exact_overwrite'
    dry_run: bool = False
    rebuild_memory_vectors: bool = True
    confirm_text: Optional[str] = None


class ArchiveClearRequest(BaseModel):
    scope: ArchiveScope = Field(default_factory=ArchiveScope)
    create_backup_before_clear: bool = True
    backup_pack_name: Optional[str] = None
    confirm_text: Optional[str] = None


class ArchiveImportFilesRequest(BaseModel):
    pack_name: str
    files: dict[str, str]
    mode: str = 'merge'
    conflict: str = 'exact_overwrite'
    rebuild_memory_vectors: bool = True
    confirm_text: Optional[str] = None


def _safe_root(root_dir: str) -> Path:
    base = (Path(DATA_DIR) / 'archive-packs').resolve()
    if root_dir and root_dir != DEFAULT_ROOT_DIR:
        safe_name = Path(root_dir).name
        base = (Path(DATA_DIR) / safe_name).resolve()
    base.mkdir(parents=True, exist_ok=True)
    return base


def _safe_pack_name(pack_name: Optional[str]) -> str:
    name = Path(pack_name or '').name.strip()
    if not name or name in {'.', '..'}:
        return _default_pack_name()
    return name


def _safe_pack_dir(root_dir: str, pack_name: str) -> Path:
    root = _safe_root(root_dir)
    pack_dir = (root / _safe_pack_name(pack_name)).resolve()
    if root not in [pack_dir, *pack_dir.parents]:
        raise HTTPException(status_code=400, detail='Invalid archive pack path')
    return pack_dir


def _default_pack_name() -> str:
    return time.strftime('%Y-%m-%d-%H%M%S-memory-archive')


def _write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')


def _write_jsonl(path: Path, rows: list[dict]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + '\n')


def _json_text(payload) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _jsonl_text(rows: list[dict]) -> str:
    return ''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows)


def _read_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    with path.open('r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _row_to_dict(row, columns: list[str]) -> dict:
    return {column: getattr(row, column) for column in columns}


def _is_vault_note(title: str) -> bool:
    return title.startswith(MEMORY_VAULT_PREFIX) and title != FRAGMENTS_NOTE_TITLE


def _is_plain_note(title: str) -> bool:
    return title != FRAGMENTS_NOTE_TITLE and not _is_vault_note(title)


def _json_key(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def _parse_json_string(value: str):
    try:
        return json.loads(value)
    except Exception:
        return None


def _note_md_payload(note_data):
    data = _parse_json_string(note_data) if isinstance(note_data, str) else note_data
    if not isinstance(data, dict):
        return data

    md = ((data.get('content') or {}).get('md') if isinstance(data.get('content'), dict) else None)
    if isinstance(md, str) and md.strip():
        parsed = _parse_json_string(md)
        if parsed is not None:
            return parsed

    return data


def _pack_note_md_payload(payload):
    return {'content': {'json': None, 'html': '', 'md': json.dumps(payload, ensure_ascii=False)}}


def _normalize_text(value) -> str:
    return ' '.join((value or '').replace('\r\n', '\n').replace('\r', '\n').strip().split())


def _stable_hash(value) -> str:
    return hashlib.sha256(_normalize_text(value).encode('utf-8')).hexdigest()


def _exact_card_key(card: dict) -> str:
    return f"{_stable_hash(card.get('title'))}:{_stable_hash(card.get('content'))}"


def _content_card_key(card: dict) -> str:
    return _stable_hash(card.get('content'))


def _normalize_cards(cards: list[dict]) -> list[dict]:
    now = int(time.time())
    normalized = []
    for index, card in enumerate(cards or []):
        if not isinstance(card, dict):
            continue
        normalized.append(
            {
                **card,
                'id': card.get('id') or str(uuid.uuid4()),
                'title': card.get('title') or '',
                'content': card.get('content') or '',
                'enabled': False if card.get('enabled') is False else True,
                'group_id': card.get('group_id') or None,
                'order': card.get('order') if isinstance(card.get('order'), int) else index,
                'created_at': card.get('created_at') or now,
                'updated_at': card.get('updated_at') or now,
            }
        )
    return normalized


def _cards_from_note_data(note_data) -> list[dict]:
    payload = _note_md_payload(note_data)
    if isinstance(payload, list):
        return _normalize_cards(payload)
    if isinstance(payload, dict) and isinstance(payload.get('fragments'), list):
        return _normalize_cards(payload.get('fragments'))
    if isinstance(payload, dict) and isinstance(payload.get('cards'), list):
        return _normalize_cards(payload.get('cards'))
    return []


def _normalize_fragment_groups(groups: list[dict]) -> list[dict]:
    now = int(time.time())
    seen = set()
    normalized = []
    colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#64748b']
    for index, group in enumerate(groups or []):
        if not isinstance(group, dict):
            continue
        group_id = group.get('id') or str(uuid.uuid4())
        if group_id in seen:
            continue
        seen.add(group_id)
        normalized.append(
            {
                **group,
                'id': group_id,
                'name': group.get('name') or '未命名分组',
                'color': group.get('color') or colors[index % len(colors)],
                'order': group.get('order') if isinstance(group.get('order'), int) else index,
                'created_at': group.get('created_at') or now,
                'updated_at': group.get('updated_at') or now,
                'system': group.get('system') is True,
            }
        )
    return sorted(normalized, key=lambda item: item.get('order') or 0)


def _normalize_fragment_library(library: dict) -> dict:
    groups = _normalize_fragment_groups((library or {}).get('groups') or [])
    group_ids = {group['id'] for group in groups}
    fragments = []
    for index, card in enumerate(_normalize_cards((library or {}).get('fragments') or [])):
        group_id = card.get('group_id')
        fragments.append(
            {
                **card,
                'group_id': group_id if group_id in group_ids else None,
                'order': card.get('order') if isinstance(card.get('order'), int) else index,
            }
        )
    return {
        'version': 2,
        'groups': groups,
        'fragments': sorted(fragments, key=lambda item: item.get('order') or 0),
    }


def _fragment_library_from_note_data(note_data) -> dict:
    payload = _note_md_payload(note_data)
    if isinstance(payload, dict) and payload.get('version') == 2:
        return _normalize_fragment_library(payload)
    if isinstance(payload, list):
        return _normalize_fragment_library({'version': 2, 'groups': [], 'fragments': payload})
    if isinstance(payload, dict) and isinstance(payload.get('cards'), list):
        return _normalize_fragment_library({'version': 2, 'groups': [], 'fragments': payload.get('cards')})
    return _normalize_fragment_library({'version': 2, 'groups': [], 'fragments': []})


def _ensure_isolated_drawer_group(library: dict) -> dict:
    library = _normalize_fragment_library(library)
    if any(group.get('id') == ISOLATED_DRAWER_GROUP_ID for group in library['groups']):
        return library

    library['groups'].append(
        {
            'id': ISOLATED_DRAWER_GROUP_ID,
            'name': '孤立抽屉',
            'color': '#f97316',
            'order': len(library['groups']),
            'created_at': int(time.time()),
            'updated_at': int(time.time()),
            'system': True,
        }
    )
    return _normalize_fragment_library(library)


def _merge_fragment_cards(library: dict, incoming_cards: list[dict], group_id: Optional[str] = None) -> tuple[dict, dict]:
    timestamp = int(time.time())
    next_library = _normalize_fragment_library(library)
    fragments = list(next_library['fragments'])
    report = {'inserted': 0, 'overwritten': 0, 'conflicts': []}

    for incoming in _normalize_cards(incoming_cards):
        candidate = {
            **incoming,
            'id': incoming.get('id') or str(uuid.uuid4()),
            'group_id': group_id if group_id is not None else incoming.get('group_id'),
            'updated_at': timestamp,
            'created_at': incoming.get('created_at') or timestamp,
        }
        exact_key = _exact_card_key(candidate)
        exact_index = next((index for index, card in enumerate(fragments) if _exact_card_key(card) == exact_key), -1)
        if exact_index >= 0:
            fragments[exact_index] = {
                **fragments[exact_index],
                **candidate,
                'id': fragments[exact_index]['id'],
                'group_id': candidate.get('group_id') or fragments[exact_index].get('group_id'),
                'created_at': fragments[exact_index].get('created_at'),
                'updated_at': timestamp,
            }
            report['overwritten'] += 1
            continue

        title_conflict = any(
            _normalize_text(card.get('title')).lower() == _normalize_text(candidate.get('title')).lower()
            and _content_card_key(card) != _content_card_key(candidate)
            for card in fragments
        )
        if title_conflict:
            report['conflicts'].append({'title': candidate.get('title'), 'source_card_id': candidate.get('id')})
            continue

        fragments.insert(0, {**candidate, 'id': str(uuid.uuid4()), 'order': -report['inserted'] - 1})
        report['inserted'] += 1

    return _normalize_fragment_library({**next_library, 'fragments': fragments}), report


def _merge_fragment_libraries(base: dict, incoming: dict) -> tuple[dict, dict]:
    base = _normalize_fragment_library(base)
    incoming = _normalize_fragment_library(incoming)
    groups_by_id = {group['id']: group for group in base['groups']}
    for group in incoming['groups']:
        groups_by_id[group['id']] = {**groups_by_id.get(group['id'], {}), **group}

    merged = _normalize_fragment_library({**base, 'groups': list(groups_by_id.values())})
    return _merge_fragment_cards(merged, incoming['fragments'])


async def _upsert_note_exact(
    user_id: str,
    note: dict,
    title: str,
    db: AsyncSession,
    force_single_title: bool = False,
) -> tuple[str, str]:
    data = note.get('data')
    now_ns = int(time.time_ns())
    result = await db.execute(select(Note).filter_by(user_id=user_id, title=title))
    existing_notes = result.scalars().all()
    exact = next((existing for existing in existing_notes if _json_key(existing.data) == _json_key(data)), None)

    if exact:
        await db.execute(
            update(Note)
            .filter_by(id=exact.id)
            .values(
                data=data,
                meta=note.get('meta'),
                is_pinned=note.get('is_pinned') or False,
                updated_at=now_ns,
            )
        )
        return exact.id, 'overwritten'

    if force_single_title and existing_notes:
        target = existing_notes[0]
        await db.execute(
            update(Note)
            .filter_by(id=target.id)
            .values(
                data=data,
                meta=note.get('meta'),
                is_pinned=note.get('is_pinned') or False,
                updated_at=now_ns,
            )
        )
        return target.id, 'overwritten'

    new_id = str(uuid.uuid4())
    db.add(
        Note(
            id=new_id,
            user_id=user_id,
            title=title,
            data=data,
            meta=note.get('meta'),
            is_pinned=note.get('is_pinned') or False,
            created_at=note.get('created_at') or now_ns,
            updated_at=note.get('updated_at') or now_ns,
        )
    )
    return new_id, 'inserted'


async def _collect_archive_data(user_id: str, scope: ArchiveScope, db: AsyncSession) -> dict:
    data = {
        'chats': [],
        'archived_chats': [],
        'notes': [],
        'memory_vaults': [],
        'fragments': None,
        'memories': [],
        'folders': [],
        'tags': [],
    }

    if scope.chats or scope.archived_chats:
        result = await db.execute(select(Chat).filter_by(user_id=user_id).order_by(Chat.updated_at.desc()))
        for chat in result.scalars().all():
            row = _row_to_dict(
                chat,
                [
                    'id',
                    'title',
                    'chat',
                    'created_at',
                    'updated_at',
                    'share_id',
                    'archived',
                    'pinned',
                    'meta',
                    'folder_id',
                    'tasks',
                    'summary',
                    'last_read_at',
                ],
            )
            if chat.archived:
                if scope.archived_chats:
                    data['archived_chats'].append(row)
            elif scope.chats:
                data['chats'].append(row)

    if scope.notes or scope.memory_vaults or scope.fragments:
        result = await db.execute(select(Note).filter_by(user_id=user_id).order_by(Note.updated_at.desc()))
        for note in result.scalars().all():
            row = _row_to_dict(note, ['id', 'title', 'data', 'meta', 'is_pinned', 'created_at', 'updated_at'])
            if note.title == FRAGMENTS_NOTE_TITLE:
                if scope.fragments:
                    data['fragments'] = row
            elif _is_vault_note(note.title):
                if scope.memory_vaults:
                    data['memory_vaults'].append(row)
            elif scope.notes and _is_plain_note(note.title):
                data['notes'].append(row)

    if scope.memories:
        result = await db.execute(select(Memory).filter_by(user_id=user_id).order_by(Memory.updated_at.desc()))
        data['memories'] = [
            _row_to_dict(memory, ['id', 'content', 'created_at', 'updated_at']) for memory in result.scalars().all()
        ]

    if scope.folders:
        result = await db.execute(select(Folder).filter_by(user_id=user_id).order_by(Folder.updated_at.desc()))
        data['folders'] = [
            _row_to_dict(
                folder,
                ['id', 'parent_id', 'name', 'items', 'meta', 'data', 'is_expanded', 'created_at', 'updated_at'],
            )
            for folder in result.scalars().all()
        ]

    if scope.tags:
        result = await db.execute(select(Tag).filter_by(user_id=user_id))
        data['tags'] = [_row_to_dict(tag, ['id', 'name', 'meta']) for tag in result.scalars().all()]

    return data


def _counts(data: dict) -> dict:
    return {
        'chats': len(data.get('chats') or []),
        'archived_chats': len(data.get('archived_chats') or []),
        'notes': len(data.get('notes') or []),
        'memory_vaults': len(data.get('memory_vaults') or []),
        'fragments': 1 if data.get('fragments') else 0,
        'memories': len(data.get('memories') or []),
        'folders': len(data.get('folders') or []),
        'tags': len(data.get('tags') or []),
    }


def _build_pack_payload(user_id: str, scope: ArchiveScope, pack_name: str, data: dict, path: Optional[str] = None) -> dict:
    counts = _counts(data)
    manifest = {
        'schema_version': 1,
        'app': ARCHIVE_APP_ID,
        'pack_name': pack_name,
        'exported_at': int(time.time()),
        'export_mode': 'current-user',
        'source': {'user_id': user_id},
        'scope': scope.model_dump(),
        'counts': counts,
    }
    report = {'status': 'ok', 'pack_name': pack_name, 'path': path, 'counts': counts, 'skipped': []}
    files = {
        'manifest.json': _json_text(manifest),
        'chats/chats.jsonl': _jsonl_text(data['chats']),
        'chats/archived-chats.jsonl': _jsonl_text(data['archived_chats']),
        'chats/tags.json': _json_text(data['tags']),
        'folders/folders.json': _json_text(data['folders']),
        'notes/notes.jsonl': _jsonl_text(data['notes']),
        'memory-vaults/vaults.jsonl': _jsonl_text(data['memory_vaults']),
        'fragments/fragments.json': _json_text(data['fragments']),
        'memories/memories.jsonl': _jsonl_text(data['memories']),
        'logs/export-report.json': _json_text(report),
    }
    return {'pack_name': pack_name, 'manifest': manifest, 'report': report, 'counts': counts, 'files': files}


async def _export_pack(user_id: str, request: ArchivePackRequest, db: AsyncSession) -> dict:
    pack_name = _safe_pack_name(request.pack_name)
    pack_dir = _safe_pack_dir(request.root_dir, pack_name)
    if pack_dir.exists():
        raise HTTPException(status_code=409, detail='Archive pack already exists')

    data = await _collect_archive_data(user_id, request.scope, db)
    payload = _build_pack_payload(user_id, request.scope, pack_name, data, str(pack_dir))
    for relative_path, text in payload['files'].items():
        file_path = pack_dir / Path(*PurePosixPath(relative_path).parts)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(text, encoding='utf-8')

    report = payload['report']
    report['path'] = str(pack_dir)
    _write_json(pack_dir / 'logs' / 'export-report.json', report)
    return report


@router.get('')
async def list_archive_packs(root_dir: str = DEFAULT_ROOT_DIR, user=Depends(get_archive_user)):
    root = _safe_root(root_dir)
    packs = []
    for path in sorted(root.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True):
        if path.is_dir() and not path.name.startswith('.incoming-'):
            manifest = _read_json(path / 'manifest.json', {})
            packs.append(
                {
                    'name': path.name,
                    'path': str(path),
                    'manifest': manifest,
                    'updated_at': int(path.stat().st_mtime),
                }
            )
    return {'items': packs}


@router.post('/export')
async def export_archive_pack(
    form_data: ArchivePackRequest,
    user=Depends(get_archive_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await _export_pack(user.id, form_data, db)


@router.post('/export-files')
async def export_archive_pack_files(
    form_data: ArchivePackRequest,
    user=Depends(get_archive_user),
    db: AsyncSession = Depends(get_async_session),
):
    pack_name = _safe_pack_name(form_data.pack_name)
    data = await _collect_archive_data(user.id, form_data.scope, db)
    return _build_pack_payload(user.id, form_data.scope, pack_name, data)


@router.post('/inspect')
async def inspect_archive_pack(form_data: ArchiveImportRequest, user=Depends(get_archive_user)):
    pack_dir = _safe_pack_dir(form_data.root_dir, form_data.pack_name)
    if not pack_dir.exists():
        raise HTTPException(status_code=404, detail='Archive pack not found')

    manifest = _read_json(pack_dir / 'manifest.json', {})
    counts = manifest.get('counts') or {
        'chats': len(_read_jsonl(pack_dir / 'chats' / 'chats.jsonl')),
        'archived_chats': len(_read_jsonl(pack_dir / 'chats' / 'archived-chats.jsonl')),
        'notes': len(_read_jsonl(pack_dir / 'notes' / 'notes.jsonl')),
        'memory_vaults': len(_read_jsonl(pack_dir / 'memory-vaults' / 'vaults.jsonl')),
        'fragments': 1 if _read_json(pack_dir / 'fragments' / 'fragments.json', None) else 0,
        'memories': len(_read_jsonl(pack_dir / 'memories' / 'memories.jsonl')),
    }
    return {
        'pack_name': form_data.pack_name,
        'path': str(pack_dir),
        'manifest': manifest,
        'counts': counts,
        'requires_confirmation': form_data.mode == 'replace',
        'confirmation_text': form_data.pack_name if form_data.mode == 'replace' else None,
    }


@router.post('/import')
async def import_archive_pack(
    request: Request,
    form_data: ArchiveImportRequest,
    user=Depends(get_archive_user),
    db: AsyncSession = Depends(get_async_session),
):
    pack_dir = _safe_pack_dir(form_data.root_dir, form_data.pack_name)
    if not pack_dir.exists():
        raise HTTPException(status_code=404, detail='Archive pack not found')

    if form_data.mode == 'replace' and form_data.confirm_text != form_data.pack_name:
        raise HTTPException(status_code=400, detail='Replacement import requires confirmation text')

    if form_data.dry_run:
        return await inspect_archive_pack(form_data, user)

    report = {
        'status': 'ok',
        'mode': form_data.mode,
        'imported': {},
        'overwritten': {},
        'skipped': {},
        'id_map': {'chats': {}, 'folders': {}, 'notes': {}, 'memories': {}},
        'errors': [],
    }

    if form_data.mode == 'replace':
        await _clear_user_data(user.id, ArchiveScope(), db)

    folder_id_map = {}
    for folder in _read_json(pack_dir / 'folders' / 'folders.json', []):
        new_id = str(uuid.uuid4())
        folder_id_map[folder['id']] = new_id
        db.add(
            Folder(
                id=new_id,
                user_id=user.id,
                parent_id=folder_id_map.get(folder.get('parent_id')),
                name=folder.get('name') or 'Imported Folder',
                items=folder.get('items'),
                meta=folder.get('meta'),
                data=folder.get('data'),
                is_expanded=folder.get('is_expanded') or False,
                created_at=folder.get('created_at') or int(time.time()),
                updated_at=folder.get('updated_at') or int(time.time()),
            )
        )
    report['id_map']['folders'] = folder_id_map

    imported_chats = []
    for chat in [*_read_jsonl(pack_dir / 'chats' / 'chats.jsonl'), *_read_jsonl(pack_dir / 'chats' / 'archived-chats.jsonl')]:
        chat_payload = dict(chat.get('chat') or {})
        folder_id = folder_id_map.get(chat.get('folder_id'), chat.get('folder_id'))
        imported_chats.append(
            (
                chat,
                ChatImportForm(
                    chat=chat_payload,
                    folder_id=folder_id,
                    meta=chat.get('meta') or {},
                    pinned=chat.get('pinned') or False,
                    created_at=chat.get('created_at'),
                    updated_at=chat.get('updated_at'),
                ),
            )
        )

    if imported_chats:
        created = await Chats.import_chats(user.id, [item[1] for item in imported_chats], db=db)
        for (old_chat, _), new_chat in zip(imported_chats, created):
            report['id_map']['chats'][old_chat['id']] = new_chat.id
            if old_chat.get('archived'):
                await db.execute(update(Chat).filter_by(id=new_chat.id).values(archived=True))

    note_status = {'inserted': 0, 'overwritten': 0}
    orphan_vault_cards = []
    fragments_note = _read_json(pack_dir / 'fragments' / 'fragments.json', None)
    incoming_fragment_library = _fragment_library_from_note_data(fragments_note.get('data') if fragments_note else None)

    for note in _read_jsonl(pack_dir / 'notes' / 'notes.jsonl'):
        title = note.get('title') or 'Imported Note'
        note_id, status_name = await _upsert_note_exact(user.id, note, title, db)
        report['id_map']['notes'][note.get('id')] = note_id
        note_status[status_name] += 1

    for note in _read_jsonl(pack_dir / 'memory-vaults' / 'vaults.jsonl'):
        title = note.get('title') or 'Imported Note'
        if title.startswith(MEMORY_VAULT_PREFIX) and title != FRAGMENTS_NOTE_TITLE:
            old_chat_id = title.removeprefix(MEMORY_VAULT_PREFIX)
            new_chat_id = report['id_map']['chats'].get(old_chat_id)
            if new_chat_id:
                title = f'{MEMORY_VAULT_PREFIX}{new_chat_id}'
                note_id, status_name = await _upsert_note_exact(user.id, note, title, db, force_single_title=True)
                report['id_map']['notes'][note.get('id')] = note_id
                note_status[status_name] += 1
            else:
                for card in _cards_from_note_data(note.get('data')):
                    orphan_vault_cards.append(
                        {
                            **card,
                            'source_vault_title': note.get('title'),
                            'source_vault_chat_id': old_chat_id,
                        }
                    )

    orphan_report = {'inserted': 0, 'overwritten': 0, 'conflicts': []}
    if orphan_vault_cards:
        incoming_fragment_library = _ensure_isolated_drawer_group(incoming_fragment_library)
        incoming_fragment_library, orphan_report = _merge_fragment_cards(
            incoming_fragment_library, orphan_vault_cards, ISOLATED_DRAWER_GROUP_ID
        )

    fragment_report = {'inserted': 0, 'overwritten': 0, 'conflicts': []}
    if fragments_note or orphan_vault_cards:
        result = await db.execute(select(Note).filter_by(user_id=user.id, title=FRAGMENTS_NOTE_TITLE))
        existing_fragments_note = result.scalars().first()
        if existing_fragments_note:
            base_library = _fragment_library_from_note_data(existing_fragments_note.data)
            merged_library, fragment_report = _merge_fragment_libraries(base_library, incoming_fragment_library)
            await db.execute(
                update(Note)
                .filter_by(id=existing_fragments_note.id)
                .values(data=_pack_note_md_payload(merged_library), updated_at=int(time.time_ns()))
            )
            report['id_map']['notes'][fragments_note.get('id') if fragments_note else 'orphan-vault-fragments'] = (
                existing_fragments_note.id
            )
            note_status['overwritten'] += 1
        else:
            new_id = str(uuid.uuid4())
            db.add(
                Note(
                    id=new_id,
                    user_id=user.id,
                    title=FRAGMENTS_NOTE_TITLE,
                    data=_pack_note_md_payload(incoming_fragment_library),
                    meta=(fragments_note or {}).get('meta'),
                    is_pinned=(fragments_note or {}).get('is_pinned') or False,
                    created_at=(fragments_note or {}).get('created_at') or int(time.time_ns()),
                    updated_at=(fragments_note or {}).get('updated_at') or int(time.time_ns()),
                )
            )
            report['id_map']['notes'][fragments_note.get('id') if fragments_note else 'orphan-vault-fragments'] = new_id
            note_status['inserted'] += 1
            fragment_report = {
                'inserted': len(incoming_fragment_library.get('fragments') or []),
                'overwritten': orphan_report['overwritten'],
                'conflicts': orphan_report['conflicts'],
            }

    for memory in _read_jsonl(pack_dir / 'memories' / 'memories.jsonl'):
        new_id = str(uuid.uuid4())
        db.add(
            Memory(
                id=new_id,
                user_id=user.id,
                content=memory.get('content') or '',
                created_at=memory.get('created_at') or int(time.time()),
                updated_at=memory.get('updated_at') or int(time.time()),
            )
        )
        report['id_map']['memories'][memory.get('id')] = new_id

    for tag in _read_json(pack_dir / 'chats' / 'tags.json', []):
        await db.merge(
            Tag(
                id=tag.get('id') or (tag.get('name') or '').replace(' ', '_').lower(),
                user_id=user.id,
                name=tag.get('name') or tag.get('id'),
                meta=tag.get('meta'),
            )
        )

    await db.commit()

    report['imported'] = {
        'chats': len(imported_chats),
        'notes': note_status['inserted'],
        'fragments': fragment_report['inserted'],
        'orphan_drawer_cards': len(orphan_vault_cards),
        'memories': len(_read_jsonl(pack_dir / 'memories' / 'memories.jsonl')),
        'folders': len(folder_id_map),
    }
    report['overwritten'] = {'notes': note_status['overwritten'], 'fragments': fragment_report['overwritten']}
    report['skipped'] = {'fragment_conflicts': fragment_report['conflicts']}

    if form_data.rebuild_memory_vectors:
        try:
            await ASYNC_VECTOR_DB_CLIENT.delete_collection(f'user-memory-{user.id}')
            result = await db.execute(select(Memory).filter_by(user_id=user.id))
            user_memories = result.scalars().all()
            if user_memories:
                vectors = await asyncio.gather(
                    *[request.app.state.EMBEDDING_FUNCTION(memory.content, user=user) for memory in user_memories]
                )
                await ASYNC_VECTOR_DB_CLIENT.upsert(
                    collection_name=f'user-memory-{user.id}',
                    items=[
                        {
                            'id': memory.id,
                            'text': memory.content,
                            'vector': vectors[index],
                            'metadata': {
                                'created_at': memory.created_at,
                                'updated_at': memory.updated_at,
                            },
                        }
                        for index, memory in enumerate(user_memories)
                    ],
                )
        except Exception as e:
            log.warning(f'Failed to rebuild memory vector collection: {e}')
            report['errors'].append(f'Failed to rebuild memory vector collection: {e}')

    _write_json(pack_dir / 'logs' / 'import-report.json', report)
    return report


@router.post('/import-files')
async def import_archive_pack_files(
    request: Request,
    form_data: ArchiveImportFilesRequest,
    user=Depends(get_archive_user),
    db: AsyncSession = Depends(get_async_session),
):
    pack_name = _safe_pack_name(form_data.pack_name)
    if form_data.mode == 'replace' and form_data.confirm_text != pack_name:
        raise HTTPException(status_code=400, detail='Replacement import requires confirmation text')

    root = _safe_root(DEFAULT_ROOT_DIR)
    temp_dir = (root / f'.incoming-{uuid.uuid4()}-{pack_name}').resolve()
    if root not in [temp_dir, *temp_dir.parents]:
        raise HTTPException(status_code=400, detail='Invalid archive pack path')

    try:
        for relative_path, text in form_data.files.items():
            rel = PurePosixPath(relative_path)
            if rel.is_absolute() or '..' in rel.parts or not rel.name:
                raise HTTPException(status_code=400, detail='Invalid archive file path')
            target = (temp_dir / Path(*rel.parts)).resolve()
            if temp_dir not in [target, *target.parents]:
                raise HTTPException(status_code=400, detail='Invalid archive file path')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding='utf-8')

        manifest = _read_json(temp_dir / 'manifest.json', {})
        if manifest.get('app') != ARCHIVE_APP_ID:
            raise HTTPException(status_code=400, detail='Selected folder is not a memory archive pack')

        import_request = ArchiveImportRequest(
            root_dir=DEFAULT_ROOT_DIR,
            pack_name=temp_dir.name,
            mode=form_data.mode,
            conflict=form_data.conflict,
            rebuild_memory_vectors=form_data.rebuild_memory_vectors,
            confirm_text=temp_dir.name if form_data.mode == 'replace' else form_data.confirm_text,
        )
        report = await import_archive_pack(request, import_request, user, db)
        report['source_pack_name'] = pack_name
        return report
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post('/clear/inspect')
async def inspect_clear_archive_pack(
    form_data: ArchiveClearRequest,
    user=Depends(get_archive_user),
    db: AsyncSession = Depends(get_async_session),
):
    data = await _collect_archive_data(user.id, form_data.scope, db)
    counts = _counts(data)
    return {
        'counts': counts,
        'requires_confirmation': True,
        'confirmation_text': '清空所有使用资料',
        'backup_pack_name': form_data.backup_pack_name or f'auto-backup-before-clear-{_default_pack_name()}',
    }


@router.post('/clear')
async def clear_archive_data(
    form_data: ArchiveClearRequest,
    user=Depends(get_archive_user),
    db: AsyncSession = Depends(get_async_session),
):
    if form_data.confirm_text != '清空所有使用资料':
        raise HTTPException(status_code=400, detail='Clear requires confirmation text')

    backup = None
    if form_data.create_backup_before_clear:
        backup = await _export_pack(
            user.id,
            ArchivePackRequest(
                pack_name=form_data.backup_pack_name or f'auto-backup-before-clear-{_default_pack_name()}',
                scope=form_data.scope,
            ),
            db,
        )

    counts_before = _counts(await _collect_archive_data(user.id, form_data.scope, db))
    await _clear_user_data(user.id, form_data.scope, db)
    report = {'status': 'ok', 'cleared': counts_before, 'backup': backup}

    clear_log_dir = _safe_root(DEFAULT_ROOT_DIR) / 'clear-logs'
    clear_log_dir.mkdir(parents=True, exist_ok=True)
    _write_json(clear_log_dir / f'clear-report-{int(time.time())}.json', report)
    return report


@router.delete('/{pack_name}')
async def delete_archive_pack(pack_name: str, root_dir: str = DEFAULT_ROOT_DIR, user=Depends(get_archive_user)):
    pack_dir = _safe_pack_dir(root_dir, pack_name)
    if not pack_dir.exists():
        raise HTTPException(status_code=404, detail='Archive pack not found')
    shutil.rmtree(pack_dir)
    return True


async def _clear_user_data(user_id: str, scope: ArchiveScope, db: AsyncSession):
    if scope.chats or scope.archived_chats:
        stmt = select(Chat.id).filter_by(user_id=user_id)
        if scope.chats and not scope.archived_chats:
            stmt = stmt.filter(Chat.archived.is_(False))
        elif scope.archived_chats and not scope.chats:
            stmt = stmt.filter(Chat.archived.is_(True))

        result = await db.execute(stmt)
        chat_ids = [row[0] for row in result.all()]
        if chat_ids:
            await db.execute(delete(ChatMessage).filter(ChatMessage.chat_id.in_(chat_ids)))
            await db.execute(delete(Chat).filter(Chat.id.in_(chat_ids)))

    if scope.notes or scope.memory_vaults or scope.fragments:
        result = await db.execute(select(Note).filter_by(user_id=user_id))
        delete_note_ids = []
        for note in result.scalars().all():
            if note.title == FRAGMENTS_NOTE_TITLE and scope.fragments:
                delete_note_ids.append(note.id)
            elif _is_vault_note(note.title) and scope.memory_vaults:
                delete_note_ids.append(note.id)
            elif _is_plain_note(note.title) and scope.notes:
                delete_note_ids.append(note.id)
        if delete_note_ids:
            await db.execute(delete(Note).filter(Note.id.in_(delete_note_ids)))

    if scope.memories:
        await db.execute(delete(Memory).filter_by(user_id=user_id))
        try:
            await ASYNC_VECTOR_DB_CLIENT.delete_collection(f'user-memory-{user_id}')
        except Exception as e:
            log.warning(f'Failed to delete memory vector collection: {e}')

    if scope.folders:
        await db.execute(delete(Folder).filter_by(user_id=user_id))

    if scope.tags:
        await db.execute(delete(Tag).filter_by(user_id=user_id))

    await db.commit()
