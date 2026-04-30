<script lang="ts">
	import { getContext, onMount } from 'svelte';

	import {
		WEBUI_NAME,
		banners,
		chatId,
		config,
		mobile,
		settings,
		showArchivedChats,
		showControls,
		showSidebar,
		temporaryChatEnabled,
		user,
		showMemoryVault,
		showGhostSummary,
		showOverview,
		stripThinkChats
	} from '$lib/stores';

	import { slide } from 'svelte/transition';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	import ShareChatModal from '../chat/ShareChatModal.svelte';
	import ModelSelector from '../chat/ModelSelector.svelte';
	import Tooltip from '../common/Tooltip.svelte';
	import Menu from '$lib/components/layout/Navbar/Menu.svelte';
	import UserMenu from '$lib/components/layout/Sidebar/UserMenu.svelte';
	import AdjustmentsHorizontal from '../icons/AdjustmentsHorizontal.svelte';

	import PencilSquare from '../icons/PencilSquare.svelte';
	import Banner from '../common/Banner.svelte';
	import Sidebar from '../icons/Sidebar.svelte';

	import ChatBubbleDotted from '../icons/ChatBubbleDotted.svelte';
	import ChatBubbleDottedChecked from '../icons/ChatBubbleDottedChecked.svelte';

	import EllipsisHorizontal from '../icons/EllipsisHorizontal.svelte';
	import ChatPlus from '../icons/ChatPlus.svelte';
	import ChatCheck from '../icons/ChatCheck.svelte';
	import Knobs from '../icons/Knobs.svelte';
	import Cog6 from '../icons/Cog6.svelte';
	import { WEBUI_API_BASE_URL } from '$lib/constants';

	const i18n = getContext('i18n');

	export let initNewChat: Function;
	export let shareEnabled: boolean = false;
	export let scrollTop = 0;

	export let chat;
	export let history;
	export let selectedModels: string[] = [];
	export let showModelSelector = true;

	export let onSaveTempChat: () => {};
	export let archiveChatHandler: (id: string) => void;
	export let moveChatHandler: (id: string, folderId: string) => void;

	let closedBannerIds = [];

	let showShareChatModal = false;
	let showDownloadChatModal = false;

	onMount(() => {
		try {
			const stored = localStorage.getItem('stripThinkChats');
			if (stored) {
				stripThinkChats.set(JSON.parse(stored));
			}
		} catch (e) {}
	});
</script>

<ShareChatModal bind:show={showShareChatModal} chatId={$chatId} />

<button
	id="new-chat-button"
	class="hidden"
	on:click={() => {
		initNewChat();
	}}
	aria-label="New Chat"
/>

<nav
	class="sticky top-0 z-30 w-full {chat?.id
		? 'pt-0.5 pb-1'
		: 'pt-1 pb-1'} -mb-12 flex flex-col items-center drag-region"
>
	<div class="flex items-center w-full pl-1.5 pr-1">
		<div
			id="navbar-bg-gradient-to-b"
			class="{chat?.id
				? 'visible'
				: 'invisible'} bg-linear-to-b via-40% to-97% from-white/90 via-white/50 to-transparent dark:from-gray-900/90 dark:via-gray-900/50 dark:to-transparent pointer-events-none absolute inset-0 -bottom-10 z-[-1]"
		></div>

		<div class=" flex max-w-full w-full mx-auto px-1.5 md:px-2 pt-0.5 bg-transparent">
			<div class="flex items-center w-full max-w-full">
				{#if $mobile && !$showSidebar}
					<div
						class="-translate-x-0.5 mr-1 mt-1 self-start flex flex-none items-center text-gray-600 dark:text-gray-400"
					>
						<Tooltip content={$showSidebar ? $i18n.t('Close Sidebar') : $i18n.t('Open Sidebar')}>
							<button
								class=" cursor-pointer flex rounded-lg hover:bg-gray-100 dark:hover:bg-gray-850 transition"
								on:click={() => {
									showSidebar.set(!$showSidebar);
								}}
							>
								<div class=" self-center p-1.5">
									<Sidebar />
								</div>
							</button>
						</Tooltip>
					</div>
				{/if}

				<div class="flex-1 min-w-0 max-w-full mt-0.5 py-0.5 {$showSidebar ? 'ml-1' : ''}">
					{#if showModelSelector}
						<div class="flex items-center gap-2">
							<ModelSelector bind:selectedModels showSetDefault={!shareEnabled} />
						</div>
					{/if}
				</div>

				<div
					class="self-start flex flex-wrap items-center justify-end gap-y-2 text-gray-600 dark:text-gray-400 max-w-[55vw] sm:max-w-none"
				>
					<!-- <div class="md:hidden flex self-center w-[1px] h-5 mx-2 bg-gray-300 dark:bg-stone-700" /> -->

					{#if $user?.role === 'user' ? ($user?.permissions?.chat?.temporary ?? true) && !($user?.permissions?.chat?.temporary_enforced ?? false) : true}
						{#if !chat?.id}
							<Tooltip content={$i18n.t(`Temporary Chat`)}>
								<button
									class="flex cursor-pointer px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition"
									id="temporary-chat-button"
									on:click={async () => {
										if (($settings?.temporaryChatByDefault ?? false) && $temporaryChatEnabled) {
											// for proper initNewChat handling
											await temporaryChatEnabled.set(null);
										} else {
											await temporaryChatEnabled.set(!$temporaryChatEnabled);
										}

										if ($page.url.pathname !== '/') {
											await goto('/');
										}

										// add 'temporary-chat=true' to the URL
										if ($temporaryChatEnabled) {
											window.history.replaceState(null, '', '?temporary-chat=true');
										} else {
											window.history.replaceState(null, '', location.pathname);
										}
									}}
								>
									<div class=" m-auto self-center">
										{#if $temporaryChatEnabled}
											<ChatBubbleDottedChecked className=" size-4.5" strokeWidth="1.5" />
										{:else}
											<ChatBubbleDotted className=" size-4.5" strokeWidth="1.5" />
										{/if}
									</div>
								</button>
							</Tooltip>
						{:else if $temporaryChatEnabled}
							<Tooltip content={$i18n.t(`Save Chat`)}>
								<button
									class="flex cursor-pointer px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition"
									id="save-temporary-chat-button"
									on:click={async () => {
										onSaveTempChat();
									}}
								>
									<div class=" m-auto self-center">
										<ChatCheck className=" size-4.5" strokeWidth="1.5" />
									</div>
								</button>
							</Tooltip>
						{/if}
					{/if}

					{#if $user?.role === 'admin' || ($user?.permissions.chat?.controls ?? true)}
						<Tooltip content="全部分支概览 (Overview)">
							<button
								class="flex items-center justify-center size-10 rounded-2xl bg-[#0f1115]/90 backdrop-blur-xl border {$showOverview
									? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15),inset_0_0_15px_rgba(0,0,0,0.8)]'
									: 'border-gray-700/50 hover:border-emerald-500/40 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] hover:shadow-[0_0_15px_rgba(16,185,129,0.1),inset_0_0_15px_rgba(0,0,0,0.8)]'} transition-all duration-300 cursor-pointer shrink-0 ml-2 group"
								on:click={() => {
									showOverview.set(!$showOverview);
								}}
								aria-label="Toggle Overview"
							>
								<div
									class="relative flex items-center justify-center size-7 shrink-0 rounded-full bg-black/60 border {$showOverview
										? 'border-emerald-500/50'
										: 'border-gray-700/50 group-hover:border-emerald-500/50'} transition-colors shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4 {$showOverview
											? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]'
											: 'text-gray-400'}"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
										/>
									</svg>
								</div>
							</button>
						</Tooltip>
					{/if}

					{#if $mobile && !$temporaryChatEnabled && chat && chat.id}
						<Tooltip content={$i18n.t('New Chat')}>
							<button
								class=" flex {$showSidebar
									? 'md:hidden'
									: ''} cursor-pointer px-2 py-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-850 transition"
								on:click={() => {
									initNewChat();
								}}
								aria-label="New Chat"
							>
								<div class=" m-auto self-center">
									<ChatPlus className=" size-4.5" strokeWidth="1.5" />
								</div>
							</button>
						</Tooltip>
					{/if}

					{#if $user?.role === 'admin' || ($user?.permissions.chat?.controls ?? true)}
						<Tooltip content="幽灵总结器 (Ghost Summary)">
							<button
								class="flex items-center justify-center size-10 rounded-2xl bg-[#0f1115]/90 backdrop-blur-xl border {$showGhostSummary
									? 'border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15),inset_0_0_15px_rgba(0,0,0,0.8)]'
									: 'border-gray-700/50 hover:border-indigo-500/40 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] hover:shadow-[0_0_15px_rgba(99,102,241,0.1),inset_0_0_15px_rgba(0,0,0,0.8)]'} transition-all duration-300 cursor-pointer shrink-0 ml-2 group"
								on:click={() => {
									showGhostSummary.set(!$showGhostSummary);
								}}
								aria-label="Ghost Summary"
							>
								<div
									class="relative flex items-center justify-center size-7 shrink-0 rounded-full bg-black/60 border {$showGhostSummary
										? 'border-indigo-500/50'
										: 'border-gray-700/50 group-hover:border-indigo-500/50'} transition-colors shadow-[inset_0_0_10px_rgba(99,102,241,0.05)]"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4 {$showGhostSummary
											? 'text-indigo-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.8)]'
											: 'text-gray-400'}"
										viewBox="0 0 20 20"
										fill="currentColor"
									>
										<path
											fill-rule="evenodd"
											d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"
											clip-rule="evenodd"
										/>
									</svg>
								</div>
							</button>
						</Tooltip>
					{/if}

					{#if $user?.role === 'admin' || ($user?.permissions.chat?.controls ?? true)}
						<Tooltip content="记忆防爆阀 (Reasoning Stripper)">
							<button
								class="flex items-center justify-center size-10 rounded-2xl bg-[#0f1115]/90 backdrop-blur-xl border {($stripThinkChats[
									$chatId
								] ?? true)
									? 'border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.15),inset_0_0_15px_rgba(0,0,0,0.8)]'
									: 'border-gray-700/50 hover:border-pink-500/40 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] hover:shadow-[0_0_15px_rgba(236,72,153,0.1),inset_0_0_15px_rgba(0,0,0,0.8)]'} transition-all duration-300 cursor-pointer shrink-0 ml-2 group"
								on:click={() => {
									stripThinkChats.update((chats) => {
										const current = chats[$chatId] ?? true;
										chats[$chatId] = !current;
										localStorage.setItem('stripThinkChats', JSON.stringify(chats));
										return chats;
									});
								}}
								aria-label="Toggle Reasoning Stripper"
							>
								<div
									class="relative flex items-center justify-center size-7 shrink-0 rounded-full bg-black/60 border {($stripThinkChats[
										$chatId
									] ?? true)
										? 'border-pink-500/50'
										: 'border-gray-700/50 group-hover:border-pink-500/50'} transition-colors shadow-[inset_0_0_10px_rgba(236,72,153,0.05)]"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4 {($stripThinkChats[$chatId] ?? true)
											? 'text-pink-400 drop-shadow-[0_0_6px_rgba(236,72,153,0.8)]'
											: 'text-gray-400'}"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
										/>
									</svg>
									{#if !($stripThinkChats[$chatId] ?? true)}
										<div class="absolute inset-0 flex items-center justify-center">
											<div
												class="w-full h-[2px] bg-red-500 rotate-45 transform drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]"
											></div>
										</div>
									{/if}
								</div>
							</button>
						</Tooltip>
					{/if}

					{#if $user?.role === 'admin' || ($user?.permissions.chat?.controls ?? true)}
						<button
							class="flex text-left items-center gap-3 px-3.5 py-2 rounded-2xl bg-[#0f1115]/90 backdrop-blur-xl border {$showMemoryVault
								? 'border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.15),inset_0_0_20px_rgba(0,0,0,0.8)]'
								: 'border-gray-700/50 hover:border-yellow-500/40 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] hover:shadow-[0_0_20px_rgba(234,179,8,0.1),inset_0_0_20px_rgba(0,0,0,0.8)]'} transition-all duration-300 cursor-pointer w-[200px] shrink-0 ml-2 group"
							on:click={() => {
								showMemoryVault.set(!$showMemoryVault);
							}}
							aria-label="Memory Vault"
						>
							<div
								class="relative flex items-center justify-center size-8 shrink-0 rounded-full bg-black/60 border {$showMemoryVault
									? 'border-yellow-500/50'
									: 'border-gray-700/50 group-hover:border-yellow-500/50'} transition-colors shadow-[inset_0_0_10px_rgba(234,179,8,0.05)]"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 {$showMemoryVault
										? 'text-yellow-400 drop-shadow-[0_0_6px_rgba(234,179,8,0.8)]'
										: 'text-gray-400'}"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
									/>
								</svg>
							</div>
							<div class="flex flex-col w-full gap-0.5 overflow-hidden">
								<div class="flex justify-between items-baseline w-full whitespace-nowrap">
									<span class="text-[12px] font-bold text-gray-200 tracking-wide uppercase"
										>当前对话记忆</span
									>
									<span
										class="text-[10px] font-mono font-bold {$showMemoryVault
											? 'text-yellow-400 drop-shadow-[0_0_3px_rgba(234,179,8,0.5)]'
											: 'text-gray-500'}">{$showMemoryVault ? 'OPEN' : 'IDLE'}</span
									>
								</div>
								<div class="text-[10px] font-medium text-gray-500 truncate">单次会话独立设定</div>
							</div>
						</button>
					{/if}

					{#if $user?.role === 'admin' || ($user?.permissions.chat?.controls ?? true)}
						<Tooltip content={$i18n.t('Controls')}>
							<button
								class=" flex cursor-pointer px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition"
								on:click={async () => {
									await showControls.set(!$showControls);
								}}
								aria-label="Controls"
							>
								<div class=" m-auto self-center">
									<Knobs className=" size-5" strokeWidth="1" />
								</div>
							</button>
						</Tooltip>
					{/if}

					{#if shareEnabled && chat && (chat.id || $temporaryChatEnabled)}
						<Menu
							{chat}
							{shareEnabled}
							shareHandler={() => {
								showShareChatModal = !showShareChatModal;
							}}
							archiveChatHandler={() => {
								archiveChatHandler(chat.id);
							}}
							{moveChatHandler}
						>
							<button
								class="flex cursor-pointer px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-850 transition"
								id="chat-context-menu-button"
							>
								<div class=" m-auto self-center">
									<EllipsisHorizontal className=" size-5" strokeWidth="1.5" />
								</div>
							</button>
						</Menu>
					{/if}
				</div>
				<!-- End horizontally scrollable tools -->

				<div
					class="self-start flex flex-none items-center text-gray-600 dark:text-gray-400 pl-1 border-l border-gray-200 dark:border-gray-800 ml-1"
				>
					{#if $user !== undefined && $user !== null}
						<UserMenu
							className="w-[240px]"
							role={$user?.role}
							help={true}
							on:show={(e) => {
								if (e.detail === 'archived-chat') {
									showArchivedChats.set(true);
								}
							}}
						>
							<div
								class="select-none flex rounded-xl p-1.5 w-full hover:bg-gray-50 dark:hover:bg-gray-850 transition"
							>
								<div class=" self-center">
									<span class="sr-only">{$i18n.t('User menu')}</span>
									<Cog6 className="size-6 text-gray-500 dark:text-gray-400" />
								</div>
							</div>
						</UserMenu>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if $temporaryChatEnabled && ($chatId ?? '').startsWith('local:')}
		<div class=" w-full z-30 text-center">
			<div class="text-xs text-gray-500">{$i18n.t('Temporary Chat')}</div>
		</div>
	{/if}

	<div class="absolute top-[100%] left-0 right-0 h-fit">
		{#if !history.currentId && !$chatId && ($banners.length > 0 || ($config?.license_metadata?.type ?? null) === 'trial' || (($config?.license_metadata?.seats ?? null) !== null && $config?.user_count > $config?.license_metadata?.seats))}
			<div class=" w-full z-30">
				<div class=" flex flex-col gap-1 w-full">
					{#if ($config?.license_metadata?.type ?? null) === 'trial'}
						<Banner
							banner={{
								type: 'info',
								title: 'Trial License',
								content: $i18n.t(
									'You are currently using a trial license. Please contact support to upgrade your license.'
								)
							}}
						/>
					{/if}

					{#if ($config?.license_metadata?.seats ?? null) !== null && $config?.user_count > $config?.license_metadata?.seats}
						<Banner
							banner={{
								type: 'error',
								title: 'License Error',
								content: $i18n.t(
									'Exceeded the number of seats in your license. Please contact support to increase the number of seats.'
								)
							}}
						/>
					{/if}

					{#each $banners.filter((b) => ![...JSON.parse(localStorage.getItem('dismissedBannerIds') ?? '[]'), ...closedBannerIds].includes(b.id)) as banner (banner.id)}
						<Banner
							{banner}
							on:dismiss={(e) => {
								const bannerId = e.detail;

								if (banner.dismissible) {
									localStorage.setItem(
										'dismissedBannerIds',
										JSON.stringify(
											[
												bannerId,
												...JSON.parse(localStorage.getItem('dismissedBannerIds') ?? '[]')
											].filter((id) => $banners.find((b) => b.id === id))
										)
									);
								} else {
									closedBannerIds = [...closedBannerIds, bannerId];
								}
							}}
						/>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</nav>
