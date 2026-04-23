<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import { showGhostSummary } from '$lib/stores';
	import { toast } from 'svelte-sonner';
	import { generateOpenAIChatCompletion } from '$lib/apis/openai';
	import { createMessagesList } from '$lib/utils';
	import Spinner from '../common/Spinner.svelte';

	export let history;
	export let selectedModels;

	let summaryText = "";
	let isGenerating = false;
	
	let startIdx = 1;
	let endIdx = 1;
	let hasInitialized = false;

	// Automatically track the absolute timeline size
	$: allMessages = (history && history.currentId) ? createMessagesList(history, history.currentId) : [];
	$: totalMessages = allMessages.length;

	// Reset parameters automatically when modal pops up
	$: if ($showGhostSummary && !hasInitialized && totalMessages > 0) {
		endIdx = totalMessages;
		startIdx = Math.max(1, totalMessages - 19); // Defaults to last 20 messages (approx 10 turns)
		summaryText = "";
		hasInitialized = true;
	}
	$: if (!$showGhostSummary) {
		hasInitialized = false;
	}

	function setRange(mode) {
		endIdx = totalMessages;
		if (mode === '10') {
			startIdx = Math.max(1, totalMessages - 9);
		} else if (mode === '20') {
			startIdx = Math.max(1, totalMessages - 19);
		} else if (mode === 'all') {
			startIdx = 1;
		}
	}

	async function summarizeStory() {
		if (totalMessages === 0) {
			toast.error("当前没有可总结的对话记录！");
			return;
		}
		
		const modelId = selectedModels?.[0];
		if (!modelId) {
			toast.error("请先在顶部选择一个模型！");
			return;
		}

		if (startIdx < 1 || endIdx > totalMessages || startIdx > endIdx) {
			toast.error(`无效的编号区间！请输入 1 到 ${totalMessages} 之间的范围。`);
			return;
		}

		isGenerating = true;
		summaryText = "";

		try {
			// Slicing precise segment. Remember: user inputs are 1-indexed, Array is 0-indexed.
			let recentMessages = allMessages.slice(startIdx - 1, endIdx).map(msg => ({
				role: msg.role,
				content: typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text ?? ''
			}));

			if (recentMessages.length === 0) {
				toast.error("无聊天记录可总结");
				isGenerating = false;
				return;
			}

			recentMessages.push({
				role: "user",
				content: "请用一段话精炼、客观地总结上述内容的剧情进展事件、人物动态以及主线悬念。要求：直接输出总结结果，不准使用任何客套话，不要包含诸如'这是一段总结'之类的废话，不准评价角色行为。这只是为了给我连载小说大纲做笔记参考。"
			});

			const payload = {
				model: modelId,
				messages: recentMessages,
				stream: false
			};

			const token = localStorage.token;
			const res = await generateOpenAIChatCompletion(token, payload);
			
			if (res && res.choices && res.choices.length > 0) {
				summaryText = res.choices[0].message.content.trim();
				toast.success("幽灵总结完成！");
			} else {
				toast.error("模型未返回有效文本或请求超时。");
			}
		} catch (e) {
			console.error("Ghost Summary Error:", e);
			toast.error("生成总结失败：" + e.message);
		} finally {
			isGenerating = false;
		}
	}

	function copyToClipboard() {
		navigator.clipboard.writeText(summaryText);
		toast.success("已复制到剪贴板！");
	}
</script>

{#if $showGhostSummary}
	<!-- Modal Backdrop -->
	<div 
		transition:fade={{ duration: 200 }}
		class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
	>
		<!-- Modal Content -->
		<div 
			transition:slide={{ duration: 250, axis: 'y' }}
			class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
				<div class="flex items-center gap-2 text-indigo-400">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clip-rule="evenodd" />
					</svg>
					<span class="font-bold text-sm tracking-widest uppercase">精准裁切仪 (Ghost Summary)</span>
				</div>
				<button 
					on:click={() => showGhostSummary.set(false)}
					class="text-gray-500 hover:text-white transition-colors"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="px-6 py-5 flex-1 overflow-y-auto custom-scrollbar">
				<!-- Custom Range Controller -->
				<div class="mb-5 bg-gray-950 p-4 rounded-xl border border-gray-800 flex flex-col gap-3">
					<div class="text-xs text-gray-400 font-medium">设定需隐形提取的剧情范畴 <span class="ml-1 text-gray-600">(对照气泡右/左边缘的编号)</span></div>
					
					<div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
						<div class="flex items-center gap-2">
							<div class="flex items-center gap-2 bg-gray-900 border border-gray-700 px-3 py-1.5 rounded-lg text-sm text-gray-300">
								<span class="text-gray-500">起始</span>
								<span class="font-mono text-indigo-400">#</span>
								<input type="number" bind:value={startIdx} min="1" max={totalMessages} class="w-12 sm:w-16 bg-transparent outline-none font-mono text-white text-center">
							</div>
							<div class="text-gray-600 px-1">至</div>
							<div class="flex items-center gap-2 bg-gray-900 border border-gray-700 px-3 py-1.5 rounded-lg text-sm text-gray-300">
								<span class="text-gray-500">末尾</span>
								<span class="font-mono text-indigo-400">#</span>
								<input type="number" bind:value={endIdx} min="1" max={totalMessages} class="w-12 sm:w-16 bg-transparent outline-none font-mono text-white text-center">
							</div>
						</div>
						
						<!-- Quick presets -->
						<div class="flex flex-wrap gap-2 mt-1 sm:mt-0 sm:ml-auto">
							<button on:click={() => setRange('10')} class="px-3 py-1.5 sm:px-2 sm:py-1 text-[11px] sm:text-xs bg-gray-800 hover:bg-indigo-900 text-gray-400 rounded transition-colors whitespace-nowrap">近10条</button>
							<button on:click={() => setRange('20')} class="px-3 py-1.5 sm:px-2 sm:py-1 text-[11px] sm:text-xs bg-gray-800 hover:bg-indigo-900 text-gray-400 rounded transition-colors whitespace-nowrap">近20条</button>
							<button on:click={() => setRange('all')} class="px-3 py-1.5 sm:px-2 sm:py-1 text-[11px] sm:text-xs bg-gray-800 hover:bg-indigo-900 text-gray-400 rounded transition-colors whitespace-nowrap">全文汇总</button>
						</div>
					</div>
				</div>

				{#if isGenerating}
					<div class="h-40 flex flex-col items-center justify-center gap-3 text-indigo-400">
						<Spinner className="size-6" />
						<div class="text-xs">大模型正在后台闭关提炼剧情... (请稍候)</div>
					</div>
				{:else if summaryText}
					<div class="relative">
						<textarea 
							readonly 
							class="w-full h-48 bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm text-gray-300 resize-none focus:outline-none leading-relaxed"
						>{summaryText}</textarea>
						<button 
							on:click={copyToClipboard}
							class="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors flex items-center gap-1 text-xs"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							复制大纲
						</button>
					</div>
				{:else}
					<div class="h-40 flex items-center justify-center opacity-50 border-2 border-dashed border-gray-800 rounded-xl">
						<span class="text-gray-500 text-sm">核对气泡左侧编号，设定范围并点击提纲...</span>
					</div>
				{/if}
			</div>

			<!-- Footer Action -->
			<div class="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-end">
				{#if !isGenerating}
					<button 
						on:click={summarizeStory}
						class="px-5 py-2.5 sm:py-2.5 py-3 w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50"
						disabled={totalMessages === 0}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
						立即执行区间提炼 (提取 {Math.max(0, endIdx - startIdx + 1)} 条)
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
