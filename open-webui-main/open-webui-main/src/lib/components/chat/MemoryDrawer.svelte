<script>
	import { manualMemoryText, showMemoryVault, chatId } from '$lib/stores';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import Tooltip from '../common/Tooltip.svelte';

	let text = '';
	let currentChatId = null;

	// Load vault text whenever the chat room changes (or initiates)
	$: if ($chatId !== currentChatId) {
		migrateAndLoadVault($chatId);
		currentChatId = $chatId;
	}

	// Keep UI textarea synced with the Svelte store
	$: text = $manualMemoryText;

	function migrateAndLoadVault(newId) {
		try {
			const vaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_byChat') || '{}');
			
			// If we just got a real ID, and we had an unsaved draft in the 'new chat' state (""), migrate it over
			if (newId && newId !== '' && vaults['']) {
				vaults[newId] = vaults[''];
				delete vaults[''];
				localStorage.setItem('manualMemoryVAULT_byChat', JSON.stringify(vaults));
			}

			const val = vaults[newId || ''] || '';
			manualMemoryText.set(val);
		} catch (e) {
			console.error("Failed to parse vault localstorage", e);
		}
	}

	function handleInput(e) {
		const val = e.target.value;
		manualMemoryText.set(val);

		// Instantly save to current chat's slot
		try {
			const vaults = JSON.parse(localStorage.getItem('manualMemoryVAULT_byChat') || '{}');
			vaults[$chatId || ''] = val;
			localStorage.setItem('manualMemoryVAULT_byChat', JSON.stringify(vaults));
		} catch (e) {}
	}
</script>

{#if $showMemoryVault}
	<div 
		transition:slide={{ duration: 250, axis: 'x' }}
		class="h-full w-80 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl z-50 fixed right-0 top-0 bottom-0"
	>
		<div class="flex items-center justify-between p-4 border-b border-gray-800">
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

		<div class="flex-1 p-4 relative">
			<textarea
				bind:value={text}
				on:input={handleInput}
				class="w-full h-full bg-transparent text-gray-300 text-sm resize-none focus:outline-none placeholder-gray-600 leading-relaxed custom-scrollbar"
				placeholder="在此写下小说的世界观、核心设定、当前章节脉络、或必须遵循的规则...&#10;&#10;这些内容将像钢印一样永远强制前置插入系统的隐形提示词中，永生不忘。"
			></textarea>
		</div>
		
		<div class="p-3 text-[11px] text-center text-gray-500 border-t border-gray-800 flex flex-col items-center justify-center gap-1">
			<div class="flex items-center gap-1 w-full justify-between">
				<div class="flex items-center gap-1">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-green-500" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
					</svg>
					系统级强制挂载就绪
				</div>
				<div class="font-mono {text.length > 50000 ? 'text-red-500' : text.length > 20000 ? 'text-yellow-500' : 'text-gray-400'}">
					{text.length} <span class="text-gray-600">/ ~20000 字</span>
				</div>
			</div>
			{#if text.length > 50000}
				<span class="text-red-500/80 mt-1 max-w-full text-center">字数过高！即便是 256K 模型，巨量的 System Prompt 也会增加推理负担与算力延迟。</span>
			{:else if text.length > 20000}
				<span class="text-yellow-500/80 mt-1 max-w-full text-center">字数已入深水区，您的 256K 引擎还能轻松承载，但建议适度拆分章节设定。</span>
			{/if}
		</div>
	</div>

	<!-- Background Overlay when mobile or to shift focus, optional: -->
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
</style>
