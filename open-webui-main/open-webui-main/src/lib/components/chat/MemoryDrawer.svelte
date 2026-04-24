<script>
	import { manualMemoryText, showMemoryVault, chatId } from '$lib/stores';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { v4 as uuidv4 } from 'uuid';

	let cards = [];
	let editingCardId = null;
	let currentChatId = null;

	// Derived total length
	$: totalLength = cards.reduce((acc, card) => acc + (card.enabled !== false ? (card.content || '').length + (card.title || '').length : 0), 0);

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

		try {
			const vaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_cards_byChat') || '{}');
			vaults[targetChatId || ''] = cards;
			localStorage.setItem('manualMemoryVAULT_cards_byChat', JSON.stringify(vaults));
		} catch (e) {
			console.error("Failed to save cards", e);
		}
	}

	function migrateAndLoadVault(newId) {
		try {
			const cardVaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_cards_byChat') || '{}');
			
			// 1. If we just got a real ID, and we had an unsaved draft in the 'new chat' state (""), migrate it over
			// ONLY migrate if the draft is NOT empty, and the destination doesn't already have a vault!
			if (newId && newId !== '' && cardVaults[''] && cardVaults[''].length > 0) {
				if (!cardVaults[newId] || cardVaults[newId].length === 0) {
					cardVaults[newId] = cardVaults[''];
				}
				delete cardVaults[''];
				localStorage.setItem('manualMemoryVAULT_cards_byChat', JSON.stringify(cardVaults));
			}

			let loadedCards = cardVaults[newId || ''];

			// 2. Legacy Migration from old single-string vault
			if (!loadedCards || loadedCards.length === 0) {
				const legacyVaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_byChat') || '{}');
				const legacyText = legacyVaults[newId || ''] || '';
				if (legacyText.trim() !== '') {
					loadedCards = [{
						id: uuidv4(),
						title: '导入的旧设定',
						content: legacyText
					}];
					// Save migrated cards immediately
					cardVaults[newId || ''] = loadedCards;
					localStorage.setItem('manualMemoryVAULT_cards_byChat', JSON.stringify(cardVaults));
				} else {
					loadedCards = [];
				}
			}

			cards = loadedCards || [];
			manualMemoryText.set(compileCardsToText(cards));
			editingCardId = null; // reset view to list
		} catch (e) {
			console.error("Failed to parse vault localstorage", e);
			cards = [];
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
</script>

{#if $showMemoryVault}
	<div 
		transition:slide={{ duration: 250, axis: 'x' }}
		class="h-full w-80 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl z-50 fixed right-0 top-0 bottom-0"
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
			{#if editingCardId}
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

					{#each cards as card (card.id)}
						<div 
							class="bg-gray-800 border border-gray-700 rounded-lg p-3 transition group cursor-pointer relative {card.enabled !== false ? 'hover:border-yellow-500/50' : 'opacity-40 grayscale hover:opacity-60'}" 
							on:click={() => editingCardId = card.id}
						>
							<div class="flex justify-between items-start mb-1">
								<div class="flex items-center gap-2 max-w-[85%]">
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
								{(card.content || '').length} 字 {card.enabled !== false ? '' : '(已卸载)'}
							</div>
						</div>
					{/each}

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
				<div class="font-mono {totalLength > 50000 ? 'text-red-500' : totalLength > 20000 ? 'text-yellow-500' : 'text-gray-400'}">
					{totalLength} <span class="text-gray-600">/ ~20000 字</span>
				</div>
			</div>
			{#if totalLength > 50000}
				<span class="text-red-500/80 mt-1 max-w-full text-center">字数过高！即便是 256K 模型，巨量的 System Prompt 也会增加推理负担与算力延迟。</span>
			{:else if totalLength > 20000}
				<span class="text-yellow-500/80 mt-1 max-w-full text-center">字数已入深水区，您的 256K 引擎还能轻松承载，但建议适度精简设定。</span>
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
