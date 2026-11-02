# 开发者指南

当前源码与桌面版本：v0.1.22。架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，贡献规则见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 技术栈

- Electron：Windows 桌面外壳、隔离 preload、托盘和启动等待窗口。
- React + TypeScript + Vite：本地工作室界面；Lucide 图标与离线语言包。
- Node.js HTTP 服务 + `node:sqlite`：loopback API、项目、队列与操作持久化。
- Ollama / ComfyUI：本地规划与生成后端，不调用付费云 API。
- FFmpeg / 7-Zip：视频处理、尾帧、拼接与项目备份。

## 环境与运行

Node.js 最低 **22.13**，推荐 Node 24 LTS。Node 22.13 以下缺少本项目使用的 SQLite 能力。Windows PowerShell 可使用 `.cmd` 形式的 npm 命令。

```powershell
npm.cmd ci
npm.cmd run prepare:tools
npm.cmd run build
npm.cmd start
```

默认打开 `http://127.0.0.1:8797`。启动开发服务不会自动开始多 GB 模型下载。

```powershell
$env:NANA_DATA_DIR = 'D:\NanaStudioData'
$env:NANA_PORT = '8797'
npm.cmd start

# 前端与本地服务开发
npm.cmd run dev

# Electron 开发
npm.cmd run build
npm.cmd run desktop
```

Linux/macOS 可使用相同 npm 脚本运行核心服务；Windows 发行构建和托管 NVIDIA 环境是另一兼容范围。

## 目录与职责

| 目录/文件 | 职责 |
| --- | --- |
| src/App.tsx | 导航、项目草稿、准备状态与操作协调 |
| src/Workbench.tsx | 分镜、参数、参考图、声音、尾帧、审片 |
| src/AssetGenerator.tsx | 四视图生成、审核与入库 |
| src/AboutPage.tsx | 软件信息、离线捐赠二维码 |
| src/locales/catalogs.json | 英/日/韩/西界面翻译；繁体使用本地转换 |
| server/store.mjs | SQLite、乐观锁、项目和示例复用 |
| server/planner.mjs / ollama.mjs | 本地结构化规划与有限修复 |
| server/workflow.mjs / queue.mjs / comfy.mjs | 图构建、快照、预检、提交与恢复 |
| server/asset-studio.mjs / flux-views.mjs | SDXL/FLUX 素材路线 |
| server/prompt-template.mjs | 提示词归一化、有效视觉描述判定 |
| server/video-settings.mjs | 比例、MP、采样器、步数、帧率校验 |
| server/downloads.mjs / environment.mjs | 资源下载、哈希校验、托管环境 |
| server/media.mjs | FFmpeg、最后一帧、导出、备份 |
| server/app.mjs / security.mjs | HTTP 路由、会话、文件与来源边界 |
| desktop/ | Electron 主进程、preload、图标、等待界面 |
| resources/catalog.json | 固定资源来源、大小、版本、哈希和许可 |
| scripts/ | 构建、校验、精简打包、桌面检查 |
| tests/ | 服务端与 Playwright 回归 |
| docs/ | 手册、安装、排错、Agent、验证和历史版本说明 |

## 验证命令

```powershell
npm.cmd test
npm.cmd run build
node scripts/check-ui-locales.mjs
npx.cmd playwright install chromium
npm.cmd run test:ui
npm.cmd run test:desktop
npm.cmd run resources:check
```

浏览器测试使用临时服务与测试数据，不应连接用户的重推理任务。Node 测试中的 ComfyUI/Ollama fixture 验证协议，不能替代 GPU 出片质量测试。

`test:desktop` 验证动画等待窗口、精简桌面示例、二维码图片、隔离 preload、实际 FFmpeg 导出与最后一帧、7-Zip 备份和离线繁体。脚本可以传入 **解包后的 Electron EXE**：

```powershell
node scripts/desktop-smoke.mjs 'release/win-unpacked/Nana Director PRO.exe'
```

不要把 NSIS 便携启动器直接当作 Electron 自动化可执行文件；它不会按 Electron 的方式转发调试输出。便携包应另做真实启动与 UI 检查。

## 修改规则

- 项目更新携带 `version`，409 后重新读取并合并，不无条件覆盖。
- 队列任务保留提交快照；修改当前草稿不重写已提交任务。
- 生成提示词重复归一化应保持幂等，不丢失声音/音乐描述。
- 外部 ComfyUI 不执行全局中断；未知提交状态不擅自重发。
- 不让下载器接受任意不可信地址，不绕过哈希、目录和压缩包边界。
- UI 文案增加后维护语言表并运行覆盖检查。
- 已完成的下载、素材入库、预览返回等行为需通过真实 UI 检查。
- 作者信息只在关于页的软件信息中显示；保留上游版权和第三方许可。

## 构建发行版

```powershell
# 按当前 package.json 版本生成真实 24 位 BMP，Windows 执行
./scripts/prepare-splash.ps1
npm.cmd run dist:win
```

在允许执行项目脚本的 PowerShell 会话运行上述命令。

使用已授权并可执行的项目脚本即可，不需要改变系统安全设置。Electron Builder 的 afterPack 会精简运行时并补齐前端许可，模型不打进 EXE。

完整发布、校验和清单见 [发布指南](RELEASE_GUIDE.zh-CN.md)。

## 扩展与限制

新增模型登记不等于新增推理架构。新工作流需要节点 schema 预检、输入校验、参考输入测试、音频语义、输出归档与真实短片验证。新 Agent 能力必须维护权限、幂等、项目版本和 OpenAPI。

不要提交 `data/`、`runtime`、模型、数据库、日志、访问令牌或个人素材。关于页的两张捐赠二维码由作者提供用于公开发布，其他用户素材不属于可分发源码。

