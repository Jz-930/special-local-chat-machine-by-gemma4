# 5-2 UI Redesign: Phase-1a Layout

## 整体背景 (Overall Background)
本阶段是 Open WebUI 界面重构的第一步。侧边栏 (Sidebar) 和顶部导航 (Navbar) 构成了整个应用的最外层骨架。Gladia.io 的侧边栏设计以极其深邃的木炭黑、精准的分组间距和左侧紫色激活指示条为特色。

## 本线程任务 (Tasks for this thread)
我们需要彻底改造以下组件的视觉结构：
1. **`src/lib/components/layout/Sidebar.svelte`**：重构折叠/展开两种状态的容器，移除生硬的边框（Border），采用更深邃的背景融合。
2. **`src/lib/components/layout/Sidebar/ChatItem.svelte`**：重构聊天历史列表项，改写 Hover 状态与激活状态的视觉反馈。
3. **`src/lib/components/layout/Navbar.svelte`**：如果是透明布局，将其改造为带磨砂玻璃质感的悬浮态导航。

## ⚠️ 执行前警告：纯前端操作！
**切勿修改**：
- `$showSidebar` 的响应式逻辑和断点触发条件。
- `initChatList()` 等任何数据拉取函数。
- 绑定在 `<button>` 或 `<a>` 上的 `on:click` 与事件修饰符 (`|stopPropagation` 等)。

## 执行步骤与 Debug
### Step 1: 改造外层容器 (Sidebar Container)
- 使用 Refero MCP 查找 Gladia 的侧栏背景色（通常是 `#0B0F14` 或其临近色）。
- 在保留 `bind:this={navElement}` 和动画指令的前提下，将默认的 `bg-gray-50 dark:bg-gray-950` 等类替换为新的质感类名。
- **Debug 测试**：验证屏幕尺寸缩小到 Mobile 状态下，侧边栏的唤出和隐藏逻辑是否仍然正常。

### Step 2: 改造按钮与列表项 (Items & Buttons)
- 将侧栏内的所有操作按钮（如 "New Chat", "Search"）改成药丸形结构（增加 padding 和 rounded-xl）。
- **Debug 测试**：点击 "New Chat" 必须仍然能够成功清空当前上下文。

---
完成此阶段后，界面的外围骨架应呈现出完美的 Gladia 质感。
