# Desktop Web Shell

这个目录是浏览器里的桌面控制台，对齐 Mac 原生壳的功能面。

静态入口：

- [public/index.html](/Users/oyzh/interview/apps/mac-web/public/index.html)

运行路由：

- 本地 agent 启动后打印出的 `http://127.0.0.1:<port>/mac`
- 开发时通常从 `8788` 开始分配

## Scope

桌面网页壳负责：

- 本机直连或配对
- `Codex / LM Studio / Ollama` 模型配置
- Codex 认证状态和启动
- `LM Studio / Ollama` 运行时状态检测
- 当前配置模型的下载 / 加载 / 卸载
- `Ollama` 当前模型删除
- 抓屏测试
- 模型测试
- 历史和详情查看

它不负责：

- 冷启动 agent
- iPhone 接收页

## Fast Local Model Setup On Mac

### LM Studio

Mac 上推荐先走 `LM Studio (MLX)`：

```bash
~/.lmstudio/bin/lms bootstrap
lms get --mlx qwen3-vl-8b
lms ls
lms server start
lms load <model_key> --identifier qwen3-vl:8b
```

然后：

1. 打开 `/mac`
2. 进入“配置”
3. 模型提供方切到 `LM Studio (MLX)`
4. 模型保持 `qwen3-vl:8b`
5. 可以直接在“运行时管理”里点：
   - `启动 Server`
   - `下载当前模型`
   - `加载当前模型`
6. 保存后去“测试”页运行模型测试

### Ollama

`Ollama` 也支持：

```bash
ollama pull qwen3-vl:8b
ollama serve
```

然后在 `/mac` 配置页切到 `Local Ollama`。

如果你只是先验证网页和 agent 的基本链路，`qwen3-vl:4b` 会更快。

## Runtime Directory Policy

- `Screen Pilot` 不接管 `LM Studio.app` 或 `Ollama.app` 的安装
- `Screen Pilot` 不做任意自定义模型路径
- `LM Studio` 的模型文件继续由它自己的模型目录管理
- `Ollama` 的模型文件继续由 `~/.ollama/models` 或 `OLLAMA_MODELS` 管理
- `LM Studio` 当前不做文件级硬删除
- `Ollama` 删除走 `ollama rm <model>`
