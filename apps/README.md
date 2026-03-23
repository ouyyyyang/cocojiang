# Apps

`apps/` 目录只放交互壳，不放真正的分析核心。

包含三个壳：

- [mac-desktop/README.md](/Users/oyzh/interview/apps/mac-desktop/README.md): Mac 原生桌面壳
- [mac-web/README.md](/Users/oyzh/interview/apps/mac-web/README.md): Mac / Windows 桌面网页壳
- [iphone-web/README.md](/Users/oyzh/interview/apps/iphone-web/README.md): iPhone 网页壳

职责边界：

- `mac-desktop`: 本地权限、日志、原生入口
- `mac-web`: 浏览器里的桌面控制台，适合 Mac 和后续 Windows
- `iphone-web`: 手机接收和轻交互

模型配置入口在：

- 原生壳“配置”页
- 桌面网页壳 `/mac` 的“配置”页

不要在 `iphone-web` 里继续堆桌面配置功能。
