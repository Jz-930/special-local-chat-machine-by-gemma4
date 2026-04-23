# Phase 2 Target: Manual Memory Vault (手动存取记忆控制台)

## 📌 核心目标 (Core Objective)
在完全封闭的本地端 Open-WebUI 中，从前端界面级别 (UI Layer) 植入一套**纯手工管理的、反“上下文崩塌”的记忆收纳系统**。旨在彻底解决长篇小说连载中，大模型因为 Token 过载而产生的“设定遗忘”和“角色失忆”问题。

## 🛠️ 功能需求 (Functional Requirements)
1. **持久化侧边栏/抽屉面板 (The Vault UI)**
   - 在主聊天界面（或侧边栏空隙处）新增一个可以随时呼出和折叠的文本编辑器面板（Text Area）。
   - 用户可以在里面随时编写、粘贴、修改小说的世界观设定、人物面板、当前章节大纲等。
   - **随想随记**：UI 设计要求干净、无缝，不影响主打字区的美感，保持“写作沉浸感”。

2. **强制穿透系统特权级注入 (System Prompt Injection)**
   - 该面板中的所有文字，完全无视 Open-WebUI 默认的 Sliding Window（推土机丢弃机制）和历史记录长度限制。
   - 在底层逻辑中：每次用户点击发送时，这套系统会自动把抽屉里的文字**拼接到真正的 System Prompt** 里，作为最高优指令一次性喂给后端的 Gemma 模型。

3. **零摩擦热切换 (Zero-Friction Switching)**
   - 随改随存：不需要繁琐的保存按钮，文字内容改变时自动缓存在本地 LocalStorage 中。即便关闭网页，明天打开抽屉时设定依然存在。

## 💻 潜在技术实现路径 (Implementation Path in Svelte)
- **UI 改造点**：
  - 切入 `src/lib/components/layout` 或 `chat/Messages` 目录，增加一个可滑动的 `MemoryDrawer.svelte` 组件。
- **状态流控点**：
  - 在 `src/lib/stores` 中注入一个全局 Store 变量（例如 `$manualMemoryText`）。
- **拦截发送口**：
  - 修改 `src/lib/components/chat/MessageInput.svelte` 或其上游的 API 分发中心（`chat.ts`），在构建发送给后端的 `messages` 数组前，强行在最前面的 `role: "system"` 对象中并入 `$manualMemoryText`。

## 🎯 期待结果 (Expected Outcome)
大模型将变成一个带有**“钢印般最高记忆法则”**的终极打字机。无论写到第几万字，它永远记得抽屉里写着的每一条人物宿命和装备栏细节。
