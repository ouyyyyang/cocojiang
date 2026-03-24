# Screen Pilot

`Screen Pilot` 按“一个核心、两个壳”组织：

- `core/agent`: Node 18 + TypeScript 本地 agent 核心
- `apps/mac-desktop`: Mac 原生桌面壳，负责本地权限、配置、测试和日志
- `apps/mac-web`: Mac / Windows 桌面网页壳，对齐原生 App 壳的功能面
- `apps/iphone-web`: iPhone 网页壳，只负责配对、发起分析、状态、详情和历史
- `shared/schemas`: 核心与壳共享的输出 schema
- `scripts`: 启动和打包脚本

## Repository Layout

```text
.
├── README.md
├── apps
│   ├── README.md
│   ├── mac-desktop
│   │   ├── README.md
│   │   ├── AppBundle
│   │   ├── Package.swift
│   │   └── Sources
│   ├── mac-web
│   │   ├── README.md
│   │   └── public
│   └── iphone-web
│       ├── README.md
│       └── public
├── core
│   ├── README.md
│   └── agent
│       ├── README.md
│       ├── src
│       └── test
├── scripts
│   ├── README.md
│   ├── build
│   └── dev
└── shared
    ├── README.md
    └── schemas
        ├── README.md
        └── codex-output.schema.json
```

运行产物和构建产物不再和源码混放：

- `runtime/agent`: 本地 agent 日志、PID、配对 token、会话数据
- `runtime/mac-desktop`: Mac 壳日志和手工测试缓存
- `build/node`: TypeScript 编译输出
- `build/mac-desktop`: `.app` 和 SwiftPM 构建缓存

## Requirements

- macOS
- Node.js `18.18+`
- 已安装并能运行 `codex`
- 已授予终端或启动进程 `Screen Recording` 权限

## Install

```bash
npm install
```

## Core Commands

```bash
npm run dev
npm run build
npm run start
npm test
```

## Documentation Map

- [apps/README.md](/Users/oyzh/interview/apps/README.md): 三个壳的职责分工
- [apps/mac-desktop/README.md](/Users/oyzh/interview/apps/mac-desktop/README.md): Mac 原生壳开发与模型配置
- [apps/mac-web/README.md](/Users/oyzh/interview/apps/mac-web/README.md): 桌面网页控制台与 `/mac`
- [apps/iphone-web/README.md](/Users/oyzh/interview/apps/iphone-web/README.md): iPhone 网页壳范围
- [core/agent/README.md](/Users/oyzh/interview/core/agent/README.md): agent API、provider 与运行方式
- [scripts/README.md](/Users/oyzh/interview/scripts/README.md): 开发 / 打包脚本说明
- [shared/schemas/README.md](/Users/oyzh/interview/shared/schemas/README.md): 输出 schema 约定

## Mac Quick Start

如果你现在是在这台 Mac 上直接验证功能，最快路径是：

1. `npm install`
2. 启动本地 agent：

```bash
./scripts/dev/start-local-agent.command
```

3. 脚本会在 `8788-8792` 中自动找空闲端口。启动成功后，打开输出里的 `/mac` 地址，通常是：

```text
http://127.0.0.1:8788/mac
```

4. 或者打包并打开原生壳：

```bash
npm run build:mac-app
```

生成物路径：

- `build/mac-desktop/Screen Pilot Native.app`

## Local Backends On Mac

当前项目支持三种模型 provider：

- `Codex`: 云端 Codex CLI
- `LM Studio (MLX)`: Mac 上更优先的本地模型路径
- `Ollama`: 跨平台、本地服务式的 fallback

这三者的定位不同：

- `LM Studio` 不是单纯一个“框架”，它本质上是一个本地模型桌面应用 / 平台，带 GUI、local server 和 `lms` CLI
- `Ollama` 更像是一个面向本地模型服务化的 runtime / CLI
- `Codex` 是云端模型链路

如果你的主机器是 `Apple Silicon Mac`，本项目当前建议是：

- `Mac 本地优先`: `LM Studio (MLX)`
- `跨平台兼容`: `Ollama`
- `云端推理`: `Codex`

## Integrated Runtime Management

现在 `/mac` 桌面网页壳和 `Screen Pilot Native.app` 都已经集成了一组本地运行时管理按钮：

- 检测 `LM Studio / Ollama` 是否已安装
- 打开各自的官方下载页
- 启动本地 server
- 下载当前配置模型
- 加载当前配置模型
- 卸载当前配置模型
- 仅对 `Ollama` 提供“删除当前模型”

边界保持得比较严格：

- `Screen Pilot` 不负责下载和安装 `LM Studio.app` 或 `Ollama.app`
- `Screen Pilot` 不接管任意自定义模型目录
- 模型文件继续由 `LM Studio / Ollama` 自己的 runtime 目录管理
- `LM Studio` 当前只做下载 / 加载 / 卸载，不做文件级硬删除

路径约定：

- `LM Studio`: 默认通常在 `~/.lmstudio/models`，如果你在 `My Models` 改过目录，以 LM Studio 当前配置为准
- `Ollama`: 默认 `~/.ollama/models`；如果设置了 `OLLAMA_MODELS`，则跟随该环境变量

删除约定：

- `LM Studio`: 当前建议在 LM Studio 自己的模型管理界面处理
- `Ollama`: 由 `Screen Pilot` 调 `ollama rm <model>` 做干净删除

## Model Configuration On Mac

### Codex

配置方式：

1. 打开 `Screen Pilot Native.app`，或打开本地 agent 启动后打印出来的 `/mac` 地址
2. 进入“配置”
3. 模型提供方选择 `Codex`
4. 选择要用的 `Codex` 模型
5. 在界面里点“开始 OpenAI 认证”

如果你更喜欢命令行，也可以直接执行：

```bash
codex -c 'model_reasoning_effort="high"' login
```

### LM Studio (Recommended On Mac)

这是当前在 Mac 上更推荐的本地模型配置路径。

#### LM Studio 到底是什么

- 它需要下载安装
- 它是一个本地模型应用 / 平台，不是只给你一个推理库
- 它自带 GUI、本地 server、模型下载能力和 `lms` CLI

#### 最快安装路径

1. 安装并启动 `LM Studio`
2. 至少打开一次 App
3. 在终端执行：

```bash
~/.lmstudio/bin/lms bootstrap
```

4. 开一个新终端，确认 CLI 已可用：

```bash
lms --help
```

#### 下载模型文件

你可以用 GUI，也可以用 CLI。

GUI 路径：

1. 打开 `LM Studio`
2. 进入模型搜索 / 下载界面
3. 搜索 `Qwen3-VL-8B`
4. 在 Mac 上优先选 `MLX` 版本

CLI 路径：

```bash
lms get --mlx qwen3-vl-8b
```

下载完成后查看本地模型：

```bash
lms ls
```

#### 启动本地 server 并加载模型

`Screen Pilot` 默认把本地模型标识统一成 `qwen3-vl:8b`。为了让网页壳、原生壳和后端配置保持一致，建议你把 LM Studio 里加载的标识也统一成这个名字。

1. 启动本地 server：

```bash
lms server start
```

2. 找到刚下载的 `model_key`：

```bash
lms ls
```

3. 加载模型，并指定统一标识：

```bash
lms load <model_key> --identifier qwen3-vl:8b
```

4. 确认模型已在内存中：

```bash
lms ps
```

5. 回到 `Screen Pilot`
6. 进入“配置”
7. 模型提供方选择 `LM Studio (MLX)`
8. 模型名保持 `qwen3-vl:8b`
9. 你可以直接用“运行时管理”里的按钮：
   - `启动 Server`
   - `下载当前模型`
   - `加载当前模型`
10. 保存后去“测试”执行一次模型测试

### Ollama

`Ollama` 仍然保留，适合：

- 你想保留跨平台一致性
- 你更偏好 headless 本地服务
- 后续还要兼顾 Windows / Linux

#### 下载模型文件

```bash
ollama pull qwen3-vl:8b
```

如果你只想先快速验证吞吐和界面，也可以先拉一个更轻的模型：

```bash
ollama pull qwen3-vl:4b
```

#### 启动本地服务

如果 `Screen Pilot` 提示连不上 `127.0.0.1:11434`，手动启动：

```bash
ollama serve
```

#### 在项目里使用

1. 打开 `Screen Pilot Native.app` 或本地 agent 启动后打印出来的 `/mac` 地址
2. 进入“配置”
3. 模型提供方选择 `Local Ollama`
4. 模型选择 `qwen3-vl:8b`
5. 如果还没准备好模型，可直接在“运行时管理”里：
   - `启动 Server`
   - `下载当前模型`
   - `卸载当前模型`
   - `删除当前模型`
6. 保存后去“测试”执行一次模型测试

验证本地模型是否就绪：

```bash
ollama list
curl http://127.0.0.1:11434/api/tags
```

## Local Model Recommendation For This Mac

对你这台 `24GB` 统一内存的 Mac，当前建议是：

- `主本地链路`: `LM Studio (MLX) + qwen3-vl:8b`
- `快速通路验证`: `qwen3-vl:4b`
- `跨平台 fallback`: `Ollama + qwen3-vl:8b`

## Local Agent Scripts

```bash
./scripts/dev/start-local-agent.command
./scripts/dev/stop-local-agent.command
```

这些脚本适合单独调试核心 agent，不依赖 Mac 壳。

## Mac Desktop Shell

Mac 原生壳在 [apps/mac-desktop/Package.swift](/Users/oyzh/interview/apps/mac-desktop/Package.swift)。

它负责：

- 自动拉起本地 agent
- `Codex / LM Studio / Ollama` 模型配置
- 当前分析 prompt 的查看、编辑与恢复默认
- Codex 认证
- 抓屏测试和模型测试
- 历史和日志查看

如果直接开发 SwiftUI 壳本身，可在 Xcode 打开 [apps/mac-desktop/Package.swift](/Users/oyzh/interview/apps/mac-desktop/Package.swift)。

## Desktop Web Shell

为了兼顾后续 Windows 使用，仓库现在有一个独立的桌面网页控制台：

- 路由：`/mac`
- 入口文件：[apps/mac-web/public/index.html](/Users/oyzh/interview/apps/mac-web/public/index.html)

这个桌面网页壳面向浏览器提供：

- 本机直连或配对
- `Codex / LM Studio / Ollama` 模型配置
- 当前分析 prompt 的查看、编辑与恢复默认
- Codex 认证状态和启动
- `LM Studio / Ollama` 运行时状态检测和当前模型管理
- 抓屏测试
- 模型测试
- 分析历史和详情

## iPhone Web Shell

iPhone 网页壳静态资源在 [apps/iphone-web/public/index.html](/Users/oyzh/interview/apps/iphone-web/public/index.html)。

网页端现在只保留：

- 配对
- 发起分析
- 状态
- 详情
- 历史

Mac 专用的配置、认证和测试已经收敛到原生壳和 `/mac` 桌面网页壳。

## Environment Variables

- `PORT`: 服务端口，默认 `8787`
- `HOST`: 监听地址，默认 `0.0.0.0`
- `PAIRING_TOKEN`: 固定配对令牌；未提供时自动生成并持久化
- `APP_DATA_DIR`: 本地数据目录；默认 `~/.mac-screen-agent-mvp`
- `CODEX_TIMEOUT_MS`: 模型分析超时时间，默认 `120000`
- `MODEL_PROVIDER`: 默认模型提供方，支持 `codex`、`lmstudio`、`ollama`
- `CODEX_BIN`: `codex` 可执行文件路径
- `LOCAL_VISION_MODEL`: 本地模型标识，默认 `qwen3-vl:8b`
- `LMSTUDIO_HOST`: LM Studio 本地 server 地址，默认 `http://127.0.0.1:1234`
- `OLLAMA_HOST`: Ollama 地址，默认 `http://127.0.0.1:11434`
- `SCREENCAPTURE_BIN`: `screencapture` 可执行文件路径

## Notes

- 本机 `~/.codex/config.toml` 中如果有无效的 `model_reasoning_effort`，CLI 调用时会显式覆盖为 `high`
- `Screen Pilot` 当前会把本地模型标识统一存成一个字段，因此 `LM Studio` 和 `Ollama` 都建议使用相同的本地模型标识，例如 `qwen3-vl:8b`
- 当前只支持 `main_display`，接口里保留了未来扩展到 `frontmost_window` 的位置
- 历史会话与截图落盘在本地数据目录的 `sessions/` 下

## References

- LM Studio homepage: `https://lmstudio.ai/`
- LM Studio docs: `https://lmstudio.ai/docs`
- LM Studio CLI `lms`: `https://lmstudio.ai/docs/lms`
- LM Studio `lms get`: `https://lmstudio.ai/docs/cli/get`
- LM Studio `lms load`: `https://lmstudio.ai/docs/cli/local-models/load`
- LM Studio `lms server start`: `https://lmstudio.ai/docs/cli/server-start`
- Qwen3-VL in LM Studio: `https://lmstudio.ai/models/qwen/qwen3-vl-8b`
- Ollama macOS install: `https://docs.ollama.com/macos`
- Qwen3-VL in Ollama: `https://ollama.com/library/qwen3-vl`
