<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { toast } from 'svelte-sonner';

	import { chatId, manualMemoryText, settings, stripThinkChats } from '$lib/stores';
	import { createMessagesList, stripReasoningContent } from '$lib/utils';
	import {
		estimateContextTokens,
		getContextSettingsHash,
		getStoredMaxContextTokens,
		parseContextBudgetToTokens
	} from '$lib/utils/contextTokens';

	export let history: any;
	export let selectedModels: string[] = [];
	export let className = '';

	let maxContextTokens = 250000;
	let contextTokenCount = 0;
	let vaultTokenCount = 0;
	let historyTokenCount = 0;
	let selectedContextModelId = '';
	let showContextStats = false;
	let newMaxContextInput = '';
	let panelElement: HTMLDivElement | null = null;
	let panelTop = 96;
	let dragStartY = 0;
	let dragStartTop = 0;
	let isDragging = false;
	let boundaryResizeObserver: ResizeObserver | null = null;
	let setupBoundaryObserverTimeout: ReturnType<typeof window.setTimeout> | null = null;

	const panelPositionStorageKey = 'contextTokenPanelTop';
	const viewportMargin = 8;
	const boundaryGap = 8;

	onMount(() => {
		try {
			maxContextTokens = getStoredMaxContextTokens();
		} catch (e) {}

		restorePanelTop();
		window.addEventListener('resize', handleResize);
		window.visualViewport?.addEventListener('resize', handleResize);
		window.visualViewport?.addEventListener('scroll', handleResize);
		setupBoundaryObserverTimeout = window.setTimeout(() => {
			setupBoundaryObservers();
			handleResize();
		}, 0);

		return () => {
			if (setupBoundaryObserverTimeout !== null) {
				window.clearTimeout(setupBoundaryObserverTimeout);
			}
			window.removeEventListener('resize', handleResize);
			window.visualViewport?.removeEventListener('resize', handleResize);
			window.visualViewport?.removeEventListener('scroll', handleResize);
			boundaryResizeObserver?.disconnect();
			removeDragListeners();
		};
	});

	$: {
		selectedContextModelId = Array.isArray(selectedModels)
			? (selectedModels[0] ?? '')
			: (selectedModels ?? '');
		const stripReasoning = $stripThinkChats[$chatId] ?? true;
		const messages =
			history && history.currentId !== undefined
				? createMessagesList(history, history.currentId)
				: [];
		const estimate = estimateContextTokens({
			manualMemoryText: $manualMemoryText || '',
			systemPrompt: $settings?.system ?? '',
			messages,
			modelId: selectedContextModelId,
			chatId: $chatId,
			stripReasoning,
			stripReasoningContent,
			settingsHash: getContextSettingsHash({
				stripReasoning,
				memory: $settings?.memory === true
			})
		});

		vaultTokenCount = estimate.vault + estimate.system;
		historyTokenCount = history && history.currentId !== undefined ? estimate.history : 0;
		contextTokenCount = estimate.total;
	}

	function handleUpdateMaxContext() {
		const parsed = parseContextBudgetToTokens(newMaxContextInput, selectedContextModelId);
		if (parsed !== null) {
			maxContextTokens = parsed;
			localStorage.setItem('maxContextTokens', maxContextTokens.toString());
			newMaxContextInput = '';
			toast.success(`Max context updated to ${maxContextTokens} tokens`);
		} else {
			toast.error('Invalid format. Try 25w, 128k, 250000 tokens, or 25w chars.');
		}
	}

	function getPanelHeight() {
		return panelElement?.offsetHeight ?? 64;
	}

	function getPanelBoundaries() {
		const panelHeight = getPanelHeight();
		let minTop = viewportMargin;
		let maxTop = window.innerHeight - panelHeight - viewportMargin;

		const navbarElement = document.querySelector('#chat-container nav');
		if (navbarElement instanceof HTMLElement) {
			const navbarRect = navbarElement.getBoundingClientRect();
			if (navbarRect.height > 0) {
				minTop = Math.max(minTop, navbarRect.bottom + boundaryGap);
			}
		}

		const inputElement = document.getElementById('message-input-container');
		if (inputElement instanceof HTMLElement) {
			const inputRect = inputElement.getBoundingClientRect();
			if (inputRect.height > 0) {
				maxTop = Math.min(maxTop, inputRect.top - panelHeight - boundaryGap);
			}
		}

		if (maxTop < minTop) {
			maxTop = minTop;
		}

		return { minTop, maxTop };
	}

	function clampPanelTop(top: number) {
		if (typeof window === 'undefined') {
			return top;
		}

		const { minTop, maxTop } = getPanelBoundaries();
		return Math.min(Math.max(minTop, top), maxTop);
	}

	function restorePanelTop() {
		if (typeof window === 'undefined') {
			return;
		}

		const storedTop = Number(localStorage.getItem(panelPositionStorageKey));
		panelTop = clampPanelTop(Number.isFinite(storedTop) ? storedTop : window.innerHeight - 168);
	}

	function persistPanelTop() {
		try {
			localStorage.setItem(panelPositionStorageKey, `${Math.round(panelTop)}`);
		} catch (e) {}
	}

	function handleResize() {
		panelTop = clampPanelTop(panelTop);
		persistPanelTop();
	}

	function setupBoundaryObservers() {
		boundaryResizeObserver?.disconnect();

		if (typeof ResizeObserver === 'undefined') {
			return;
		}

		const elements = [
			document.querySelector('#chat-container nav'),
			document.getElementById('message-input-container')
		].filter((element): element is HTMLElement => element instanceof HTMLElement);

		boundaryResizeObserver = new ResizeObserver(() => handleResize());
		for (const element of elements) {
			boundaryResizeObserver.observe(element);
		}
	}

	function handleDragPointerDown(event: PointerEvent) {
		event.preventDefault();
		event.stopPropagation();

		isDragging = true;
		showContextStats = false;
		dragStartY = event.clientY;
		dragStartTop = panelTop;

		window.addEventListener('pointermove', handleDragPointerMove, { passive: false });
		window.addEventListener('pointerup', handleDragPointerUp);
		window.addEventListener('pointercancel', handleDragPointerUp);
	}

	function handleDragPointerMove(event: PointerEvent) {
		if (!isDragging) {
			return;
		}

		event.preventDefault();
		panelTop = clampPanelTop(dragStartTop + event.clientY - dragStartY);
	}

	function handleDragPointerUp() {
		if (!isDragging) {
			return;
		}

		isDragging = false;
		persistPanelTop();
		removeDragListeners();
	}

	function handleDragKeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
			return;
		}

		event.preventDefault();
		panelTop = clampPanelTop(panelTop + (event.key === 'ArrowUp' ? -16 : 16));
		persistPanelTop();
	}

	function removeDragListeners() {
		if (typeof window === 'undefined') {
			return;
		}

		window.removeEventListener('pointermove', handleDragPointerMove);
		window.removeEventListener('pointerup', handleDragPointerUp);
		window.removeEventListener('pointercancel', handleDragPointerUp);
	}

	$: statsPanelPlacementClass =
		panelTop < 280 ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]';
</script>

<div
	bind:this={panelElement}
	class="fixed right-2 sm:right-4 z-40 w-[calc(100vw-1rem)] max-w-[15rem] sm:w-[240px] {isDragging
		? 'select-none'
		: ''} {className}"
	style="top: {panelTop}px;"
>
	<div class="relative">
		<button
			type="button"
			aria-label="Context token stats"
			class="flex w-full text-left items-center gap-3 px-3.5 py-2 pr-6 rounded-2xl bg-[#0f1115]/90 backdrop-blur-xl border {showContextStats
				? 'border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.15),inset_0_0_20px_rgba(0,0,0,0.8)]'
				: 'border-gray-700/50 hover:border-cyan-500/40 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] hover:shadow-[0_0_20px_rgba(34,211,238,0.1),inset_0_0_20px_rgba(0,0,0,0.8)]'} transition-all duration-300 cursor-pointer group"
			on:click|stopPropagation={() => (showContextStats = !showContextStats)}
		>
			<div
				class="relative flex items-center justify-center size-8 shrink-0 rounded-full bg-black/60 border {showContextStats
					? 'border-cyan-500/50'
					: 'border-gray-700/50 group-hover:border-cyan-500/50'} transition-colors shadow-[inset_0_0_10px_rgba(34,211,238,0.05)]"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 {contextTokenCount > maxContextTokens * 0.9
						? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]'
						: 'text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]'} transition-colors duration-500"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
				</svg>
			</div>

			<div class="flex min-w-0 flex-col w-full gap-1.5 overflow-hidden">
				<div class="flex justify-between items-baseline w-full whitespace-nowrap">
					<span class="text-[10px] font-bold text-gray-400 tracking-widest uppercase">MEMO</span>
					<div class="flex items-baseline">
						<span
							class="text-[14px] font-mono font-bold {contextTokenCount > maxContextTokens * 0.9
								? 'text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.5)]'
								: 'text-cyan-400 drop-shadow-[0_0_3px_rgba(34,211,238,0.5)]'} transition-colors duration-500"
						>
							{(contextTokenCount / 10000).toFixed(1)}
						</span>
						<span
							class="text-[11px] font-mono font-bold {contextTokenCount > maxContextTokens * 0.9
								? 'text-amber-500/70'
								: 'text-cyan-500/70'} ml-[1px]"
						>
							W
						</span>
						<span class="text-[10px] font-mono font-medium text-gray-500 ml-1.5">
							/ RY {(maxContextTokens / 10000).toFixed(1)}W
						</span>
					</div>
				</div>

				<div
					class="relative h-2 w-full bg-black/80 rounded-full overflow-hidden border border-gray-800/80 shadow-[inset_0_1px_3px_rgba(0,0,0,1)]"
				>
					<div
						class="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out {contextTokenCount >
						maxContextTokens * 0.9
							? 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_12px_rgba(245,158,11,0.9)]'
							: 'bg-gradient-to-r from-blue-600 via-cyan-500 to-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.9)]'}"
						style="width: {Math.min(100, (contextTokenCount / maxContextTokens) * 100)}%"
					></div>
					<div
						class="absolute inset-y-0 left-0 w-full bg-gradient-to-b from-white/20 to-transparent"
					></div>
				</div>
			</div>
		</button>

		<button
			type="button"
			aria-label="Drag MEMO panel vertically"
			title="Drag MEMO panel vertically"
			class="absolute right-0 top-0 bottom-0 z-10 flex w-4 touch-none cursor-ns-resize items-center justify-center rounded-r-2xl border-l border-cyan-500/10 bg-white/[0.03] text-cyan-400/50 transition-colors hover:bg-cyan-400/10 hover:text-cyan-300"
			on:pointerdown={handleDragPointerDown}
			on:keydown={handleDragKeydown}
			on:click|stopPropagation={() => {}}
		>
			<span class="h-7 w-[2px] rounded-full bg-current"></span>
		</button>

		{#if showContextStats}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div class="fixed inset-0 z-40" on:click={() => (showContextStats = false)}></div>
			<div
				class="absolute {statsPanelPlacementClass} right-0 w-[calc(100vw-1rem)] max-w-80 sm:w-[260px] bg-gray-900 border border-gray-700/50 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] z-50 p-4 text-sm backdrop-blur-xl"
				transition:slide={{ duration: 150, axis: 'y' }}
			>
				<h3 class="font-medium text-gray-200 mb-3 flex justify-between items-center">
					<span>Context load</span>
					<span
						class="text-[10px] bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700 text-gray-400"
					>
						Total: {(contextTokenCount / 1000).toFixed(1)}k
					</span>
				</h3>

				<div class="space-y-3 mb-4">
					<div class="flex flex-col gap-1">
						<div class="flex justify-between items-center text-xs">
							<span class="text-emerald-400 font-medium">Vault</span>
							<span class="text-gray-300 font-mono">
								{(vaultTokenCount / 1000).toFixed(1)}k
								<span class="text-gray-600 text-[10px] ml-1">
									({Math.round((vaultTokenCount / contextTokenCount) * 100 || 0)}%)
								</span>
							</span>
						</div>
						<div class="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
							<div
								class="h-full bg-emerald-500 rounded-full"
								style="width: {Math.min(100, (vaultTokenCount / maxContextTokens) * 100)}%"
							></div>
						</div>
					</div>

					<div class="flex flex-col gap-1">
						<div class="flex justify-between items-center text-xs">
							<span class="text-blue-400 font-medium">History</span>
							<span class="text-gray-300 font-mono">
								{(historyTokenCount / 1000).toFixed(1)}k
								<span class="text-gray-600 text-[10px] ml-1">
									({Math.round((historyTokenCount / contextTokenCount) * 100 || 0)}%)
								</span>
							</span>
						</div>
						<div class="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
							<div
								class="h-full bg-blue-500 rounded-full"
								style="width: {Math.min(100, (historyTokenCount / maxContextTokens) * 100)}%"
							></div>
						</div>
					</div>
				</div>

				<div class="border-t border-gray-800 pt-3 mt-1">
					<label class="block text-[11px] text-gray-400 mb-1.5" for="max-context-input">
						Max context
					</label>
					<div class="flex gap-2">
						<input
							id="max-context-input"
							type="text"
							bind:value={newMaxContextInput}
							placeholder="e.g. 25w, 128k"
							class="flex-1 min-w-0 bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-cyan-500 transition-colors"
							on:keydown={(e) => e.key === 'Enter' && handleUpdateMaxContext()}
						/>
						<button
							on:click={handleUpdateMaxContext}
							class="bg-gray-800 hover:bg-cyan-900/50 text-cyan-400 border border-gray-700 hover:border-cyan-500/50 rounded-lg px-3 transition-colors text-xs font-medium shrink-0"
						>
							Save
						</button>
					</div>
					<div class="text-[10px] text-gray-500 mt-1.5">
						Current: {(maxContextTokens / 10000).toFixed(1)}W tokens
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
