# Screen Pilot

> 截屏一下，让 AI 帮你看。

Screen Pilot 会自动截取你的电脑屏幕，交给 AI 视觉模型分析，然后返回结构化的结果。你可以在电脑浏览器里操作，也可以用手机远程触发和查看。

支持 **macOS** 和 **Windows**，手机端 **iPhone / Android** 都能用。

---

## 能做什么

- 一键截取屏幕，AI 自动分析内容
- 识别屏幕上的算法题、文档、代码，给出解题思路和完整代码
- 手机远程触发分析，实时查看结果
- 支持 5 种 AI 模型：云端（Claude / OpenAI / Codex）和本地（LM Studio / Ollama）
- 所有数据保存在本机，不上传任何第三方服务器

---

## 快速开始

### 第一步：下载

**方式 A（推荐）：** 点 GitHub 页面右上角绿色的 `Code` -> `Download ZIP`，解压后进入文件夹。

**方式 B：** 如果你会用 git：
```bash
git clone https://github.com/yourname/screen-pilot.git
cd screen-pilot
```

### 第二步：启动

**macOS：** 双击 `start.command`

> 首次可能提示"无法验证开发者"——右键该文件 -> 打开 -> 打开。只需做一次。

**Windows：** 双击 `start.bat`

不需要提前安装任何软件。脚本会自动完成一切：

```
检测 Node.js（没有就下到项目内部，不影响你的电脑）
  → 安装依赖 → 编译 → 启动 → 自动打开浏览器
```

启动成功后浏览器会打开控制台页面，配对 token 自动复制到剪贴板。

**停止服务：** 双击 `stop.command`（Mac）或 `stop.bat`（Windows）。

### 第三步：选模型

打开控制台后点左侧"配置"，页面上会有引导提示帮你选择：

| 你的情况 | 推荐选择 | 需要什么 |
|---------|---------|---------|
| 想最快跑起来 | **Claude API** | 注册 [Anthropic](https://console.anthropic.com/) 拿一个 API Key |
| 有 OpenAI 的 Key | **OpenAI API** | 填 Key 就行 |
| 想完全免费离线 | **Ollama**（所有平台）或 **LM Studio**（Mac） | 需要在本机下载并运行模型 |

选好 provider → 填 Key 或配置模型 → 保存 → 去"测试"页跑一次 → 看到截图和分析结果就说明搞定了。

### 第四步：连手机（可选）

1. 确保手机和电脑在同一个 WiFi
2. 电脑终端里会打印局域网地址（类似 `http://192.168.x.x:8788/`）
3. 手机浏览器打开这个地址（iPhone / Android 都行）
4. 输入配对 token（终端里有，也自动复制到了剪贴板）

手机只负责触发和查看，所有配置在电脑上完成。

### macOS 抓屏权限

首次抓屏时 macOS 会弹出权限请求，请允许。如果不小心拒绝了：

**System Settings → Privacy & Security → Screen Recording** → 找到你的终端（Terminal / iTerm），打开开关，重启终端。

---

## 常见问题

<details>
<summary>双击 start.command 没反应 / 提示无法验证</summary>

右键该文件 → 打开 → 在弹窗中点"打开"。macOS 对未签名脚本有安全限制，只需做一次。
</details>

<details>
<summary>Windows 双击 start.bat 闪退</summary>

尝试右键 → "以管理员身份运行"。如果仍然不行，打开 PowerShell 手动执行：
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\dev\start-local-agent.ps1
```
</details>

<details>
<summary>抓屏测试失败 / 截图是空白的</summary>

macOS 上这通常是 Screen Recording 权限没开。去 System Settings → Privacy & Security → Screen Recording，确认你的终端应用已勾选，然后重启终端。
</details>

<details>
<summary>手机打不开页面</summary>

确认手机和电脑在同一个 WiFi 网络，防火墙没有阻止端口访问。尝试在电脑浏览器里先打开局域网地址确认能访问。
</details>

<details>
<summary>不想让脚本帮我装 Node.js</summary>

脚本只会把 Node.js 下载到项目内部的 `runtime/node/` 目录，不修改系统 PATH、不装全局包。删掉 `runtime/node/` 就完全还原。如果你已经装了 Node.js 18+，脚本会直接用你的，不会下载任何东西。
</details>

---

## 更多配置（进阶）

<details>
<summary>命令行启动方式</summary>

```bash
# macOS
./scripts/dev/start-local-agent.command
./scripts/dev/stop-local-agent.command

# Windows
pwsh -File ./scripts/dev/start-local-agent.ps1
pwsh -File ./scripts/dev/stop-local-agent.ps1
```
</details>

<details>
<summary>npm 命令</summary>

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式 |
| `npm run build` | 编译 |
| `npm run start` | 跑编译后的产物 |
| `npm test` | 编译 + 跑全部测试 |
| `npm run build:mac-app` | 打包 Mac 原生 `.app` |
</details>

<details>
<summary>环境变量</summary>

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `8787` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `PAIRING_TOKEN` | 固定配对令牌 | 随机 UUID |
| `APP_DATA_DIR` | 本地数据目录 | `~/.mac-screen-agent-mvp` |
| `CODEX_TIMEOUT_MS` | 模型分析超时（所有 provider） | `120000` |
| `MODEL_PROVIDER` | 默认 provider | `codex` |
| `CLOUD_API_KEY` | Claude / OpenAI API Key | 无 |
| `CLOUD_MODEL` | 云端模型标识 | 无 |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 地址 | `https://api.openai.com` |
| `CODEX_BIN` | codex 可执行文件路径 | `codex` |
| `LOCAL_VISION_MODEL` | 本地模型标识 | `qwen3-vl:8b` |
| `LMSTUDIO_HOST` | LM Studio server 地址 | `http://127.0.0.1:1234` |
| `OLLAMA_HOST` | Ollama 地址 | `http://127.0.0.1:11434` |
| `SCREEN_PILOT_CAPTURE_BACKEND` | 抓屏 backend | `auto` |
| `CAPTURE_BIN` | 抓屏命令路径 | 按平台自动选择 |
</details>

<details>
<summary>模型 Provider 详细配置</summary>

### Claude API (推荐云端)

1. 去 [console.anthropic.com](https://console.anthropic.com/) 拿 API Key
2. 控制台配置页选 `Claude API`，选模型（推荐 Sonnet 4.6），填 Key，保存

### OpenAI API

1. 去 [platform.openai.com](https://platform.openai.com/) 拿 Key
2. 配置页选 `OpenAI API`，选模型，填 Key，保存
3. 第三方兼容 API 可设置 `OPENAI_BASE_URL`

### Codex

1. 配置页选 `Codex`，点"开始 OpenAI 认证"
2. 或命令行：`codex -c 'model_reasoning_effort="high"' login`

### LM Studio (Mac 本地推荐)

```bash
~/.lmstudio/bin/lms bootstrap
lms get --mlx qwen3-vl-8b
lms server start
lms load <model_key> --identifier qwen3-vl:8b
```

也可以直接用控制台里"运行时管理"的按钮完成。

### Ollama

```bash
ollama pull qwen3-vl:8b
ollama serve
```

控制台配置页切到 `Local Ollama` 即可。
</details>

---

## 项目结构（开发者）

<details>
<summary>架构概览</summary>

```
电脑（控制端）                        手机（展示端）
┌─────────────────────┐              ┌──────────────┐
│  agent 核心          │  WebSocket   │  手机网页     │
│  抓屏 → 模型 → 结果  │ ◄──────────► │  配对、查看   │
│                     │              └──────────────┘
│  桌面控制台 /desktop  │
│  配置、测试、历史     │
└─────────────────────┘
```

| 层 | 目录 | 角色 |
|----|------|------|
| 核心 | `core/agent` | Node 18 + TypeScript，抓屏、调模型、存结果、推 WebSocket |
| 桌面网页壳 | `apps/mac-web` | 浏览器控制台，macOS / Windows 通用 |
| Mac 原生壳 | `apps/mac-desktop` | SwiftUI App（macOS 专属） |
| 手机网页壳 | `apps/iphone-web` | 配对后远程触发和查看 |
| 共享定义 | `shared/schemas` | 模型输出 JSON Schema |
| 脚本 | `scripts` | 启动、停止、打包 |
</details>

<details>
<summary>目录结构</summary>

```text
.
├── start.command / start.bat   # 双击启动
├── stop.command / stop.bat     # 双击停止
├── core/agent/                 # agent 核心源码和测试
├── apps/
│   ├── mac-desktop/            # SwiftUI 原生壳
│   ├── mac-web/                # 桌面网页壳
│   └── iphone-web/             # 手机网页壳
├── scripts/                    # 启动/停止/打包脚本
├── shared/schemas/             # 输出 JSON Schema
├── runtime/                    # 运行时数据（gitignored）
└── build/                      # 编译输出（gitignored）
```
</details>

<details>
<summary>子目录文档</summary>

- [apps/README.md](apps/README.md) — 三个壳的职责边界
- [apps/mac-desktop/README.md](apps/mac-desktop/README.md) — Mac 原生壳
- [apps/mac-web/README.md](apps/mac-web/README.md) — 桌面网页壳
- [apps/iphone-web/README.md](apps/iphone-web/README.md) — 手机网页壳
- [core/agent/README.md](core/agent/README.md) — Agent API 和 provider
- [scripts/README.md](scripts/README.md) — 脚本说明
- [shared/schemas/README.md](shared/schemas/README.md) — 输出 schema
</details>

## References

- [LM Studio](https://lmstudio.ai/) — [Docs](https://lmstudio.ai/docs) / [CLI](https://lmstudio.ai/docs/lms) / [Qwen3-VL](https://lmstudio.ai/models/qwen/qwen3-vl-8b)
- [Ollama](https://ollama.com/) — [macOS Install](https://docs.ollama.com/macos) / [Qwen3-VL](https://ollama.com/library/qwen3-vl)

## License

[AGPL-3.0](LICENSE) — 可以自由使用和修改，但衍生作品（包括网络服务）必须以相同协议开源。
