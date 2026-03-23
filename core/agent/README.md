# Agent Core

这个目录是 Screen Pilot 的本地 agent 核心。

包含：

- HTTP API
- WebSocket 状态推送
- 抓屏
- `Codex / LM Studio / Ollama` 模型调度
- 会话落盘
- 配置持久化

## Run

在仓库根目录执行：

```bash
npm run dev
```

或：

```bash
npm run start
```

## Tests

在仓库根目录执行：

```bash
npm test
```

## Model Providers

当前支持两种 provider：

- `codex`
- `lmstudio`
- `ollama`

对应配置项：

- `MODEL_PROVIDER`
- `CODEX_BIN`
- `LOCAL_VISION_MODEL`
- `LMSTUDIO_HOST`
- `OLLAMA_HOST`

默认本地模型：

- `qwen3-vl:8b`

本地模型默认建议：

- `Mac`: `LM Studio (MLX)`
- `跨平台`: `Ollama`

## API Notes

关键接口：

- `GET /api/config`
- `POST /api/settings`
- `POST /api/analyze`
- `POST /api/test/capture`
- `POST /api/test/model`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `WS /ws`

本机 `127.0.0.1` / `::1` 的桌面网页控制台允许直连，不强制走配对令牌。
