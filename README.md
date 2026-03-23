# Screen Pilot

当前仓库按“一个核心、两个壳”组织：

- `core/agent`: Node 18 + TypeScript 本地 agent 核心
- `apps/mac-desktop`: Mac 原生桌面壳，负责本地权限、配置、测试和日志
- `apps/iphone-web`: iPhone 网页壳，只负责配对、发起分析、状态、详情和历史
- `shared/schemas`: 核心与壳共享的输出 schema
- `scripts`: 启动和打包脚本

这样做的目标是把真正会复用的能力留在核心里，把 Mac 和 iPhone 的交互层分开。

## Repository Layout

```text
.
├── apps
│   ├── iphone-web
│   │   └── public
│   └── mac-desktop
│       ├── AppBundle
│       ├── Package.swift
│       └── Sources
├── core
│   └── agent
│       ├── src
│       └── test
├── docs
├── scripts
│   ├── build
│   └── dev
└── shared
    └── schemas
```

运行产物和构建产物不再和源码混放：

- `runtime/agent`: 本地 agent 日志、PID、配对 token、会话数据
- `runtime/mac-desktop`: Mac 壳日志和手工测试缓存
- `build/node`: TypeScript 编译输出
- `build/mac-desktop`: `.app` 和 SwiftPM 构建缓存

## Requirements

- macOS
- Node.js 18.18+
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
- Codex 认证和模型配置
- 抓屏测试和模型测试
- 历史和日志查看

本地打包：

```bash
npm run build:mac-app
```

生成物路径：

- `build/mac-desktop/Screen Pilot Native.app`

如果直接开发 SwiftUI 壳本身，可在 Xcode 打开 `apps/mac-desktop/Package.swift`。

## iPhone Web Shell

iPhone 网页壳静态资源在 [apps/iphone-web/public/index.html](/Users/oyzh/interview/apps/iphone-web/public/index.html)。

网页端现在只保留：

- 配对
- 发起分析
- 状态
- 详情
- 历史

Mac 专用的配置、认证和测试已经收敛到原生壳。

## Environment Variables

- `PORT`: 服务端口，默认 `8787`
- `HOST`: 监听地址，默认 `0.0.0.0`
- `PAIRING_TOKEN`: 固定配对令牌；未提供时自动生成并持久化
- `APP_DATA_DIR`: 本地数据目录；默认 `~/.mac-screen-agent-mvp`
- `CODEX_TIMEOUT_MS`: Codex 分析超时时间，默认 `120000`
- `CODEX_BIN`: `codex` 可执行文件路径
- `SCREENCAPTURE_BIN`: `screencapture` 可执行文件路径

## Notes

- 本机 `~/.codex/config.toml` 中如果有无效的 `model_reasoning_effort`，CLI 调用时会显式覆盖为 `high`。
- 当前只支持 `main_display`，接口里保留了未来扩展到 `frontmost_window` 的位置。
- 历史会话与截图落盘在本地数据目录的 `sessions/` 下。
