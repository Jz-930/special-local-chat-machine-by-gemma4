<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		clearArchiveData,
		deleteArchivePack,
		exportArchivePack,
		exportArchivePackFiles,
		importArchivePack,
		importArchivePackFiles,
		inspectArchiveClear,
		inspectArchivePack,
		listArchivePacks
	} from '$lib/apis/archive-packs';
	import { WEBUI_NAME, showArchivedChats, showSidebar, mobile, user } from '$lib/stores';
	import Sidebar from '$lib/components/icons/Sidebar.svelte';
	import UserMenu from '$lib/components/layout/Sidebar/UserMenu.svelte';
	import Cog6 from '$lib/components/icons/Cog6.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	const i18n = getContext('i18n') as any;

	const defaultScope: Record<string, boolean> = {
		chats: true,
		archived_chats: true,
		notes: true,
		memory_vaults: true,
		fragments: true,
		memories: true,
		folders: true,
		tags: true,
		settings: false,
		files: false
	};

	let packs: any[] = [];
	let loading = false;
	let working = false;
	let packName = '';
	let selectedPack = '';
	let importMode = 'merge';
	let importConfirmText = '';
	let clearConfirmText = '';
	let scope: Record<string, boolean> = { ...defaultScope };
	let lastReport: any = null;
	let clearPreview: any = null;

	const scopeLabels: Record<string, string> = {
		chats: '普通对话',
		archived_chats: '归档对话',
		notes: '普通 Notes',
		memory_vaults: '记忆抽屉',
		fragments: '碎片库',
		memories: '系统记忆',
		folders: 'Folders',
		tags: 'Tags'
	};

	onMount(async () => {
		await refreshPacks();
	});

	async function refreshPacks() {
		loading = true;
		try {
			const res = await listArchivePacks(localStorage.token);
			packs = res?.items || [];
			if (!selectedPack && packs[0]) selectedPack = packs[0].name;
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			loading = false;
		}
	}

	async function runExport() {
		working = true;
		try {
			lastReport = await exportArchivePack(localStorage.token, {
				pack_name: packName.trim() || null,
				scope
			});
			packName = '';
			await refreshPacks();
			toast.success('档案包已导出');
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			working = false;
		}
	}

	async function runDiskExport() {
		if (!(window as any).showDirectoryPicker) {
			toast.error('当前浏览器不支持目录选择。请用 Chrome、Edge 或桌面客户端打开。');
			return;
		}

		working = true;
		try {
			const rootHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
			const payload = await exportArchivePackFiles(localStorage.token, {
				pack_name: packName.trim() || null,
				scope
			});
			let packDir;
			try {
				packDir = await rootHandle.getDirectoryHandle(payload.pack_name);
				if (
					!confirm(`目录中已存在档案包“${payload.pack_name}”，继续会覆盖同名档案文件。是否继续？`)
				) {
					return;
				}
			} catch {
				packDir = await rootHandle.getDirectoryHandle(payload.pack_name, { create: true });
			}
			for (const [relativePath, text] of Object.entries(payload.files || {})) {
				await writeTextFile(packDir, relativePath, text as string);
			}
			packName = '';
			lastReport = {
				...(payload.report || {}),
				path: `${rootHandle.name}/${payload.pack_name}`,
				files_written: Object.keys(payload.files || {}).length
			};
			toast.success('档案包已写入你选择的目录');
		} catch (error) {
			if ((error as any)?.name !== 'AbortError') toast.error(`${error}`);
		} finally {
			working = false;
		}
	}

	async function runInspect() {
		if (!selectedPack) return;
		working = true;
		try {
			lastReport = await inspectArchivePack(localStorage.token, {
				pack_name: selectedPack,
				mode: importMode,
				conflict: 'exact_overwrite'
			});
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			working = false;
		}
	}

	async function runImport() {
		if (!selectedPack) return;
		if (importMode === 'replace' && importConfirmText !== selectedPack) {
			toast.error('替换导入需要输入档案包名确认');
			return;
		}

		working = true;
		try {
			lastReport = await importArchivePack(localStorage.token, {
				pack_name: selectedPack,
				mode: importMode,
				conflict: 'exact_overwrite',
				confirm_text: importConfirmText,
				rebuild_memory_vectors: true
			});
			toast.success('档案包已导入');
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			working = false;
		}
	}

	async function runDiskInspect() {
		const loaded = await chooseAndReadArchiveFolder();
		if (!loaded) return;
		const { folderName, files, manifest } = loaded;
		lastReport = {
			pack_name: folderName,
			path: folderName,
			manifest,
			counts: manifest?.counts || {},
			files: Object.keys(files).sort(),
			requires_confirmation: importMode === 'replace',
			confirmation_text: importMode === 'replace' ? folderName : null
		};
	}

	async function runDiskImport() {
		const loaded = await chooseAndReadArchiveFolder();
		if (!loaded) return;
		const { folderName, files } = loaded;

		if (importMode === 'replace' && importConfirmText !== folderName) {
			toast.error(`替换导入需要输入档案包文件夹名：${folderName}`);
			return;
		}

		working = true;
		try {
			lastReport = await importArchivePackFiles(localStorage.token, {
				pack_name: folderName,
				files,
				mode: importMode,
				conflict: 'exact_overwrite',
				confirm_text: importConfirmText,
				rebuild_memory_vectors: true
			});
			toast.success('磁盘档案包已导入');
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			working = false;
		}
	}

	async function runClearInspect() {
		working = true;
		try {
			clearPreview = await inspectArchiveClear(localStorage.token, {
				scope,
				create_backup_before_clear: true
			});
			lastReport = clearPreview;
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			working = false;
		}
	}

	async function runClear() {
		if (clearConfirmText !== '清空所有使用资料') {
			toast.error('请输入“清空所有使用资料”确认');
			return;
		}

		working = true;
		try {
			lastReport = await clearArchiveData(localStorage.token, {
				scope,
				create_backup_before_clear: true,
				backup_pack_name: clearPreview?.backup_pack_name,
				confirm_text: clearConfirmText
			});
			clearConfirmText = '';
			clearPreview = null;
			await refreshPacks();
			toast.success('使用资料已清空');
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			working = false;
		}
	}

	async function removePack(name: string) {
		if (!confirm(`确认删除档案包“${name}”？`)) return;
		working = true;
		try {
			await deleteArchivePack(localStorage.token, name);
			if (selectedPack === name) selectedPack = '';
			await refreshPacks();
			toast.success('档案包已删除');
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			working = false;
		}
	}

	function countEntries(counts: Record<string, number> = {}) {
		return Object.entries(counts)
			.map(([key, value]) => `${scopeLabels[key] || key}: ${value}`)
			.join(' / ');
	}

	async function writeTextFile(directoryHandle: any, relativePath: string, text: string) {
		const parts = relativePath.split('/').filter(Boolean);
		const fileName = parts.pop();
		if (!fileName) return;

		let targetDirectory = directoryHandle;
		for (const part of parts) {
			targetDirectory = await targetDirectory.getDirectoryHandle(part, { create: true });
		}

		const fileHandle = await targetDirectory.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(text);
		await writable.close();
	}

	async function chooseAndReadArchiveFolder() {
		if (!(window as any).showDirectoryPicker) {
			toast.error('当前浏览器不支持目录选择。请用 Chrome、Edge 或桌面客户端打开。');
			return null;
		}

		try {
			const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
			const files = await readDirectoryFiles(directoryHandle);
			if (!files['manifest.json']) {
				toast.error('请选择档案包文件夹，文件夹根目录需要有 manifest.json');
				return null;
			}

			const manifest = JSON.parse(files['manifest.json']);
			if (manifest?.app !== 'open-webui-memory-vault') {
				toast.error('这个文件夹不是记忆档案包');
				return null;
			}

			return { folderName: directoryHandle.name, files, manifest };
		} catch (error) {
			if ((error as any)?.name !== 'AbortError') toast.error(`${error}`);
			return null;
		}
	}

	async function readDirectoryFiles(
		directoryHandle: any,
		prefix = ''
	): Promise<Record<string, string>> {
		const files: Record<string, string> = {};
		for await (const [name, handle] of directoryHandle.entries()) {
			const relativePath = prefix ? `${prefix}/${name}` : name;
			if (handle.kind === 'directory') {
				Object.assign(files, await readDirectoryFiles(handle, relativePath));
			} else if (name.endsWith('.json') || name.endsWith('.jsonl')) {
				const file = await handle.getFile();
				files[relativePath] = await file.text();
			}
		}
		return files;
	}
</script>

<svelte:head>
	<title>档案管理 - {$WEBUI_NAME}</title>
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
				<div class="text-sm font-medium text-gray-800 dark:text-gray-100">档案管理</div>
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
							<Cog6 className="size-6 text-gray-500 dark:text-gray-400" />
						</button>
					</UserMenu>
				{/if}
			</div>
		</div>
	</nav>

	<div class="flex-1 overflow-y-auto px-3 md:px-[18px] pb-8">
		<div class="max-w-6xl mx-auto pt-5 space-y-4">
			<div>
				<div class="text-xl font-semibold text-gray-900 dark:text-gray-100">档案管理</div>
				<div class="text-sm text-gray-500 mt-1">
					把对话、归档对话、普通
					Notes、记忆抽屉、碎片库和系统记忆导出为文件夹，也可以从文件夹导入或清空当前使用资料。
				</div>
			</div>

			<section class="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
				<div class="flex items-center justify-between gap-2 mb-3">
					<div class="text-sm font-medium">导出范围</div>
					<button
						class="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
						on:click={() => (scope = { ...defaultScope })}
					>
						恢复默认
					</button>
				</div>
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
					{#each Object.entries(scopeLabels) as [key, label]}
						<label
							class="flex items-center gap-2 text-sm border border-gray-200 dark:border-gray-800 rounded-md px-3 py-2"
						>
							<input type="checkbox" bind:checked={scope[key]} />
							<span>{label}</span>
						</label>
					{/each}
				</div>
			</section>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<section class="border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3">
					<div>
						<div class="text-sm font-medium">导出到本机 / U盘目录</div>
						<div class="text-xs text-gray-500 mt-1">
							点击后会弹出目录选择，在你选的目录下生成一个完整档案包文件夹。
						</div>
					</div>
					<input
						bind:value={packName}
						class="w-full bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm"
						placeholder="档案包名称，留空自动生成"
					/>
					<div class="flex flex-wrap gap-2">
						<button
							class="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-40"
							disabled={working}
							on:click={runDiskExport}
						>
							选择目录并导出
						</button>
						<button
							class="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40"
							disabled={working}
							on:click={runExport}
						>
							导出到服务器暂存区
						</button>
					</div>
				</section>

				<section class="border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3">
					<div class="flex items-center justify-between">
						<div>
							<div class="text-sm font-medium">从本机 / U盘导入</div>
							<div class="text-xs text-gray-500 mt-1">
								选择档案包文件夹本身，也就是包含 manifest.json 的那个目录。
							</div>
						</div>
						<button
							class="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
							on:click={refreshPacks}
						>
							刷新
						</button>
					</div>
					<select
						bind:value={selectedPack}
						class="w-full bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm"
					>
						<option value="">选择档案包</option>
						{#each packs as pack}
							<option value={pack.name}>{pack.name}</option>
						{/each}
					</select>
					<div class="flex gap-2">
						<label class="flex items-center gap-2 text-sm">
							<input type="radio" bind:group={importMode} value="merge" />
							合并
						</label>
						<label class="flex items-center gap-2 text-sm">
							<input type="radio" bind:group={importMode} value="replace" />
							替换
						</label>
					</div>
					{#if importMode === 'replace'}
						<input
							bind:value={importConfirmText}
							class="w-full bg-transparent border border-red-300 dark:border-red-800 rounded-md px-3 py-2 text-sm"
							placeholder="替换导入请准确输入将要选择的档案包文件夹名"
						/>
					{/if}
					<div class="flex flex-wrap gap-2">
						<button
							class="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40"
							disabled={working}
							on:click={runDiskInspect}
						>
							选择文件夹并检查
						</button>
						<button
							class="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-40"
							disabled={working}
							on:click={runDiskImport}
						>
							选择文件夹并导入
						</button>
						<button
							class="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40"
							disabled={!selectedPack || working}
							on:click={runInspect}
						>
							检查服务器暂存包
						</button>
						<button
							class="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40"
							disabled={!selectedPack || working}
							on:click={runImport}
						>
							导入服务器暂存包
						</button>
					</div>
				</section>
			</div>

			<section class="border border-red-200 dark:border-red-900 rounded-lg p-4 space-y-3">
				<div>
					<div class="text-sm font-medium text-red-600 dark:text-red-400">清空所有使用资料</div>
					<div class="text-xs text-gray-500 mt-1">
						会先生成自动备份，再清空当前选择范围。需要输入固定确认文本。
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<button
						class="px-3 py-2 rounded-md border border-red-300 dark:border-red-800 text-sm disabled:opacity-40"
						disabled={working}
						on:click={runClearInspect}
					>
						生成清空预览
					</button>
					<input
						bind:value={clearConfirmText}
						class="min-w-64 flex-1 bg-transparent border border-red-300 dark:border-red-800 rounded-md px-3 py-2 text-sm"
						placeholder="请输入：清空所有使用资料"
					/>
					<button
						class="px-3 py-2 rounded-md bg-red-600 text-white text-sm disabled:opacity-40"
						disabled={working || !clearPreview}
						on:click={runClear}
					>
						确认清空
					</button>
				</div>
			</section>

			<section class="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
				<div class="text-sm font-medium mb-3">已有档案包</div>
				{#if loading}
					<div class="text-sm text-gray-500">加载中...</div>
				{:else if packs.length === 0}
					<div class="text-sm text-gray-500">暂无档案包。</div>
				{:else}
					<div class="space-y-2">
						{#each packs as pack}
							<div
								class="flex flex-wrap items-center justify-between gap-2 border border-gray-100 dark:border-gray-800 rounded-md px-3 py-2"
							>
								<div>
									<div class="text-sm font-medium">{pack.name}</div>
									<div class="text-xs text-gray-500">{countEntries(pack.manifest?.counts)}</div>
								</div>
								<div class="flex gap-2">
									<button
										class="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
										on:click={() => {
											selectedPack = pack.name;
											runInspect();
										}}
									>
										查看
									</button>
									<button
										class="text-xs px-2 py-1 rounded text-red-600 border border-red-200 dark:border-red-900"
										on:click={() => removePack(pack.name)}
									>
										删除
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<section class="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
				<div class="text-sm font-medium mb-3">清单报告</div>
				{#if lastReport}
					{#if lastReport.counts}
						<div class="text-sm text-gray-700 dark:text-gray-300 mb-3">
							{countEntries(lastReport.counts)}
						</div>
					{/if}
					<pre
						class="text-xs whitespace-pre-wrap overflow-auto bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-3 max-h-96">{JSON.stringify(
							lastReport,
							null,
							2
						)}</pre>
				{:else}
					<div class="text-sm text-gray-500">导出、检查、导入或清空后会在这里显示报告。</div>
				{/if}
			</section>
		</div>
	</div>
</div>
