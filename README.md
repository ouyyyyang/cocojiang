# Screen Pilot

> 截屏一下，让 AI 帮你看。

Screen Pilot 是一个本地优先的屏幕分析工具。在电脑上跑一个 agent，它会截取屏幕、交给视觉模型（云端或本地）做分析，然后把结构化结果推回来。你可以在电脑浏览器里直接操作，也可以用手机远程触发和查看。

整个项目分为 **控制端**（电脑）和 **展示端**（手机）：

```
电脑（控制端）                        手机（展示端）
┌─────────────────────┐              ┌──────────────┐
│  agent 核心          │  WebSocket   │  iPhone 网页  │
│  抓屏 → 模型 → 结果  │ ◄──────────► │  配对、查看   │
│                     │              └──────────────┘
│  桌面控制台 /desktop  │
│  配置、测试、历史     │
└─────────────────────┘
```

| 层 | 目录 | 角色 |
|----|------|------|
| 核心 | `core/agent` | Node 18 + TypeScript，抓屏、调模型、存结果、推 WebSocket |
| 桌面网页壳 | `apps/mac-web` | 浏览器里的控制台，macOS / Windows 通用，路由 `/desktop` |
| Mac 原生壳 | `apps/mac-desktop` | SwiftUI 桌面 App，自动拉起 agent（macOS 专属） |
| 手机网页壳 | `apps/iphone-web` | 配对后远程发起分析、查看结果，不做配置 |
| 共享定义 | `shared/schemas` | 模型输出的 JSON Schema，所有 provider 共用 |
| 脚本 | `scripts` | 启动、停止、打包，macOS 和 Windows 各一套 |

## Quick Start

### 1. 启动控制端（电脑）

Clone 下来跑一行就行，脚本会自动检查 Node.js、安装依赖、编译、启动、打开浏览器：

**macOS：**

```bash
./scripts/dev/start-local-agent.command
```

**Windows：**

```powershell
pwsh -File ./scripts/dev/start-local-agent.ps1
```

启动成功后浏览器会自动打开 `http://127.0.0.1:8788/desktop`，配对 token 也会自动复制到剪贴板。

> 首次运行时脚本会自动 `npm install`，之后再跑就跳过了。如果没装 Node.js，脚本会提示你去哪下载。

想要 Mac 原生 App？额外一行：

```bash
npm run build:mac-app
# -> build/mac-desktop/Screen Pilot Native.app
```

### 2. 连接展示端（手机，可选）

Agent 启动后，终端会打印出局域网地址。用 iPhone 浏览器打开，输入配对 token，就能远程发起分析、实时查看结果。

手机只负责"看"和"触发"，所有配置、测试、模型管理都在电脑端完成。

## Core Commands

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式，ts-node 直接跑 |
| `npm run build` | TypeScript 编译到 `build/node/` |
| `npm run start` | 跑编译后的产物 |
| `npm test` | 编译 + 跑全部测试 |
| `npm run build:mac-app` | 打包 Mac 原生 `.app` |

## Repository Layout

```text
.
├── core/agent/          # agent 核心：路由、抓屏、模型调用、会话存储
│   ├── src/             # TypeScript 源码
│   └── test/            # 测试
├── apps/
│   ├── mac-desktop/     # SwiftUI 原生壳 (macOS only)
│   ├── mac-web/         # 桌面网页壳 (macOS + Windows)
│   └── iphone-web/      # 手机网页壳
├── scripts/
│   ├── dev/             # 启动 / 停止脚本 (.command + .ps1)
│   ├── build/           # 打包脚本
│   └── windows/         # Windows 抓屏 PowerShell 脚本
└── shared/schemas/      # 输出 JSON Schema
```

运行产物和构建产物跟源码分开放：

| 目录 | 内容 |
|------|------|
| `runtime/agent` | PID、端口、配对 token、会话数据 |
| `runtime/mac-desktop` | Mac 壳日志和测试缓存 |
| `build/node` | TypeScript 编译输出 |
| `build/mac-desktop` | `.app` 和 SwiftPM 构建缓存 |

## Requirements

- **macOS** 或 **Windows**
- Node.js **18.18+**
- 如果用 Codex provider：需安装 `codex` CLI
- macOS：终端需要 **Screen Recording** 权限
- Windows：允许 `powershell.exe` 执行本地抓屏脚本

## Model Providers

Screen Pilot 支持五种模型 provider，你可以随时在控制台切换：

| Provider | 类型 | 适合场景 |
|----------|------|----------|
| **Claude API** | 云端 | Anthropic Claude，视觉能力强，推荐云端首选 |
| **OpenAI API** | 云端 | OpenAI GPT-4o 系列，也兼容其他 OpenAI 兼容 API |
| **Codex** | 云端 | Codex CLI，需本地安装 codex |
| **LM Studio (MLX)** | 本地 | Apple Silicon Mac，推荐本地首选 |
| **Ollama** | 本地 | 跨平台，headless，适合 Windows / Linux |

### Claude API (推荐云端)

用 Anthropic 的 Claude 模型做视觉分析，支持 Sonnet / Opus / Haiku：

1. 去 [console.anthropic.com](https://console.anthropic.com/) 拿一个 API Key
2. 打开 `/desktop` 控制台 -> 配置
3. 模型提供方选 `Claude API`
4. 选择模型（推荐 `Claude Sonnet 4.6`）
5. 填入 API Key，保存
6. 去测试页跑一次验证

也可以通过环境变量配置：`CLOUD_API_KEY=sk-ant-... MODEL_PROVIDER=claude`

### OpenAI API

用 OpenAI 的 GPT-4o 或任何兼容 API（Groq、Together 等）：

1. 去 [platform.openai.com](https://platform.openai.com/) 拿 API Key
2. 配置页选 `OpenAI API`，选模型，填 Key，保存

如果要用第三方兼容 API，设置 `OPENAI_BASE_URL` 指向对应服务即可。

### Codex

通过本地安装的 Codex CLI 调用云端模型：

1. 打开 `/desktop` 控制台 -> 配置
2. 模型提供方选 `Codex`
3. 点"开始 OpenAI 认证"（macOS 会打开 Terminal，Windows 会打开新控制台）

或者命令行直接登录：

```bash
codex -c 'model_reasoning_effort="high"' login
```

### LM Studio (Mac 本地推荐)

LM Studio 是一个带 GUI 的本地模型平台，自带 server 和 CLI。在 Apple Silicon Mac 上跑 MLX 版本的模型特别快。

**5 分钟上手：**

```bash
# 1. 安装 LM Studio 并至少打开一次，然后：
~/.lmstudio/bin/lms bootstrap

# 2. 下载模型 (MLX 版本)
lms get --mlx qwen3-vl-8b

# 3. 启动 server 并加载
lms server start
lms load <model_key> --identifier qwen3-vl:8b    # model_key 从 lms ls 获取

# 4. 确认就绪
lms ps
```

回到 Screen Pilot 控制台，配置页选 `LM Studio (MLX)`，模型保持 `qwen3-vl:8b`，去测试页跑一次就行。

> 你也可以直接用控制台里"运行时管理"的按钮来完成上面这些步骤，不用敲命令。

### Ollama

跨平台的本地模型服务，适合不想装 GUI 的场景：

```bash
ollama pull qwen3-vl:8b    # 或先拉个轻的: ollama pull qwen3-vl:4b
ollama serve                # 如果提示连不上 127.0.0.1:11434
```

控制台配置页切到 `Local Ollama`，选模型，测试，完事。

### 本地模型推荐 (24GB Mac)

| 用途 | 推荐 |
|------|------|
| 主力 | LM Studio (MLX) + `qwen3-vl:8b` |
| 快速验证 | `qwen3-vl:4b` |
| 跨平台备选 | Ollama + `qwen3-vl:8b` |

## Runtime Management

`/desktop` 控制台和 Mac 原生壳都集成了运行时管理，你可以在界面上一键完成：

- 检测 LM Studio / Ollama 是否已安装
- 启动本地 server
- 下载 / 加载 / 卸载当前配置模型
- 删除模型（仅 Ollama，LM Studio 建议去它自己的界面删）

**Screen Pilot 不做的事：**

- 不帮你安装 LM Studio.app 或 Ollama.app（给你下载链接，自己装）
- 不接管模型文件目录（LM Studio 的归 LM Studio，Ollama 的归 Ollama）

## The Three Shells

### Mac Desktop Shell (macOS only)

原生 SwiftUI 壳，入口在 [apps/mac-desktop/Package.swift](apps/mac-desktop/Package.swift)。

自动拉起 agent、模型配置、Codex 认证、抓屏测试、模型测试、历史和日志 —— 全部内置。开发 SwiftUI 壳本身可以用 Xcode 打开 Package.swift。

### Desktop Web Shell (macOS + Windows)

浏览器里的桌面控制台，路由 `/desktop`，入口 [apps/mac-web/public/index.html](apps/mac-web/public/index.html)。

功能和原生壳对齐：配对、配置、认证、运行时管理、测试、历史，全都有。Windows 用户主要用这个。

### iPhone Web Shell

手机上的轻量壳，入口 [apps/iphone-web/public/index.html](apps/iphone-web/public/index.html)。

只做五件事：配对、发起分析、看状态、看详情、翻历史。配置和测试这些"重活"留给桌面端。

## Environment Variables

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `8787` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `PAIRING_TOKEN` | 固定配对令牌，不设则自动生成 | 随机 UUID |
| `APP_DATA_DIR` | 本地数据目录 | `~/.mac-screen-agent-mvp` |
| `CODEX_TIMEOUT_MS` | 模型分析超时（所有 provider 通用） | `120000` |
| `MODEL_PROVIDER` | 默认 provider | `codex` |
| `CLOUD_API_KEY` | Claude / OpenAI API Key | 无 |
| `CLOUD_MODEL` | 云端模型标识 | 无 |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 地址 | `https://api.openai.com` |
| `CODEX_BIN` | codex 可执行文件路径 | `codex` |
| `LOCAL_VISION_MODEL` | 本地模型标识 | `qwen3-vl:8b` |
| `LMSTUDIO_HOST` | LM Studio server 地址 | `http://127.0.0.1:1234` |
| `OLLAMA_HOST` | Ollama 地址 | `http://127.0.0.1:11434` |
| `SCREEN_PILOT_CAPTURE_BACKEND` | 抓屏 backend (`auto` / `macos` / `windows`) | `auto` |
| `CAPTURE_BIN` | 抓屏命令路径 | macOS: `/usr/sbin/screencapture`，Windows: `powershell.exe` |

## Notes

- 抓屏 backend 按平台自动选择：`darwin` -> `macos`，`win32` -> `windows`
- Windows 抓屏通过 [scripts/windows/capture-screen.ps1](scripts/windows/capture-screen.ps1) 实现，截取主显示器整屏
- 当前只支持 `main_display`，接口预留了 `frontmost_window` 扩展位
- LM Studio 和 Ollama 建议使用相同的模型标识（如 `qwen3-vl:8b`），方便切换
- 历史会话和截图保存在 `APP_DATA_DIR/sessions/` 下

## Documentation Map

每个目录下都有自己的 README：

- [apps/README.md](apps/README.md) — 三个壳的职责边界
- [apps/mac-desktop/README.md](apps/mac-desktop/README.md) — Mac 原生壳
- [apps/mac-web/README.md](apps/mac-web/README.md) — 桌面网页壳
- [apps/iphone-web/README.md](apps/iphone-web/README.md) — 手机网页壳
- [core/agent/README.md](core/agent/README.md) — Agent API 和 provider
- [scripts/README.md](scripts/README.md) — 脚本说明
- [shared/schemas/README.md](shared/schemas/README.md) — 输出 schema

## References

- [LM Studio](https://lmstudio.ai/) — [Docs](https://lmstudio.ai/docs) / [CLI](https://lmstudio.ai/docs/lms) / [Qwen3-VL](https://lmstudio.ai/models/qwen/qwen3-vl-8b)
- [Ollama](https://ollama.com/) — [macOS Install](https://docs.ollama.com/macos) / [Qwen3-VL](https://ollama.com/library/qwen3-vl)

## License

[AGPL-3.0](LICENSE) — 可以自由使用和修改，但衍生作品（包括网络服务）必须以相同协议开源。
