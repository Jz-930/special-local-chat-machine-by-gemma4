# Immersive Writing Engine - UX/UI Rebuild Log

> 本文档用于记录从 Open WebUI 重构为“沉浸式小说写作 IDE”过程中，前端所做的所有核心 UX/UI 改动及具体代码实现路径。便于未来版本升级时的追溯、复用与 Debug。

## 1. 品牌重塑与去中心化 (Brand & Privacy Stripping)
- **目标**：移除所有 IO 痕迹、移除社交化与多账户体系的视觉体现，将其定位为纯粹的个人私有化离线工具。
- **具体实施**：
  - **全局信息替换**：修改 `src/app.html`，移除原有的 `favicon.png`，替换为自定义品牌 Logo (`DME logo v3`)，并将网页标题 `<title>` 更改为 "Immersive Writing Engine"。
  - **移除侧边栏用户信息**：在 `src/lib/components/layout/Sidebar.svelte` 中，彻底移除了左下角的登录头像 (`UserMenu`) 及对应的“在线状态”模块。
  - **全局 Navbar 头像替换**：在聊天 (`chat/Navbar.svelte`)、频道 (`channel/Navbar.svelte`)、笔记 (`notes/+page.svelte`) 页面中，将右上角原本展示用户头像的 `<img />` 全部替换为原生的 `<Cog6 />` (齿轮图标)，防止在去掉多账户逻辑后出现加载失败的“裂图”。
  - **去除烦人的升级弹窗**：在 `src/routes/(app)/+layout.svelte` 中，移除了 Github 自动拉取更新及弹出 `UpdateInfoToast` 的逻辑。

## 2. 沉浸式写作体验改造 (Immersive Writing IDE)
- **目标**：打造无干扰（Distraction-free）、排版舒适、适合长篇创作的环境。
- **具体实施**：
  - **拓宽视野 (Widescreen Layout)**：
    - `src/lib/components/chat/Messages/Message.svelte`：对话流最大宽度从 `max-w-3xl` (窄条) 拓宽至 `max-w-7xl`。
    - `src/lib/components/chat/Placeholder.svelte`：初始欢迎页容器拓宽至 `max-w-5xl`。
  - **字号与行间距 (Typography)**：
    - 在 `UserMessage.svelte` 和 `ResponseMessage.svelte` 中，向 `markdown-prose` 容器追加 `text-lg` 与 `leading-loose` Tailwind 类，显著提升长文本阅读的舒适度（类似 Kindle 默认排版）。
  - **精简输入框 (Input Area Optimization)**：
    - 在 `src/lib/components/chat/MessageInput.svelte` 中，通过代码移除了“语音输入 (Voice)”、“通话 (Call)”、“多模态附件上传 (Vision/File)”等冗余图标。
    - 引入了 `backdrop-blur` 毛玻璃特效以提升输入区的现代质感。
  - **侧边栏触控优化**：
    - 在 `Sidebar.svelte` 中，将所有导航按钮（新建对话、搜索、笔记等）的垂直内边距从 `py-2` 增大至 `py-3`，大幅提升在手机端和高分辨率屏下的点击命中率。

## 3. 工作流逻辑的本地化与定制 (Workflow Customization)
- **目标**：将原本针对“多人协作/编程开发”的术语，重构为符合“网文小说创作”的术语。
- **具体实施**：
  - **术语映射 (Localization)**：在 `src/lib/i18n/locales/zh-CN/translation.json` 中，将所有“Folder / 分组”相关术语批量重命名为“Project / 项目”。利用其原本能共享系统 Prompt 的特性，完美充当了小说的“项目管理夹”。
  - **功能入口精简**：从 `Sidebar.svelte` 的置顶菜单 (`pinnedItems`) 中，通过条件渲染去除了“工作空间 (Workspace)”入口，隐藏不相关的功能。

## 4. 全局模型与背景状态管理 (Global Status & Background)
- **目标**：利用底层现有机制实现新功能，避免制造冗余的技术债。
- **具体实施**：
  - **连接状态可视化**：在 `Sidebar.svelte` 左下角（原头像区域），接管了当前可用模型的判断逻辑。如果有模型可用，展示绿色呼吸灯；如果无模型可用，则变为一个显眼的齿轮按钮，点击直接执行 `goto('/admin/settings/connections')`，将高频的“管理连接”行为提至一级入口。
  - **全局背景 (Global Background)**：
    - 发现系统在 `Settings -> Interface -> Chat Background Image` 中已经内置了极为完善的背景上传、Base64 `localStorage` 持久化保存及渐变蒙版（防文字看不清）机制。
    - 补充了全局 Fallback 逻辑：将 `h:\uncensored\image\DME logo v3 - bg透明-02.webp` 放入 `static/logo.webp`。在 `Placeholder.svelte`（主页问候头像）及 `UserMenu.svelte`（下拉菜单头像）中添加了 `on:error` 捕获，当模型无头像时，完美退化并展示用户的品牌 Logo。

## 5. 全局碎片库与记忆抽屉解耦 (Global Fragments Library)
- **目标**：解决不同对话（小说卷章）之间共享和复用设定卡片的痛点，且保证在复用时绝不互相污染彼此的独立上下文。
- **具体实施**：
  - **独立路由与纯粹仓储 (Fragments View)**：新建了 `src/routes/(app)/fragments/+page.svelte` 路由，作为一个纯粹的“全局大仓库”。其底层利用 Notes API 建立了一个名为 `MemoryVault_Global_Fragments` 的专属档案（此档案完全静默，不参与任何大模型推断，0 Token 损耗）。
  - **跨库热插拔机制 (MemoryDrawer Updates)**：
    - **单向导出**：在原本的记忆抽屉卡片上增加了“保存至碎片库”功能，可将当前聊天室的得意设定一键深拷贝（克隆）进大仓库。
    - **物理隔离导入**：增加了“从碎片库导入”面板，点击导入时，系统会为抽屉强制生成全新的 `UUID` (`uuidv4`)，实现“切断血缘的克隆”。这保证了如果你在单本小说抽屉内对卡片内容做了剧情推移（如更改了某个设定的状态），该修改绝对不会反向污染碎片库中的原始设定模板。
