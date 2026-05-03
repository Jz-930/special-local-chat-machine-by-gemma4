<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { createNewNote, getNoteById, getNotes, updateNoteById } from '$lib/apis/notes';
	import { WEBUI_NAME, showArchivedChats, showSidebar, mobile, user } from '$lib/stores';
	import Sidebar from '$lib/components/icons/Sidebar.svelte';
	import UserMenu from '$lib/components/layout/Sidebar/UserMenu.svelte';
	import Cog6 from '$lib/components/icons/Cog6.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import MenuLines from '$lib/components/icons/MenuLines.svelte';
	import Sortable from 'sortablejs';
	import { v4 as uuidv4 } from 'uuid';
	import {
		createFragmentGroup,
		deleteFragments,
		deleteGroup as deleteGroupFromLibrary,
		FRAGMENTS_NOTE_TITLE,
		moveFragmentsToGroup,
		normalizeFragmentLibrary,
		packFragmentLibraryToNoteData,
		type FragmentGroup,
		type FragmentLibrary,
		type VaultCard,
		unpackFragmentLibraryFromNoteData
	} from '$lib/utils/memoryVault';

	const i18n = getContext('i18n') as any;

	let fragmentsNoteId: string | null = null;
	let library: FragmentLibrary = { version: 2, groups: [], fragments: [] };
	let loaded = false;
	let saving = false;
	let query = '';
	let activeGroupId = 'all';
	let selectionMode = false;
	let selectedIds = new Set<string>();
	let editingFragment: VaultCard | null = null;
	let editingFragmentIsNew = false;
	let editingGroup: FragmentGroup | null = null;

	const ungroupedOption = { id: 'ungrouped', name: '未分组', color: '#94a3b8' };

	$: groups = [...library.groups].sort((a, b) => a.order - b.order);
	$: selectedCount = selectedIds.size;
	$: activeGroupName =
		activeGroupId === 'all'
			? '全部碎片'
			: activeGroupId === 'ungrouped'
				? '未分组'
				: groups.find((group) => group.id === activeGroupId)?.name || '未知分组';
	$: visibleFragments = library.fragments
		.filter((fragment) => {
			if (activeGroupId === 'ungrouped') {
				return !fragment.group_id;
			}
			if (activeGroupId !== 'all') {
				return fragment.group_id === activeGroupId;
			}
			return true;
		})
		.filter((fragment) => {
			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			return `${fragment.title || ''}\n${fragment.content || ''}`.toLowerCase().includes(needle);
		})
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

	onMount(async () => {
		await loadFragments();
	});

	async function loadFragments() {
		loaded = false;
		try {
			const allNotes = await getNotes(localStorage.token, true);
			if (Array.isArray(allNotes)) {
				const listNote = allNotes.find((item) => item.title === FRAGMENTS_NOTE_TITLE);
				if (listNote) {
					fragmentsNoteId = listNote.id;
					const fullNote = await getNoteById(localStorage.token, listNote.id);
					library = normalizeFragmentLibrary(unpackFragmentLibraryFromNoteData(fullNote?.data));
				}
			}
		} catch (error) {
			console.error('Failed to load fragments', error);
		} finally {
			loaded = true;
		}
	}

	async function persistLibrary(nextLibrary: FragmentLibrary) {
		saving = true;
		const next = normalizeFragmentLibrary(nextLibrary);
		const data = packFragmentLibraryToNoteData(next);

		try {
			if (fragmentsNoteId) {
				await updateNoteById(localStorage.token, fragmentsNoteId, {
					title: FRAGMENTS_NOTE_TITLE,
					data
				});
			} else {
				const res = await createNewNote(localStorage.token, {
					title: FRAGMENTS_NOTE_TITLE,
					data,
					meta: null,
					access_grants: []
				});
				if (res?.id) fragmentsNoteId = res.id;
			}
			library = next;
		} catch (error) {
			console.error('Failed to persist fragments library', error);
			alert('保存碎片库失败，请检查后端服务或登录状态。');
			throw error;
		} finally {
			saving = false;
		}
	}

	function toggleSelection(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	function clearSelection() {
		selectedIds = new Set();
		selectionMode = false;
	}

	function selectVisible() {
		selectedIds = new Set(visibleFragments.map((fragment) => fragment.id));
		selectionMode = true;
	}

	async function bulkDelete() {
		if (selectedIds.size === 0) return;
		if (!confirm(`确认删除选中的 ${selectedIds.size} 个碎片？此操作不可撤销。`)) return;
		await persistLibrary(deleteFragments(library, selectedIds));
		clearSelection();
	}

	async function bulkMove(groupId: string) {
		if (selectedIds.size === 0) return;
		await persistLibrary(
			moveFragmentsToGroup(library, selectedIds, groupId === 'ungrouped' ? null : groupId)
		);
		clearSelection();
		activeGroupId = groupId;
	}

	function createNewFragment() {
		editingFragmentIsNew = true;
		editingFragment = {
			id: uuidv4(),
			title: '',
			content: '',
			group_id: activeGroupId !== 'all' && activeGroupId !== 'ungrouped' ? activeGroupId : null
		};
	}

	function editFragment(fragment: VaultCard) {
		editingFragmentIsNew = false;
		editingFragment = { ...fragment };
	}

	async function saveEditedFragment() {
		if (!editingFragment) return;
		const cleaned = {
			...editingFragment,
			title: (editingFragment.title || '').trim(),
			content: editingFragment.content || ''
		};

		if (!cleaned.title && !cleaned.content.trim()) {
			editingFragment = null;
			return;
		}

		const fragments = editingFragmentIsNew
			? [{ ...cleaned, order: -1 }, ...library.fragments]
			: library.fragments.map((fragment) => (fragment.id === cleaned.id ? cleaned : fragment));

		await persistLibrary({ ...library, fragments });
		editingFragment = null;
		editingFragmentIsNew = false;
	}

	async function deleteFragment(id: string) {
		if (!confirm('确认删除这个碎片？')) return;
		await persistLibrary(deleteFragments(library, new Set([id])));
	}

	async function addGroup() {
		const group = createFragmentGroup('新分组', groups.length);
		await persistLibrary({ ...library, groups: [...groups, group] });
		activeGroupId = group.id;
		editingGroup = { ...group };
	}

	function editGroup(group: FragmentGroup) {
		editingGroup = { ...group };
	}

	async function saveGroup() {
		if (!editingGroup) return;
		const nextGroups = groups.map((group) =>
			group.id === editingGroup?.id
				? { ...editingGroup, name: editingGroup.name.trim() || '未命名分组' }
				: group
		);
		await persistLibrary({ ...library, groups: nextGroups });
		editingGroup = null;
	}

	async function removeGroup(group: FragmentGroup) {
		if (group.system) {
			if (!confirm('这是系统分组。删除后其中碎片会移入未分组，确认继续？')) return;
		} else if (!confirm(`确认删除分组“${group.name}”？其中碎片会移入未分组。`)) {
			return;
		}

		await persistLibrary(deleteGroupFromLibrary(library, group.id));
		if (activeGroupId === group.id) activeGroupId = 'all';
	}

	function initSortableGroups(node: HTMLElement) {
		const sortable = new Sortable(node, {
			animation: 150,
			handle: '.group-drag-handle',
			onUpdate: async (event: any) => {
				const current = [...groups];
				const oldIndex = event.oldIndex ?? 0;
				const newIndex = event.newIndex ?? 0;
				const [moved] = current.splice(oldIndex, 1);
				current.splice(newIndex, 0, moved);

				await persistLibrary({
					...library,
					groups: current.map((item, order) => ({ ...item, order }))
				});
			}
		});

		return {
			destroy() {
				sortable.destroy();
			}
		};
	}

	function initSortableFragments(node: HTMLElement) {
		const sortable = new Sortable(node, {
			animation: 150,
			handle: '.fragment-drag-handle',
			onUpdate: async (event: any) => {
				const current = [...visibleFragments];
				const oldIndex = event.oldIndex ?? 0;
				const newIndex = event.newIndex ?? 0;
				const [moved] = current.splice(oldIndex, 1);
				current.splice(newIndex, 0, moved);

				const orderMap = new Map(current.map((fragment, order) => [fragment.id, order]));
				const fragments = library.fragments.map((fragment) =>
					orderMap.has(fragment.id) ? { ...fragment, order: orderMap.get(fragment.id) } : fragment
				);

				await persistLibrary({ ...library, fragments });
			}
		});

		return {
			destroy() {
				sortable.destroy();
			}
		};
	}
</script>

<svelte:head>
	<title>碎片库 - {$WEBUI_NAME}</title>
</svelte:head>

<div
	class="flex flex-col w-full h-screen max-h-[100dvh] transition-width duration-200 ease-in-out {$showSidebar
		? 'lg:max-w-[calc(100%-var(--sidebar-width))]'
		: ''} max-w-full"
>
	<nav class="px-2 pt-1.5 backdrop-blur-xl w-full drag-region shrink-0">
		<div class="flex items-center">
			{#if $mobile}
				<div class="{$showSidebar ? 'lg:hidden' : ''} flex flex-none items-center">
					<Tooltip
						content={$showSidebar ? $i18n.t('Close Sidebar') : $i18n.t('Open Sidebar')}
						interactive={true}
					>
						<button
							id="sidebar-toggle-button"
							class="cursor-pointer flex rounded-lg hover:bg-gray-100 dark:hover:bg-gray-850 transition"
							on:click={() => showSidebar.set(!$showSidebar)}
						>
							<div class="self-center p-1.5">
								<Sidebar />
							</div>
						</button>
					</Tooltip>
				</div>
			{/if}

			<div class="ml-2 py-0.5 self-center flex items-center justify-between w-full">
				<div class="text-sm font-medium text-gray-800 dark:text-gray-100">碎片库</div>
				<div class="self-center flex items-center gap-1">
					{#if $user !== undefined && $user !== null}
						<UserMenu
							className="w-[240px]"
							role={$user?.role}
							help={true}
							on:show={(e) => {
								if (e.detail === 'archived-chat') showArchivedChats.set(true);
							}}
						>
							<button
								class="select-none flex rounded-xl p-1.5 w-full hover:bg-gray-50 dark:hover:bg-gray-850 transition"
								aria-label="User Menu"
							>
								<div class="self-center">
									<Cog6 className="size-6 text-gray-500 dark:text-gray-400" />
								</div>
							</button>
						</UserMenu>
					{/if}
				</div>
			</div>
		</div>
	</nav>

	<div class="flex-1 min-h-0 overflow-hidden px-3 md:px-[18px] pb-4">
		<div class="flex flex-col gap-3 h-full pt-5">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<div class="text-xl font-semibold text-gray-900 dark:text-gray-100">碎片库</div>
					<div class="text-sm text-gray-500 mt-1">
						按一层分组管理跨对话复用设定。当前：{library.fragments.length} 个碎片，{groups.length} 个分组。
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<button
						class="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-850"
						on:click={() => (selectionMode = !selectionMode)}
					>
						{selectionMode ? '退出选择' : '选择模式'}
					</button>
					<button
						class="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-850"
						on:click={addGroup}
					>
						新建分组
					</button>
					<button
						class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition"
						on:click={createNewFragment}
					>
						新建碎片
					</button>
				</div>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-3 min-h-0 flex-1">
				<aside
					class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden flex flex-col min-h-[180px] lg:min-h-0"
				>
					<div
						class="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between"
					>
						<div class="text-sm font-medium text-gray-900 dark:text-gray-100">分组</div>
						{#if saving}
							<div class="text-xs text-gray-500">保存中</div>
						{/if}
					</div>
					<div class="p-2 space-y-1 overflow-y-auto">
						<button
							class="w-full text-left px-3 py-2 rounded-md text-sm {activeGroupId === 'all'
								? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
								: 'hover:bg-gray-100 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-200'}"
							on:click={() => (activeGroupId = 'all')}
						>
							全部碎片
							<span class="float-right text-xs opacity-70">{library.fragments.length}</span>
						</button>
						<button
							class="w-full text-left px-3 py-2 rounded-md text-sm {activeGroupId === 'ungrouped'
								? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
								: 'hover:bg-gray-100 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-200'}"
							on:click={() => (activeGroupId = 'ungrouped')}
						>
							<span
								class="inline-block size-2 rounded-full mr-2"
								style={`background:${ungroupedOption.color}`}
							></span>
							未分组
							<span class="float-right text-xs opacity-70"
								>{library.fragments.filter((f) => !f.group_id).length}</span
							>
						</button>

						<div use:initSortableGroups class="space-y-1">
							{#each groups as group (group.id)}
								<div
									class="rounded-md border {activeGroupId === group.id
										? 'border-gray-900 dark:border-gray-200'
										: 'border-transparent'}"
								>
									<div class="flex items-center">
										<button
											class="group-drag-handle shrink-0 px-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing"
											aria-label="拖动分组排序"
											title="拖动分组排序"
											on:click|stopPropagation={() => {}}
										>
											<MenuLines className="size-4" strokeWidth="1.5" />
										</button>
										<button
											class="min-w-0 flex-1 text-left px-1 py-2 rounded-md text-sm hover:bg-gray-100 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-200"
											on:click={() => (activeGroupId = group.id)}
										>
											<span
												class="inline-block size-2 rounded-full mr-2"
												style={`background:${group.color}`}
											></span>
											<span class="truncate">{group.name}</span>
											<span class="float-right text-xs opacity-70">
												{library.fragments.filter((f) => f.group_id === group.id).length}
											</span>
										</button>
									</div>
									<div class="flex items-center gap-1 px-2 pb-2">
										<button
											class="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-850"
											on:click={() => editGroup(group)}
										>
											编辑
										</button>
										<button
											class="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
											on:click={() => removeGroup(group)}
										>
											删除
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</aside>

				<section
					class="min-h-0 flex flex-col border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden"
				>
					<div
						class="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2"
					>
						<div class="flex items-center gap-2">
							<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
								{activeGroupName}
							</div>
							<div class="text-xs text-gray-500">{visibleFragments.length} 个</div>
						</div>
						<input
							bind:value={query}
							class="w-full sm:w-72 bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none focus:border-blue-500"
							placeholder="搜索标题或内容"
						/>
					</div>

					{#if selectionMode}
						<div
							class="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-2 bg-gray-50 dark:bg-gray-900"
						>
							<div class="text-xs text-gray-500">已选 {selectedCount} 个碎片</div>
							<button
								class="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
								on:click={selectVisible}
							>
								选择当前列表
							</button>
							<select
								class="text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1"
								on:change={(e) => bulkMove((e.currentTarget as HTMLSelectElement).value)}
								disabled={selectedCount === 0}
							>
								<option value="">批量移动到...</option>
								<option value="ungrouped">未分组</option>
								{#each groups as group}
									<option value={group.id}>{group.name}</option>
								{/each}
							</select>
							<button
								class="text-xs px-2 py-1 rounded bg-red-600 text-white disabled:opacity-40"
								disabled={selectedCount === 0}
								on:click={bulkDelete}
							>
								批量删除
							</button>
						</div>
					{/if}

					<div class="flex-1 overflow-y-auto p-3">
						{#if loaded}
							{#if editingGroup}
								<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3">
									<div class="text-sm font-medium mb-3">编辑分组</div>
									<div class="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
										<input
											bind:value={editingGroup.name}
											class="bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm"
											placeholder="分组名称"
										/>
										<input
											bind:value={editingGroup.color}
											type="color"
											class="h-10 border border-gray-200 dark:border-gray-700 rounded-md bg-transparent"
											title="分组颜色"
										/>
										<div class="flex gap-2">
											<button
												class="px-3 py-2 text-sm rounded-md bg-blue-600 text-white"
												on:click={saveGroup}>保存</button
											>
											<button
												class="px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700"
												on:click={() => (editingGroup = null)}
											>
												取消
											</button>
										</div>
									</div>
								</div>
							{/if}

							{#if editingFragment}
								<div
									class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col gap-3 min-h-[50dvh]"
								>
									<input
										bind:value={editingFragment.title}
										placeholder="碎片标题"
										class="w-full bg-transparent text-lg font-medium border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
									/>
									<select
										bind:value={editingFragment.group_id}
										class="w-full bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
									>
										<option value={null}>未分组</option>
										{#each groups as group}
											<option value={group.id}>{group.name}</option>
										{/each}
									</select>
									<textarea
										bind:value={editingFragment.content}
										placeholder="碎片内容"
										class="w-full flex-1 min-h-[260px] bg-transparent text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-blue-500"
									></textarea>
									<div class="flex justify-end gap-2">
										<button
											class="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
											on:click={() => (editingFragment = null)}
										>
											取消
										</button>
										<button
											class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
											on:click={saveEditedFragment}
										>
											保存
										</button>
									</div>
								</div>
							{:else if visibleFragments.length > 0}
								<div
									use:initSortableFragments
									class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
								>
									{#each visibleFragments as fragment (fragment.id)}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div
											class="border border-gray-200 dark:border-gray-800 rounded-lg p-4 flex flex-col min-h-44 hover:border-blue-400 dark:hover:border-blue-600 transition cursor-pointer"
											on:click={() =>
												selectionMode ? toggleSelection(fragment.id) : editFragment(fragment)}
										>
											<div class="flex items-start justify-between gap-2 mb-2">
												<div class="min-w-0">
													<div class="flex items-center gap-2">
														<button
															class="fragment-drag-handle text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing px-1"
															aria-label="拖动排序"
															title="拖动排序"
															on:click|stopPropagation={() => {}}
														>
															<MenuLines className="size-4" strokeWidth="1.5" />
														</button>
														<div class="font-medium text-gray-900 dark:text-gray-100 truncate">
															{fragment.title || '未命名碎片'}
														</div>
													</div>
													<div class="text-xs text-gray-500 mt-1">
														{groups.find((group) => group.id === fragment.group_id)?.name ||
															'未分组'}
													</div>
												</div>
												{#if selectionMode}
													<input
														type="checkbox"
														checked={selectedIds.has(fragment.id)}
														on:click|stopPropagation={() => toggleSelection(fragment.id)}
													/>
												{/if}
											</div>
											<div
												class="text-sm text-gray-600 dark:text-gray-400 line-clamp-6 whitespace-pre-wrap flex-1"
											>
												{fragment.content || '无内容'}
											</div>
											<div
												class="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-gray-100 dark:border-gray-800"
											>
												<button
													class="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
													on:click|stopPropagation={() => deleteFragment(fragment.id)}
												>
													删除
												</button>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div
									class="text-center text-gray-500 text-sm py-16 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg"
								>
									当前范围没有碎片。
								</div>
							{/if}
						{:else}
							<div class="text-gray-500 text-sm p-4 text-center">加载中...</div>
						{/if}
					</div>
				</section>
			</div>
		</div>
	</div>
</div>
