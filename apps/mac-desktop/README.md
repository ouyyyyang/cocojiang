# Mac Desktop Shell

这个目录是 Mac 原生桌面壳。

入口：

- [Package.swift](/Users/oyzh/interview/apps/mac-desktop/Package.swift)

职责：

- 启动和停止本地 agent
- 显示日志
- `Codex / LM Studio / Ollama` 模型配置
- Codex 认证
- `LM Studio / Ollama` 运行时状态检测和当前模型管理
- 抓屏测试
- 模型测试
- 历史和详情查看

## Build

在仓库根目录执行：

```bash
npm run build:mac-app
```

生成物：

- `build/mac-desktop/Screen Pilot Native.app`

## Run In Xcode

如果你直接开发 SwiftUI：

1. 用 Xcode 打开 [Package.swift](/Users/oyzh/interview/apps/mac-desktop/Package.swift)
2. 运行 `MacScreenAgentDesktopApp`

## Local Models On Mac

### LM Studio (Preferred)

这是当前在 Mac 上更推荐的本地路径。

最短路径：

1. 安装并启动 `LM Studio`
2. 执行：

```bash
~/.lmstudio/bin/lms bootstrap
lms get --mlx qwen3-vl-8b
lms ls
lms server start
lms load <model_key> --identifier qwen3-vl:8b
```

3. 在 App 配置页把模型提供方切到 `LM Studio (MLX)`
4. 模型标识保持 `qwen3-vl:8b`
5. 你也可以直接用 App 里的运行时按钮：
   - `启动 Server`
   - `下载当前模型`
   - `加载当前模型`
6. 去“测试”页直接运行模型测试

### Ollama

如果你想保留跨平台一致性，也支持 `Ollama`：

```bash
ollama pull qwen3-vl:8b
ollama serve
```

然后在 App 配置页切到 `Local Ollama`。

对 `24GB` 统一内存的 Mac，先用 `qwen3-vl:8b` 比较合适；如果只想先看通路，可切 `qwen3-vl:4b`。

## Runtime Directory Policy

- `Screen Pilot` 不接管 `LM Studio.app` 或 `Ollama.app` 的安装
- `Screen Pilot` 不做任意模型路径管理
- `LM Studio` 的模型目录继续由 LM Studio 自己管理
- `Ollama` 的模型目录继续由 `~/.ollama/models` 或 `OLLAMA_MODELS` 管理
- `LM Studio` 当前只做下载 / 加载 / 卸载
- `Ollama` 的删除由 App 调 `ollama rm <model>`
