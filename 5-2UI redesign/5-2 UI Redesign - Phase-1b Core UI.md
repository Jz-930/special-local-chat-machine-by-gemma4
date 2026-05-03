# 5-2 UI Redesign: Phase-1b Core UI & Modals

## 整体背景 (Overall Background)
所有高级应用质感的差异往往体现在表单控件和弹窗中。Gladia 的模态框（如设置界面、API Key 管理）抛弃了笨重的矩形设计，大量采用细条形滑块（Sliders）、药丸形开关（Toggle）以及极致精简的无边框输入框。

## 本线程任务 (Tasks for this thread)
重点攻克 Open WebUI 的公共库组件和系统设置面板：
1. **`src/lib/components/chat/SettingsModal.svelte`**：彻底重构设置模态框的布局，引入侧边栏导航式或顶部分页栏的 Gladia 风格。
2. **`src/lib/components/common/` 目录下的原子组件**：
   - 按钮 (`Button`)：主色调使用紫色 `#6F4CFF`。
   - 开关 (`Switch` / `Toggle`)：重构为深色轨道与亮色/紫色滑块。
   - 输入框 (`Input`)：只保留底部发光边框或采用全包裹弱内阴影。

## ⚠️ 执行前警告：纯前端操作！
**切勿修改**：
- 模态框中 `bind:value` 绑定的任何参数，特别是向后端 `saveSettings` 的数据结构。
- 任何基于 `$settings` 库的数据计算逻辑。

## 执行步骤与 Debug
### Step 1: 原子组件库重写 (Atomic Components)
- 使用 Refero 检索 Gladia 的表单输入页面。
- 将通用的样式类名封装或直接替换到基础组件。
- **Debug 测试**：在任何需要填写的表单处，确保输入焦点（Focus）能正确显示且绑定值正常更新。

### Step 2: 重构 SettingsModal
- 在不破坏现有数十个参数选项卡逻辑的情况下，将外层 wrapper 重置为 Gladia 的浮窗卡片结构（带有深邃阴影和大圆角）。
- **Debug 测试**：打开设置，切换所有的 Tab 页（General, Connections, Interface 等），确保内容不溢出、滚动条显示正确。
