<script>
	// @ts-nocheck
	import { manualMemoryText, showMemoryVault, chatId } from '$lib/stores';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { v4 as uuidv4 } from 'uuid';
	import Sortable from 'sortablejs';
	import { searchNotes, getNotes, createNewNote, updateNoteById, getNoteById } from '$lib/apis/notes';
	import { estimateTextTokens, getContextTokenProfile } from '$lib/utils/contextTokens';
	import {
		FRAGMENTS_NOTE_TITLE,
		normalizeFragmentLibrary,
		packFragmentLibraryToNoteData,
		unpackFragmentLibraryFromNoteData,
		upsertFragmentsWithExactOverwrite
	} from '$lib/utils/memoryVault';

	let cards = [];
	let editingCardId = null;
	let currentChatId = null;
	let currentNoteId = null;
	let saveDebounceTimer = null;
	let isMigratingOrLoading = false;
	export let selectedModels = [];

	// Fragments Library State
	let globalFragmentsNoteId = null;
	let globalFragmentsLibrary = { version: 2, groups: [], fragments: [] };
	let globalFragments = [];
	let showFragmentsView = false;
	let isLoadingFragments = false;
	let selectedFragmentIds = new Set();
	let cardSelectionMode = false;
	let selectedCardIds = new Set();

	async function loadGlobalFragments() {
		isLoadingFragments = true;
		try {
			const allNotes = await getNotes(localStorage.token, true);
			if (allNotes && Array.isArray(allNotes)) {
				const listNote = allNotes.find(item => item.title === FRAGMENTS_NOTE_TITLE);
				if (listNote) {
					globalFragmentsNoteId = listNote.id;
					const fullNote = await getNoteById(localStorage.token, listNote.id);
					if (fullNote) {
						globalFragmentsLibrary = unpackFragmentLibraryFromNoteData(fullNote.data);
						globalFragments = globalFragmentsLibrary.fragments;
					}
				} else {
					globalFragmentsNoteId = null;
					globalFragmentsLibrary = { version: 2, groups: [], fragments: [] };
					globalFragments = [];
				}
			} else {
				globalFragmentsNoteId = null;
				globalFragmentsLibrary = { version: 2, groups: [], fragments: [] };
				globalFragments = [];
			}
		} catch (error) {
			console.error("Failed to load fragments", error);
		} finally {
			isLoadingFragments = false;
		}
	}

	async function saveCardToFragments(card, e) {
		if (e) e.stopPropagation();
		await saveCardsToFragments([card], e);
	}

	async function saveCardsToFragments(cardsToSave, e) {
		if (e) e.stopPropagation();
		if (!cardsToSave || cardsToSave.length === 0) return;
		await loadGlobalFragments();

		const { library: nextLibrary, report } = upsertFragmentsWithExactOverwrite(
			globalFragmentsLibrary,
			cardsToSave.map((card) => ({
				...card,
				source_chat_id: $chatId,
				source_card_id: card.id
			}))
		);

		try {
			await persistGlobalFragments(nextLibrary);
			selectedCardIds = new Set();
			cardSelectionMode = false;
			alert(`已保存到碎片库：新增 ${report.inserted}，完全一致覆盖 ${report.overwritten}。`);
		} catch (error) {
			console.error("Save to fragments failed", error);
			alert("保存失败 (Failed to save)");
		}
	}

	async function persistGlobalFragments(nextLibrary) {
		const normalized = normalizeFragmentLibrary(nextLibrary);
		if (globalFragmentsNoteId) {
			await updateNoteById(localStorage.token, globalFragmentsNoteId, {
				title: FRAGMENTS_NOTE_TITLE,
				data: packFragmentLibraryToNoteData(normalized)
			});
		} else {
			const res = await createNewNote(localStorage.token, {
				title: FRAGMENTS_NOTE_TITLE,
				data: packFragmentLibraryToNoteData(normalized),
				meta: null,
				access_grants: []
			});
			if (res && res.id) globalFragmentsNoteId = res.id;
		}
		globalFragmentsLibrary = normalized;
		globalFragments = normalized.fragments;
	}

	function importFragment(fragment) {
		const newCard = { ...fragment, id: uuidv4() };
		saveCards([...cards, newCard], $chatId);
		showFragmentsView = false;
	}

	function importSelectedFragments() {
		const selected = globalFragments.filter((fragment) => selectedFragmentIds.has(fragment.id));
		if (selected.length === 0) return;
		const newCards = selected.map((fragment) => ({
			...fragment,
			id: uuidv4(),
			source_fragment_id: fragment.id
		}));
		saveCards([...cards, ...newCards], $chatId);
		selectedFragmentIds = new Set();
		showFragmentsView = false;
	}

	function toggleFragmentSelection(id, e) {
		if (e) e.stopPropagation();
		const next = new Set(selectedFragmentIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedFragmentIds = next;
	}

	function toggleCardSelection(id, e) {
		if (e) e.stopPropagation();
		const next = new Set(selectedCardIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedCardIds = next;
	}

	function selectAllCards() {
		selectedCardIds = new Set(cards.map((card) => card.id));
		cardSelectionMode = true;
	}

	function deleteSelectedCards() {
		if (selectedCardIds.size === 0) return;
		if (!confirm(`确定删除选中的 ${selectedCardIds.size} 张卡片吗？`)) return;
		saveCards(cards.filter((card) => !selectedCardIds.has(card.id)), $chatId);
		selectedCardIds = new Set();
		cardSelectionMode = false;
	}

	function saveSelectedCardsToFragments(e) {
		const selected = cards.filter((card) => selectedCardIds.has(card.id));
		saveCardsToFragments(selected, e);
	}

	let tokenProfile = getContextTokenProfile();
	$: tokenProfile = getContextTokenProfile(
		Array.isArray(selectedModels) ? (selectedModels[0] ?? '') : (selectedModels ?? '')
	);

	function estimateCardTokens(card) {
		if (card.enabled === false) return 0;
		return estimateTextTokens(`### ${card.title || ''}\n${card.content || ''}`, tokenProfile);
	}

	// Derived total token load for the exact Vault text injected into the prompt.
	$: totalTokens = estimateTextTokens(compileCardsToText(cards), tokenProfile);

	// Load vault text whenever the chat room changes (or initiates)
	$: if ($chatId !== currentChatId) {
		migrateAndLoadVault($chatId);
		currentChatId = $chatId;
	}

	function compileCardsToText(cardsArray) {
		return cardsArray
			.filter(c => c.enabled !== false && (c.content || '').trim() !== '')
			.map(c => `### ${c.title || '未命名设定'}\n${c.content}`)
			.join('\n\n---\n\n');
	}

	function saveCards(newCards, targetChatId) {
		cards = newCards;
		// Sync with the backend payload store
		manualMemoryText.set(compileCardsToText(cards));

		// Immediate local backup (critical for drafts where targetChatId is '')
		try {
			const cardVaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_cards_byChat') || '{}');
			cardVaults[targetChatId || ''] = cards;
			localStorage.setItem('manualMemoryVAULT_cards_byChat', JSON.stringify(cardVaults));
		} catch (e) {
			console.error("Local save failed", e);
		}

		clearTimeout(saveDebounceTimer);
		saveDebounceTimer = setTimeout(() => {
			if (!isMigratingOrLoading) {
				syncVaultToBackend(newCards, targetChatId);
			}
		}, 1000);
	}

	// Helper: pack cards into the Notes API data format
	function packCardsToNoteData(cardsArray) {
		const serialized = JSON.stringify(cardsArray);
		return {
			content: {
				json: null,
				html: '',
				md: serialized
			}
		};
	}

	// Helper: unpack cards from Notes API data format
	function unpackCardsFromNoteData(noteData) {
		let data = noteData;
		if (typeof data === 'string') {
			try { data = JSON.parse(data); } catch (e) { return []; }
		}
		// Try new format: cards serialized as JSON in md field
		const md = data?.content?.md;
		if (md && md.trim().startsWith('[')) {
			try {
				const parsed = JSON.parse(md);
				if (Array.isArray(parsed)) return parsed;
			} catch (e) { /* not valid JSON, fall through */ }
		}
		// Fallback: try legacy format where cards were at root (may exist if backend preserved it)
		if (data?.cards && Array.isArray(data.cards)) {
			return data.cards;
		}
		return [];
	}

	async function syncVaultToBackend(cardsToSave, targetChatId) {
		if (!targetChatId) return;
		const noteTitle = `MemoryVault_${targetChatId}`;
		const noteData = packCardsToNoteData(cardsToSave);

		try {
			if (currentNoteId) {
				await updateNoteById(localStorage.token, currentNoteId, {
					title: noteTitle,
					data: noteData
				});
			} else {
				const res = await createNewNote(localStorage.token, {
					title: noteTitle,
					data: noteData,
					meta: null,
					access_grants: []
				});
				if (res && res.id) {
					currentNoteId = res.id;
				}
			}
		} catch (error) {
			console.error("Failed to sync Memory Vault to backend", error);
		}
	}

	async function migrateAndLoadVault(newId) {
		if (!newId) return;
		isMigratingOrLoading = true;

		try {
			// 1. Check Backend first
			const allNotes = await getNotes(localStorage.token, true);
			let backendListNote = null;
			if (allNotes && Array.isArray(allNotes)) {
				backendListNote = allNotes.find(item => item.title === `MemoryVault_${newId}`);
			}

			if (backendListNote) {
				// Found in backend list, fetch full note to avoid truncation
				currentNoteId = backendListNote.id;
				const fullBackendNote = await getNoteById(localStorage.token, backendListNote.id);
				const loadedCards = fullBackendNote ? unpackCardsFromNoteData(fullBackendNote.data) : [];
				if (loadedCards.length > 0) {
					cards = loadedCards;
					manualMemoryText.set(compileCardsToText(cards));
					editingCardId = null;
					isMigratingOrLoading = false;
					return;
				}
				// Backend note exists but is empty (broken migration) - fall through to localStorage recovery
			}

			// 2. Not found in backend (or backend note is empty), look in localStorage
			if (!currentNoteId) {
				currentNoteId = backendListNote?.id || null;
			}
			const cardVaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_cards_byChat') || '{}');

			// Merge unsaved draft in '' if applicable
			if (newId !== '' && cardVaults[''] && cardVaults[''].length > 0) {
				if (!cardVaults[newId] || cardVaults[newId].length === 0) {
					cardVaults[newId] = [...cardVaults['']];
				}
				// Keep the draft around, just copy it
				localStorage.setItem('manualMemoryVAULT_cards_byChat', JSON.stringify(cardVaults));
			}

			let loadedCards = cardVaults[newId];

			// Legacy Migration from old single-string vault (copy, don't delete original)
			if (!loadedCards || loadedCards.length === 0) {
				const legacyVaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_byChat') || '{}');
				const legacyText = legacyVaults[newId] || '';
				if (legacyText.trim() !== '') {
					loadedCards = [{
						id: uuidv4(),
						title: '导入的旧设定',
						content: legacyText
					}];
					// Do NOT delete legacy data - keep as backup
				} else {
					loadedCards = [];
				}
			}

			cards = loadedCards || [];
			manualMemoryText.set(compileCardsToText(cards));
			editingCardId = null;

			// Sync to backend (duplicate, never delete local source)
			if (cards.length > 0) {
				await syncVaultToBackend(cards, newId);
			}

		} catch (e) {
			console.error("Failed to load or migrate vault", e);
			// Fallback to localStorage to prevent data loss on API failure
			try {
				const cardVaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_cards_byChat') || '{}');
				if (cardVaults[newId] && cardVaults[newId].length > 0) {
					cards = cardVaults[newId];
					manualMemoryText.set(compileCardsToText(cards));
				} else {
					cards = [];
				}
			} catch (fallbackError) {
				cards = [];
			}
		} finally {
			isMigratingOrLoading = false;
		}
	}

	function addNewCard() {
		const newCard = { id: uuidv4(), title: '', content: '' };
		saveCards([...cards, newCard], $chatId);
		editingCardId = newCard.id; // jump straight to edit view
	}

	function deleteCard(id) {
		if (confirm("确定要删除这条设定吗？(Are you sure you want to delete this setting?)")) {
			saveCards(cards.filter(c => c.id !== id), $chatId);
		}
	}

	function updateEditingCardTitle(e) {
		const newCards = cards.map(c => {
			if (c.id === editingCardId) {
				return { ...c, title: e.target.value };
			}
			return c;
		});
		saveCards(newCards, $chatId);
	}

	function updateEditingCardContent(e) {
		const newCards = cards.map(c => {
			if (c.id === editingCardId) {
				return { ...c, content: e.target.value };
			}
			return c;
		});
		saveCards(newCards, $chatId);
	}

	function toggleCardEnabled(e, id) {
		e.stopPropagation();
		const newCards = cards.map(c => {
			if (c.id === id) {
				return { ...c, enabled: c.enabled === false ? true : false };
			}
			return c;
		});
		saveCards(newCards, $chatId);
	}

	function initSortableCards(node) {
		const sortable = new Sortable(node, {
			animation: 150,
			onUpdate: (event) => {
				const current = [...cards];
				const oldIndex = event.oldIndex;
				const newIndex = event.newIndex;
				const [moved] = current.splice(oldIndex, 1);
				current.splice(newIndex, 0, moved);
				saveCards(current, $chatId);
			}
		});
		return { destroy() { sortable.destroy(); } };
	}

	function initSortableFragments(node) {
		const sortable = new Sortable(node, {
			animation: 150,
			onUpdate: async (event) => {
				const current = [...globalFragments];
				const oldIndex = event.oldIndex;
				const newIndex = event.newIndex;
				const [moved] = current.splice(oldIndex, 1);
				current.splice(newIndex, 0, moved);

				await persistGlobalFragments({
					...globalFragmentsLibrary,
					fragments: current.map((fragment, order) => ({ ...fragment, order }))
				});
			}
		});
		return { destroy() { sortable.destroy(); } };
	}
</script>

{#if $showMemoryVault}
	<div
		transition:slide={{ duration: 250, axis: 'x' }}
		class="h-[100dvh] w-full sm:w-80 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl z-50 fixed right-0 top-0 bottom-0"
	>
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
			<div class="flex items-center gap-2">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
				</svg>
				<span class="text-sm font-semibold text-gray-200">设定面板 (Memory Vault)</span>
			</div>

			<button
				on:click={() => showMemoryVault.set(false)}
				class="text-gray-400 hover:text-white transition-colors p-1"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
			</button>
		</div>

		<!-- Body -->
		<div class="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
			{#if showFragmentsView}
				<!-- FRAGMENTS VIEW -->
				<div class="flex flex-col h-full fade-in" transition:fade={{duration: 150}}>
					<button on:click={() => showFragmentsView = false} class="flex items-center text-gray-400 hover:text-white mb-4 text-sm transition">
						<svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
						返回记忆抽屉 (Back)
					</button>
					<div class="text-xs text-gray-400 mb-3 border-b border-gray-700 pb-2">
						全局碎片库 (Global Fragments)<br/>
						点击单条导入，或多选后批量导入当前对话。
					</div>

					{#if isLoadingFragments}
						<div class="text-center text-gray-500 text-sm mt-10">加载中... (Loading)</div>
					{:else}
						<div class="flex flex-wrap items-center gap-2 mb-3">
							<button
								class="px-2 py-1 rounded border border-gray-700 text-xs text-gray-300 hover:border-gray-500"
								on:click={() => selectedFragmentIds = new Set(globalFragments.map((fragment) => fragment.id))}
							>
								全选
							</button>
							<button
								class="px-2 py-1 rounded border border-gray-700 text-xs text-gray-300 hover:border-gray-500"
								on:click={() => selectedFragmentIds = new Set()}
							>
								清空选择
							</button>
							<button
								class="px-2 py-1 rounded bg-blue-600 text-white text-xs disabled:opacity-40"
								disabled={selectedFragmentIds.size === 0}
								on:click={importSelectedFragments}
							>
								导入所选 {selectedFragmentIds.size}
							</button>
						</div>
						<div use:initSortableFragments>
							{#each globalFragments as fragment (fragment.id)}
								<div class="bg-gray-800 border border-gray-700 rounded-lg p-3 transition mb-3 hover:border-blue-500/50">
									<div class="flex items-start gap-2 mb-1">
										<input
											type="checkbox"
											class="mt-0.5"
											checked={selectedFragmentIds.has(fragment.id)}
											on:click={(e) => toggleFragmentSelection(fragment.id, e)}
										/>
										<div class="min-w-0 flex-1">
											<h3 class="text-gray-200 font-medium text-sm truncate">{fragment.title || '未命名设定'}</h3>
											<div class="text-[10px] text-gray-500">
												{globalFragmentsLibrary.groups.find((group) => group.id === fragment.group_id)?.name || '未分组'}
											</div>
										</div>
									</div>
									<p class="text-xs text-gray-400 line-clamp-3 leading-relaxed whitespace-pre-wrap mb-2">{fragment.content}</p>
									<button
										on:click={() => importFragment(fragment)}
										class="w-full py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded transition text-xs font-medium flex items-center justify-center gap-1"
									>
										<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
										</svg>
										导入当前对话 (Import)
									</button>
								</div>
							{/each}
						</div>
						{#if globalFragments.length === 0}
							<div class="text-center text-gray-500 text-sm mt-10">碎片库是空的<br/>请返回主列表点击"⭐"收藏卡片</div>
						{/if}
					{/if}
				</div>
			{:else if editingCardId}
				<!-- EDIT VIEW -->
				{@const activeCard = cards.find(c => c.id === editingCardId)}
				<div class="flex flex-col h-full fade-in" transition:fade={{duration: 150}}>
					<button on:click={() => editingCardId = null} class="flex items-center text-gray-400 hover:text-white mb-4 text-sm transition">
						<svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
						返回卡片列表
					</button>

					<input
						type="text"
						value={activeCard?.title || ''}
						on:input={updateEditingCardTitle}
						placeholder="卡片标题 (如：主角身世)"
						class="w-full bg-gray-800 text-white rounded-md p-2 mb-3 outline-none border border-gray-700 focus:border-yellow-500 transition text-sm"
					/>

					<textarea
						value={activeCard?.content || ''}
						on:input={updateEditingCardContent}
						class="w-full flex-1 bg-gray-800/50 text-gray-300 text-sm resize-none rounded-md p-3 outline-none border border-gray-700 focus:border-yellow-500 transition custom-scrollbar"
						placeholder="在此写下具体的设定细节..."
					></textarea>
				</div>
			{:else}
				<!-- LIST VIEW -->
				<div class="flex flex-col gap-3 fade-in" transition:fade={{duration: 150}}>
					<div class="text-xs text-gray-500 mb-1">
						这些卡片将被转化为系统提示词，作为最高优先级规则永久注入当前对话中。
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<button
							class="px-2 py-1 rounded border border-gray-700 text-xs text-gray-300 hover:border-gray-500"
							on:click={() => {
								cardSelectionMode = !cardSelectionMode;
								if (!cardSelectionMode) selectedCardIds = new Set();
							}}
						>
							{cardSelectionMode ? '退出多选' : '多选'}
						</button>
						{#if cardSelectionMode}
							<button class="px-2 py-1 rounded border border-gray-700 text-xs text-gray-300 hover:border-gray-500" on:click={selectAllCards}>
								全选
							</button>
							<button
								class="px-2 py-1 rounded bg-yellow-600/80 text-white text-xs disabled:opacity-40"
								disabled={selectedCardIds.size === 0}
								on:click={saveSelectedCardsToFragments}
							>
								保存所选到碎片库 {selectedCardIds.size}
							</button>
							<button
								class="px-2 py-1 rounded bg-red-600 text-white text-xs disabled:opacity-40"
								disabled={selectedCardIds.size === 0}
								on:click={deleteSelectedCards}
							>
								删除所选
							</button>
						{/if}
					</div>

					<div use:initSortableCards class="flex flex-col gap-3">
						{#each cards as card (card.id)}
							<div
								class="bg-gray-800 border border-gray-700 rounded-lg p-3 transition group cursor-pointer relative {card.enabled !== false ? 'hover:border-yellow-500/50' : 'opacity-40 grayscale hover:opacity-60'}"
								on:click={(e) => {
									if (cardSelectionMode) toggleCardSelection(card.id, e);
									else editingCardId = card.id;
								}}
							>
								<div class="flex justify-between items-start mb-1">
									<div class="flex items-center gap-2 max-w-[85%]">
										{#if cardSelectionMode}
											<input
												type="checkbox"
												checked={selectedCardIds.has(card.id)}
												on:click={(e) => toggleCardSelection(card.id, e)}
											/>
										{/if}
										<button
											on:click={(e) => toggleCardEnabled(e, card.id)}
											class="relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {card.enabled !== false ? 'bg-yellow-500' : 'bg-gray-600'}"
											title={card.enabled !== false ? '点击卸载 (Unmount)' : '点击挂载 (Mount)'}
										>
											<span class="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {card.enabled !== false ? 'translate-x-3' : 'translate-x-0'}"></span>
										</button>
										<h3 class="text-gray-200 font-medium text-sm truncate {card.enabled !== false ? '' : 'line-through text-gray-400'}">{card.title || '未命名设定'}</h3>
									</div>

									<button
										on:click|stopPropagation={(e) => saveCardToFragments(card, e)}
										class="absolute right-7 top-2 text-gray-500 hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition p-1"
										title="保存至碎片库"
									>
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
										</svg>
									</button>

									<button
										on:click|stopPropagation={() => deleteCard(card.id)}
										class="absolute right-2 top-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition p-1"
										title="删除卡片"
									>
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</div>
								<p class="text-xs text-gray-400 line-clamp-3 leading-relaxed whitespace-pre-wrap">{card.content || '无内容...'}</p>
								<div class="text-[10px] text-gray-500 mt-2 text-right">
									{estimateCardTokens(card)} tokens {card.enabled !== false ? '' : '(已卸载)'}
								</div>
							</div>
						{/each}
					</div>

					{#if cards.length === 0}
						<div class="text-center text-gray-500 text-sm mt-10">
							暂无设定卡片<br/>(No settings yet)
						</div>
					{/if}

					<button
						on:click={addNewCard}
						class="w-full mt-2 py-2 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-yellow-500 hover:border-yellow-500/50 transition flex items-center justify-center gap-1 text-sm font-medium"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
						新建卡片 (Add Setting)
					</button>

					<button
						on:click={() => { showFragmentsView = true; loadGlobalFragments(); }}
						class="w-full mt-1 py-2 border border-gray-700 bg-gray-800 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition flex items-center justify-center gap-1 text-sm font-medium shadow-sm"
					>
						<svg class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
						</svg>
						从碎片库导入
					</button>
				</div>
			{/if}
		</div>

		<!-- Footer Stats -->
		<div class="p-3 text-[11px] text-center text-gray-500 border-t border-gray-800 flex flex-col items-center justify-center gap-1 shrink-0">
			<div class="flex items-center gap-1 w-full justify-between">
				<div class="flex items-center gap-1">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-green-500" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
					</svg>
					系统级强制挂载就绪
				</div>
				<div class="font-mono {totalTokens > 50000 ? 'text-red-500' : totalTokens > 20000 ? 'text-yellow-500' : 'text-gray-400'}">
					{totalTokens} <span class="text-gray-600">/ ~20000 tokens</span>
				</div>
			</div>
			{#if totalTokens > 50000}
				<span class="text-red-500/80 mt-1 max-w-full text-center">Token 负载过高。大型 Vault prompt 会显著增加延迟与推理成本。</span>
			{:else if totalTokens > 20000}
				<span class="text-yellow-500/80 mt-1 max-w-full text-center">Token 负载偏高。建议精简未启用或重复的设定。</span>
			{/if}
		</div>
	</div>

	<!-- Background Overlay when mobile or to shift focus, optional: -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div
		transition:fade={{ duration: 250 }}
		class="fixed inset-0 bg-black/20 z-40"
		on:click={() => showMemoryVault.set(false)}
	></div>
{/if}

<style>
	/* Subtle Scrollbar for the Vault */
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #374151;
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #4b5563;
	}
	.fade-in {
		animation: fadeIn 0.2s ease-in-out;
	}
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
