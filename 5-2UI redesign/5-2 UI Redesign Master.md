# 5-2 UI Completely Redesign: Master Plan (Open WebUI ➡️ Gladia Style)

## 整体背景 (Overall Background)
本项目旨在将 Open WebUI 从底层组件开始，彻底重置并逐个重构为 Gladia.io 的高级深色质感设计体系（深邃木炭色、紫色光晕、药丸状玻璃拟物化控件）。由于整个重构涉及数百个组件，为了避免上下文超出（Context Window Limit），我们将整个任务拆分为多个独立的 Markdown 文档，每个文档代表一个可独立执行的线程。

## ⚠️ 核心重构原则 (Core Principles)
1. **纯前端换血，严禁破坏功能 (Frontend UI/UX Only)**：
   - 我们的目标是**只改外观和交互**，绝对不要去动已经设计好的后端数据逻辑。
   - **保留所有核心状态**：所有的 Svelte `store`（如 `$chats`, `$user`）、API 调用（如 `getChatList`）、事件绑定（如 `on:click`, `bind:value`）必须 **100% 原封不动**。
   - **只操作视图层**：重构仅限于替换 `class=""` 中的 Tailwind 类名、修改 HTML DOM 树的包裹结构（添加特效 `div` 等），以及引入过渡动画 (`transition:fade`)。

## 检查与 Debug 方案 (Checking & Debugging Strategy)
由于大改 UI 极易误删绑定的事件导致功能失效，我们必须在每个线程执行以下 Debug 策略：
1. **重构前快照验证**：在修改任何复杂组件（如 Sidebar）前，先梳理其暴露的所有 Props 和绑定的 Events，确保重置 UI 时不丢失任何 `on:click` 或参数绑定。
2. **样式隔离测试**：每次只重构一个独立的小组件（例如先改 `ChatItem.svelte`，再改 `Sidebar.svelte`），修改后立即在本地运行页面热更新检查视觉。
3. **功能回归测试 (Regression Test)**：视觉确认完毕后，必须手动触发该组件对应的交互功能（例如：点击能否正常切换侧边栏？表单能否正常保存？数据是否依然与 Store 同步？），并检查浏览器 Console 是否有报错。

## Refero MCP 使用策略
- **`refero_search_screens`**：检索 Gladia 各个页面（Dashboard、API 管理），寻找可复用的对标组件。
- **`refero_get_screen_content`**：提取核心视觉参数（圆角、玻璃拟物、投影深度）。
- **`refero_search_flows`**：对齐复杂交互（如表单分步、开关切换）的动态反馈逻辑。

---

## 任务拆分索引 (Phased Threads Index)

为实现多线程并行和有效管理，任务被拆分为以下子文档：

- **[Phase-1a: 布局与导航架构重置](./5-2%20UI%20Redesign%20-%20Phase-1a%20Layout.md)**
  - *包含组件*：`Sidebar.svelte`, `Navbar.svelte`, 侧边栏子项。
  - *执行顺序*：最先执行。

- **[Phase-1b: 核心组件库与模态框](./5-2%20UI%20Redesign%20-%20Phase-1b%20Core%20UI.md)**
  - *包含组件*：Buttons, Inputs, Toggles, `SettingsModal.svelte`。
  - *执行顺序*：可与 1a 同时进行或紧随其后。

- **[Phase-2: 聊天引擎沉浸体验](./5-2%20UI%20Redesign%20-%20Phase-2%20Chat.md)**
  - *包含组件*：`MessageInput.svelte`, `Message.svelte`。
  - *执行顺序*：依赖于基础组件库（1b）完成后执行。
