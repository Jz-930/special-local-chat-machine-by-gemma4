# RunPod 部署与预热提示

## 背景

本项目通过 Open WebUI 连接 RunPod 上的 Ollama 服务，RunPod 暴露的 Ollama 地址类似：

```text
https://xxxxxx-11434.proxy.runpod.net
```

模型示例：

```text
gemma-novel:latest
gemma-novel-ab:latest
```

这两个模型是同一基础模型的不同调教版本，平时可以在 Open WebUI 中切换使用。

## 关键结论

每次新建 pod、重启 pod、重新部署 pod 后，不要只确认 Open WebUI 能读到模型名。模型名来自 Ollama 的 `/api/tags`，这个接口只读取模型列表，不会真正加载模型。

第一次真正对话时，Ollama 需要冷加载 30B Q8 模型。如果第一次请求是从 Open WebUI 经 RunPod 外部 proxy 发起，模型加载时间可能超过 Cloudflare/RunPod proxy 的等待窗口，最终报：

```text
DME Writing Engine: Server Connection Error
```

或者外部直接请求时出现：

```text
HTTP 524
```

解决方法是在 RunPod 容器内部先手动预热模型，让 Ollama runner 真正启动。

## 新 pod 启动后的固定操作

进入 RunPod Web Terminal，执行：

```bash
ollama run gemma-novel:latest "hi"
```

如果使用另一个版本，则执行：

```bash
ollama run gemma-novel-ab:latest "hi"
```

等模型回复之后，再回到 Open WebUI 对话。

## 验证模型是否真的加载

在 RunPod 另一个终端运行：

```bash
watch -n 1 ollama ps
```

正常情况下应该看到模型出现在列表里，例如：

```text
NAME                  ID              SIZE      PROCESSOR    CONTEXT    UNTIL
gemma-novel:latest    ...             ...       ...          ...        ...
```

也可以看 GPU 是否有 Ollama/runner 进程：

```bash
watch -n 1 nvidia-smi
```

正常情况下，模型加载后会看到显存占用上升，并出现相关进程。

## HTTPS 注意事项

Open WebUI 中的 Ollama URL 建议填写 `https://`，不要填写 `http://`：

```text
https://xxxxxx-11434.proxy.runpod.net
```

原因是 RunPod proxy 现在可能会把 HTTP 强制 301 跳转到 HTTPS。模型列表的 GET 请求有时能自动跟随跳转，所以看起来能读到模型；但聊天请求是 POST，带 JSON body 和流式/长连接行为，遇到 HTTP 到 HTTPS 的 301 跳转时更容易失败。

## 原理说明

Ollama 的几个接口行为不同：

```text
GET  /api/tags      读取模型列表，不加载模型
GET  /api/ps        查看当前正在运行/加载的模型
POST /api/chat      聊天生成，会触发模型加载
POST /api/generate  文本生成，会触发模型加载
```

Open WebUI 能显示模型名，只说明 `/api/tags` 正常，不代表 `/api/chat` 已经能生成。

30B Q8 模型冷加载可能很慢。如果外部 proxy 在模型输出第一个 token 前超时，Open WebUI 就只会看到连接错误。手动在 pod 内执行 `ollama run` 是绕过外部 proxy 的本地加载，能等到模型真正启动。

## 排查流程

如果 Open WebUI 报：

```text
DME Writing Engine: Server Connection Error
```

按顺序检查：

1. 确认 Open WebUI 的 Ollama URL 是 HTTPS。

2. 在 RunPod 终端确认模型存在：

```bash
ollama list
```

3. 确认当前是否已有模型运行：

```bash
ollama ps
```

4. 如果 `ollama ps` 为空，手动预热：

```bash
ollama run gemma-novel:latest "hi"
```

5. 如果预热卡住，另开终端看 GPU：

```bash
nvidia-smi
```

6. 如果 GPU 没有显存占用，说明 runner 可能没有启动、没有用上 GPU，或 pod/宿主机状态异常。

## RunPod 异常提示

如果收到 RunPod 推送：

```text
We have detected a critical error on this machine which may affect some pods.
```

应优先备份数据，并考虑新建 pod。宿主机异常可能导致：

- 模型冷加载极慢
- 生成请求 524
- GPU 不工作
- Ollama runner 不启动
- Open WebUI 间歇性连接错误

## 简短记忆版

新 pod 启动后：

```bash
ollama run gemma-novel:latest "hi"
ollama ps
```

看到模型已运行后，再用 Open WebUI。

