# Scripts

这个目录放开发和打包脚本。

## dev

- `dev/start-local-agent.command`: macOS 启动本地 agent
- `dev/stop-local-agent.command`: macOS 停止本地 agent
- `dev/start-local-agent.ps1`: Windows 启动本地 agent
- `dev/stop-local-agent.ps1`: Windows 停止本地 agent

适合：

- 不打开 Mac 原生壳，直接单测 agent
- 配合 `/desktop` 桌面网页壳调试

## build

- `build/rebuild-native-app.sh`: 打包 Mac 原生 `.app`

在仓库根目录常用命令：

```bash
./scripts/dev/start-local-agent.command
./scripts/dev/stop-local-agent.command
pwsh -File ./scripts/dev/start-local-agent.ps1
pwsh -File ./scripts/dev/stop-local-agent.ps1
npm run build:mac-app
```
