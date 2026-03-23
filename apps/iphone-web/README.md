# iPhone Web Shell

这个目录只放 iPhone 网页壳。

静态入口：

- [public/index.html](/Users/oyzh/interview/apps/iphone-web/public/index.html)

运行路由：

- 本地 agent 启动后打印出的 `http://127.0.0.1:<port>/`
- 开发时通常从 `8788` 开始分配

## Scope

它只负责：

- 配对
- 发起分析
- 状态
- 详情
- 历史

它不负责：

- Mac 模型配置
- Codex 认证
- 抓屏测试
- 模型测试

这些能力都留在：

- `apps/mac-desktop`
- `apps/mac-web`
