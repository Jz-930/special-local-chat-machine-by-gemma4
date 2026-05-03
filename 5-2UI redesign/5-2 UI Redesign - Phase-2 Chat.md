# 5-2 UI Redesign: Phase-2 Chat Experience

## 整体背景 (Overall Background)
对话界面是用户停留时间最长的核心视图。Gladia 的交互美学不仅体现在暗色背景，还在于极其考究的排版（Typography）和内嵌式微调组件（如重新生成、点赞按钮的隐现设计）。

## 本线程任务 (Tasks for this thread)
我们需要彻底改造对话区域：
1. **`src/lib/components/chat/MessageInput.svelte`**：重构底部输入区域。摒弃方形的 textarea，打造具有药丸形或高圆角包裹、带悬浮和呼吸光效的多行输入框。
2. **`src/lib/components/chat/Messages/Message.svelte`**：重组消息气泡。区分用户消息和 AI 消息的底板颜色对比度，优化内联代码、表格的显示样式。
3. **功能操作区 (Toolbar / Actions)**：将消息底部的操作按钮（Edit, Copy, Rate）改造为默认极简或隐藏，Hover 时平滑浮现的单色线框风格。

## ⚠️ 执行前警告：纯前端操作！
**切勿修改**：
- `$socket` 或 `chatId` 的流式传输数据逻辑。
- markdown 的解析引擎 (`marked` 相关的解析管线)。
- 输入框的文件拖拽上传（Drag & Drop）处理逻辑。

## 执行步骤与 Debug
### Step 1: 改造输入区域 (Input Bar)
- 通过 Refero 分析 Gladia 的输入框阴影（Box-shadow）和边框发光（Box-shadow glow）细节。
- 不修改 `bind:value={prompt}` 的前提下，替换外部 wrapper。
- **Debug 测试**：验证回车发送、Shift+Enter 换行是否有效；验证文件上传按钮依然能触发系统选框。

### Step 2: 改造消息展示 (Message Bubbles)
- 将用户消息改为略带底色的深空灰卡片，AI 消息保持透明背景。
- **Debug 测试**：检查多步对话（包含长文本、Markdown、代码块）是否会破坏界面宽度，代码块是否仍支持一键 Copy。
