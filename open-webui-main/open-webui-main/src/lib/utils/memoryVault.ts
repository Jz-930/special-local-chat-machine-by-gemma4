import { v4 as uuidv4 } from 'uuid';

export const FRAGMENTS_NOTE_TITLE = 'MemoryVault_Global_Fragments';
export const MEMORY_VAULT_NOTE_PREFIX = 'MemoryVault_';
export const ISOLATED_DRAWER_GROUP_ID = 'system_isolated_drawers';

export type FragmentGroup = {
	id: string;
	name: string;
	color: string;
	order: number;
	created_at: number;
	updated_at: number;
	system?: boolean;
};

export type VaultCard = {
	id: string;
	title?: string;
	content?: string;
	enabled?: boolean;
	group_id?: string | null;
	order?: number;
	created_at?: number;
	updated_at?: number;
	source_fragment_id?: string;
	source_chat_id?: string;
	source_card_id?: string;
	source_vault_chat_id?: string;
	source_vault_title?: string;
	[key: string]: unknown;
};

export type FragmentLibrary = {
	version: 2;
	groups: FragmentGroup[];
	fragments: VaultCard[];
};

export type UpsertReport = {
	inserted: number;
	overwritten: number;
	conflicts: VaultCard[];
};

const DEFAULT_GROUP_COLORS = [
	'#3b82f6',
	'#22c55e',
	'#f59e0b',
	'#ef4444',
	'#8b5cf6',
	'#14b8a6',
	'#ec4899',
	'#64748b'
];

export function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

export function createFragmentGroup(name: string, order = 0, color?: string): FragmentGroup {
	const timestamp = nowSeconds();
	return {
		id: uuidv4(),
		name: name.trim() || '新分组',
		color: color || DEFAULT_GROUP_COLORS[order % DEFAULT_GROUP_COLORS.length],
		order,
		created_at: timestamp,
		updated_at: timestamp
	};
}

export function createIsolatedDrawerGroup(order = 0): FragmentGroup {
	const timestamp = nowSeconds();
	return {
		id: ISOLATED_DRAWER_GROUP_ID,
		name: '孤立抽屉',
		color: '#f97316',
		order,
		created_at: timestamp,
		updated_at: timestamp,
		system: true
	};
}

export function packCardsToNoteData(cards: VaultCard[]) {
	return {
		content: {
			json: null,
			html: '',
			md: JSON.stringify(cards)
		}
	};
}

export function packFragmentLibraryToNoteData(library: FragmentLibrary) {
	return {
		content: {
			json: null,
			html: '',
			md: JSON.stringify(normalizeFragmentLibrary(library))
		}
	};
}

export function unpackCardsFromNoteData(noteData: unknown): VaultCard[] {
	const data = parseNoteData(noteData);
	const md = data?.content?.md;

	if (typeof md === 'string' && md.trim()) {
		const parsed = parseJson(md);
		if (Array.isArray(parsed)) {
			return normalizeCards(parsed);
		}
		if (parsed?.version === 2 && Array.isArray(parsed.fragments)) {
			return normalizeCards(parsed.fragments);
		}
	}

	if (Array.isArray(data?.cards)) {
		return normalizeCards(data.cards);
	}

	if (data?.version === 2 && Array.isArray(data.fragments)) {
		return normalizeCards(data.fragments);
	}

	return [];
}

export function unpackFragmentLibraryFromNoteData(noteData: unknown): FragmentLibrary {
	const data = parseNoteData(noteData);
	const md = data?.content?.md;

	if (typeof md === 'string' && md.trim()) {
		const parsed = parseJson(md);
		if (parsed?.version === 2) {
			return normalizeFragmentLibrary(parsed);
		}
		if (Array.isArray(parsed)) {
			return normalizeFragmentLibrary({ version: 2, groups: [], fragments: parsed });
		}
	}

	if (data?.version === 2) {
		return normalizeFragmentLibrary(data);
	}

	if (Array.isArray(data?.cards)) {
		return normalizeFragmentLibrary({ version: 2, groups: [], fragments: data.cards });
	}

	return normalizeFragmentLibrary({ version: 2, groups: [], fragments: [] });
}

export function normalizeFragmentLibrary(input: Partial<FragmentLibrary>): FragmentLibrary {
	const groups = normalizeGroups(input.groups || []);
	const groupIds = new Set(groups.map((group) => group.id));
	const fragments = normalizeCards(input.fragments || []).map((fragment, index) => ({
		...fragment,
		group_id: fragment.group_id && groupIds.has(fragment.group_id) ? fragment.group_id : null,
		order: typeof fragment.order === 'number' ? fragment.order : index
	}));

	return {
		version: 2,
		groups: groups.sort((a, b) => a.order - b.order),
		fragments: fragments.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
	};
}

export function ensureIsolatedDrawerGroup(library: FragmentLibrary): FragmentLibrary {
	if (library.groups.some((group) => group.id === ISOLATED_DRAWER_GROUP_ID)) {
		return library;
	}

	return normalizeFragmentLibrary({
		...library,
		groups: [...library.groups, createIsolatedDrawerGroup(library.groups.length)]
	});
}

export function normalizeTextForHash(value: string | null | undefined) {
	return (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().replace(/[ \t]+/g, ' ');
}

export function exactContentKey(card: Pick<VaultCard, 'title' | 'content'>) {
	return `${stableHash(normalizeTextForHash(card.title))}:${stableHash(normalizeTextForHash(card.content))}`;
}

export function contentOnlyKey(card: Pick<VaultCard, 'content'>) {
	return stableHash(normalizeTextForHash(card.content));
}

export function upsertFragmentsWithExactOverwrite(
	library: FragmentLibrary,
	incomingCards: VaultCard[],
	groupId: string | null = null
): { library: FragmentLibrary; report: UpsertReport } {
	const timestamp = nowSeconds();
	const next = normalizeFragmentLibrary(library);
	const fragments = [...next.fragments];
	const report: UpsertReport = { inserted: 0, overwritten: 0, conflicts: [] };

	for (const incoming of normalizeCards(incomingCards)) {
		const candidate = {
			...incoming,
			id: incoming.id || uuidv4(),
			group_id: groupId,
			updated_at: timestamp,
			created_at: incoming.created_at || timestamp
		};
		const exactKey = exactContentKey(candidate);
		const exactIndex = fragments.findIndex((fragment) => exactContentKey(fragment) === exactKey);

		if (exactIndex >= 0) {
			fragments[exactIndex] = {
				...fragments[exactIndex],
				...candidate,
				id: fragments[exactIndex].id,
				group_id: groupId ?? fragments[exactIndex].group_id ?? null,
				created_at: fragments[exactIndex].created_at,
				updated_at: timestamp
			};
			report.overwritten += 1;
			continue;
		}

		const titleConflict = fragments.some(
			(fragment) =>
				normalizeTextForHash(fragment.title).toLowerCase() ===
					normalizeTextForHash(candidate.title).toLowerCase() &&
				contentOnlyKey(fragment) !== contentOnlyKey(candidate)
		);

		if (titleConflict) {
			report.conflicts.push(candidate);
			continue;
		}

		fragments.unshift({
			...candidate,
			id: uuidv4(),
			order: -report.inserted - 1
		});
		report.inserted += 1;
	}

	return {
		library: normalizeFragmentLibrary({ ...next, fragments }),
		report
	};
}

export function moveFragmentsToGroup(library: FragmentLibrary, ids: Set<string>, groupId: string | null) {
	const timestamp = nowSeconds();
	return normalizeFragmentLibrary({
		...library,
		fragments: library.fragments.map((fragment) =>
			ids.has(fragment.id) ? { ...fragment, group_id: groupId, updated_at: timestamp } : fragment
		)
	});
}

export function deleteFragments(library: FragmentLibrary, ids: Set<string>) {
	return normalizeFragmentLibrary({
		...library,
		fragments: library.fragments.filter((fragment) => !ids.has(fragment.id))
	});
}

export function deleteGroup(library: FragmentLibrary, groupId: string) {
	return normalizeFragmentLibrary({
		...library,
		groups: library.groups.filter((group) => group.id !== groupId),
		fragments: library.fragments.map((fragment) =>
			fragment.group_id === groupId ? { ...fragment, group_id: null, updated_at: nowSeconds() } : fragment
		)
	});
}

function parseNoteData(noteData: unknown): any {
	if (typeof noteData === 'string') {
		return parseJson(noteData) || {};
	}

	return noteData || {};
}

function parseJson(value: string): any {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function normalizeGroups(groups: Partial<FragmentGroup>[]): FragmentGroup[] {
	const seen = new Set<string>();
	return groups
		.map((group, index) => {
			const id = group.id || uuidv4();
			if (seen.has(id)) {
				return null;
			}
			seen.add(id);
			const timestamp = nowSeconds();
			return {
				id,
				name: group.name || '未命名分组',
				color: group.color || DEFAULT_GROUP_COLORS[index % DEFAULT_GROUP_COLORS.length],
				order: typeof group.order === 'number' ? group.order : index,
				created_at: group.created_at || timestamp,
				updated_at: group.updated_at || timestamp,
				system: group.system === true
			};
		})
		.filter(Boolean) as FragmentGroup[];
}

function normalizeCards(cards: Partial<VaultCard>[]): VaultCard[] {
	const timestamp = nowSeconds();
	return cards.map((card, index) => ({
		...card,
		id: card.id || uuidv4(),
		title: card.title || '',
		content: card.content || '',
		enabled: card.enabled === false ? false : true,
		group_id: card.group_id || null,
		order: typeof card.order === 'number' ? card.order : index,
		created_at: card.created_at || timestamp,
		updated_at: card.updated_at || timestamp
	}));
}

function stableHash(value: string) {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}
