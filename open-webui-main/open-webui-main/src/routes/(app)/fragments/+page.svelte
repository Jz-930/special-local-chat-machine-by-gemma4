<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { getNotes, updateNoteById, createNewNote, getNoteById } from '$lib/apis/notes';
	import { WEBUI_NAME, showSidebar, mobile, showArchivedChats, user } from '$lib/stores';
	
	import Sidebar from '$lib/components/icons/Sidebar.svelte';
	import UserMenu from '$lib/components/layout/Sidebar/UserMenu.svelte';
	import Cog6 from '$lib/components/icons/Cog6.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	import { v4 as uuidv4 } from 'uuid';

	const i18n = getContext('i18n');

	let fragmentsNoteId = null;
	let fragments = [];
	let loaded = false;
	
	let editingFragment = null;

	// Helper: unpack cards from Notes API data format
	function unpackCardsFromNoteData(noteData) {
		let data = noteData;
		if (typeof data === 'string') {
			try { data = JSON.parse(data); } catch (e) { return []; }
		}
		const md = data?.content?.md;
		if (md && md.trim().startsWith('[')) {
			try {
				const parsed = JSON.parse(md);
				if (Array.isArray(parsed)) return parsed;
			} catch (e) { /* not valid JSON */ }
		}
		if (data?.cards && Array.isArray(data?.cards)) {
			return data.cards;
		}
		return [];
	}

	onMount(async () => {
		try {
			const allNotes = await getNotes(localStorage.token, true);
			if (allNotes && Array.isArray(allNotes)) {
				const listNote = allNotes.find(item => item.title === 'MemoryVault_Global_Fragments');
				if (listNote) {
					fragmentsNoteId = listNote.id;
					// Fetch the FULL note to avoid the 1000-char truncation in getNotes
					const fullNote = await getNoteById(localStorage.token, listNote.id);
					if (fullNote) {
						fragments = unpackCardsFromNoteData(fullNote.data);
					}
				}
			}
		} catch(e) {
			console.error(e);
		}
		loaded = true;
	});

	async function deleteFragment(id) {
		if(!confirm("确定要删除此碎片吗？")) return;
		fragments = fragments.filter(f => f.id !== id);
		if(fragmentsNoteId) {
			await updateNoteById(localStorage.token, fragmentsNoteId, {
				title: 'MemoryVault_Global_Fragments',
				data: {
					content: {
						json: null,
						html: '',
						md: JSON.stringify(fragments)
					}
				}
			});
		}
	}

	function createNewFragment() {
		editingFragment = { id: uuidv4(), title: '', content: '', isNew: true };
	}

	function editFragment(fragment) {
		editingFragment = { ...fragment };
	}

	function cancelEdit() {
		editingFragment = null;
	}

	async function saveEditedFragment() {
		if (!editingFragment.content?.trim() && !editingFragment.title?.trim()) {
			editingFragment = null;
			return;
		}

		if (editingFragment.isNew) {
			delete editingFragment.isNew;
			fragments = [editingFragment, ...fragments];
		} else {
			fragments = fragments.map(f => f.id === editingFragment.id ? editingFragment : f);
		}

		if(fragmentsNoteId) {
			await updateNoteById(localStorage.token, fragmentsNoteId, {
				title: 'MemoryVault_Global_Fragments',
				data: {
					content: {
						json: null,
						html: '',
						md: JSON.stringify(fragments)
					}
				}
			});
		} else {
			// If no fragments note exists yet, create it
			const res = await createNewNote(localStorage.token, {
				title: 'MemoryVault_Global_Fragments',
				data: {
					content: { json: null, html: '', md: JSON.stringify(fragments) }
				},
				meta: null,
				access_grants: []
			});
			if (res && res.id) fragmentsNoteId = res.id;
		}

		editingFragment = null;
	}
</script>

<svelte:head>
	<title>碎片库 • {$WEBUI_NAME}</title>
</svelte:head>

<div
	class=" flex flex-col w-full h-screen max-h-[100dvh] transition-width duration-200 ease-in-out {$showSidebar
		? 'md:max-w-[calc(100%-var(--sidebar-width))]'
		: ''} max-w-full"
>
	<nav class="   px-2 pt-1.5 backdrop-blur-xl w-full drag-region shrink-0">
		<div class=" flex items-center">
			{#if $mobile}
				<div class="{$showSidebar ? 'md:hidden' : ''} flex flex-none items-center">
					<Tooltip
						content={$showSidebar ? $i18n.t('Close Sidebar') : $i18n.t('Open Sidebar')}
						interactive={true}
					>
						<button
							id="sidebar-toggle-button"
							class=" cursor-pointer flex rounded-lg hover:bg-gray-100 dark:hover:bg-gray-850 transition cursor-"
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

			<div class="ml-2 py-0.5 self-center flex items-center justify-between w-full">
				<div class="">
					<div
						class="flex gap-1 scrollbar-none overflow-x-auto w-fit text-center text-sm font-medium bg-transparent py-1 touch-auto pointer-events-auto"
					>
						<a class="min-w-fit transition" href="/fragments">
							碎片库
						</a>
					</div>
				</div>

				<div class=" self-center flex items-center gap-1">
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
							<button
								class="select-none flex rounded-xl p-1.5 w-full hover:bg-gray-50 dark:hover:bg-gray-850 transition"
								aria-label="User Menu"
							>
								<div class=" self-center">
									<Cog6 className="size-6 text-gray-500 dark:text-gray-400" />
								</div>
							</button>
						</UserMenu>
					{/if}
				</div>
			</div>
		</div>
	</nav>

	<div class=" flex-1 max-h-full overflow-y-auto @container w-full min-h-full h-full px-3 md:px-[18px]">
		<div class="flex flex-col gap-1 px-1 mt-1.5 mb-3 pt-5">
			<div class="flex flex-wrap items-center justify-between gap-2 px-0.5 shrink-0">
				<div class="flex items-center text-xl font-medium gap-2 text-gray-900 dark:text-gray-100">
					🧩 碎片库
				</div>
				{#if !editingFragment}
					<button class="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition shrink-0 whitespace-nowrap" on:click={createNewFragment}>
						+ 新建碎片 <span class="hidden sm:inline">(New)</span>
					</button>
				{/if}
			</div>
			<div class="text-sm text-gray-500 mb-4 mt-2">
				此处保存了跨对话可复用的长期记忆设定。您可以在任意对话的“记忆抽屉”中点击“保存至碎片库”，或在此处直接管理和撰写。
			</div>
		</div>

		{#if loaded}
			{#if editingFragment}
				<div class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-3 flex-1 min-h-[50dvh] h-[calc(100dvh-200px)] sm:h-[calc(100vh-250px)]">
					<input
						bind:value={editingFragment.title}
						placeholder="碎片标题 (如: 世界观-魔法设定)"
						class="w-full bg-transparent text-lg font-medium text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 transition"
					/>
					<textarea
						bind:value={editingFragment.content}
						placeholder="在此输入详细设定内容..."
						class="w-full flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-blue-500 transition"
					></textarea>
					<div class="flex justify-end gap-2 pt-2">
						<button class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition" on:click={cancelEdit}>
							取消 (Cancel)
						</button>
						<button class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition" on:click={saveEditedFragment}>
							保存 (Save)
						</button>
					</div>
				</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
					{#each fragments as fragment (fragment.id)}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col relative transition hover:shadow-md cursor-pointer group" on:click={() => editFragment(fragment)}>
							<div class="font-medium text-gray-900 dark:text-gray-200 mb-2 truncate pr-6">{fragment.title || '未命名设定'}</div>
							<div class="text-sm text-gray-600 dark:text-gray-400 line-clamp-6 flex-1 whitespace-pre-wrap">{fragment.content || '无内容'}</div>
							
							<button class="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition p-1 opacity-0 group-hover:opacity-100" on:click|stopPropagation={() => deleteFragment(fragment.id)} title="删除碎片">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
							</button>
						</div>
					{/each}
					{#if fragments.length === 0}
						<div class="text-gray-500 text-sm mt-10 w-full col-span-3 text-center bg-gray-50 dark:bg-gray-900 py-10 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
							暂无保存的碎片。<br/>(请在“记忆抽屉”中将卡片保存至此处，或点击右上角新建)
						</div>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="text-gray-500 text-sm p-4 text-center">加载中... (Loading)</div>
		{/if}
	</div>
</div>
