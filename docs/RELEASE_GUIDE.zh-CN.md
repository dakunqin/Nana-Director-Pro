# 发布与维护指南

本项目将源码仓库、Windows 应用和按需下载的模型分开发布。版本采用 `v<package.json.version>` 标签。

## 发布前核对

1. 核对版本文件：package.json、package-lock.json 根与根包、src/app-version.ts、index.html、desktop/loading.html、scripts/source-archive.mjs，以及标题回归测试。
2. 更新 RELEASE 说明、README 当前版本、使用手册与验证范围。
3. 执行 prepare-splash.ps1，确认 splash.bmp 为真实 24 位 BMP（BMP 文件头为 BM，不能只是改 PNG 后缀）。
4. 执行服务端测试、TypeScript/构建、语言覆盖、浏览器回归、解包桌面检查。
5. 涉及模型路线时，另记录真实硬件、驱动、模型/节点版本、参数和生成结果；不要用 fixture 代替。
6. 核对 THIRD_PARTY_NOTICES 与 vendor 许可材料。
7. 审查待发布文件，不包含数据盘、模型、凭据、私人剧本、未授权素材或构建缓存。

## 构建与精简

```powershell
npm.cmd ci
npm.cmd run prepare:tools
./scripts/prepare-splash.ps1
npm.cmd test
npm.cmd run build
node scripts/check-ui-locales.mjs
npm.cmd run test:ui
npm.cmd run dist:win
node scripts/desktop-smoke.mjs 'release/win-unpacked/Nana Director PRO.exe'
```

打包使用 electron-builder.yml、maximum 压缩和 afterPack 精简。保留所有 Chromium/GPU 运行必要组件，生产 node_modules 仅保留运行时确实使用的 FFmpeg/7-Zip；React/Lucide 等已在前端包内，许可全文另行保留。

不要手动精简共享开发依赖。compact-runtime.mjs 只接受 workspace/release 下已验证的应用子目录，并验证 package 名称和删除路径。

低内存构建可用 Node 的 max-old-space-size 限制；压缩耗时较长是打包过程，不代表最终用户推理速度。不得在压缩器读取 win-unpacked 时修改其中内容。

## 源码包与文档包

scripts/source-archive.mjs 只打包 Git 索引列出的工作文件。先审查并暂存需要发布的源文件，避免未跟踪的临时文件漏入或机密误入。

```powershell
git status --short
node scripts/source-archive.mjs
node scripts/build-docs.mjs
```

build-docs.mjs 会验证文档本地链接、生成离线 HTML 手册和文档 ZIP。文档 ZIP 不包含用户数据或模型。

## 发布附件

| 附件 | 用途 |
| --- | --- |
| Nana-Director-Pro-VERSION-x64-setup.exe | Windows 安装版 |
| Nana-Director-Pro-VERSION-x64-portable.exe | Windows 便携版 |
| Nana-Director-Pro-VERSION-source.zip | 明确版本源码快照 |
| Nana-Director-Pro-VERSION-docs.zip | 中文手册、离线 HTML、安装/排错/开发/API 文档和示例 |
| SHA256SUMS-VERSION.txt | 上述手工发布附件的 SHA256 |

GitHub 自动生成的 Source code ZIP/TAR 来自标签，不包含模型。二进制附件不进入 Git 历史；放在 Releases。

## GitHub 发布

1. 推送经过检查的源码到主分支。
2. 将对应提交打标签 vVERSION。
3. 创建 Release，填写功能、修复、安装入口和验证边界。
4. 上传附件并等待每项上传结束，核对大小与名称。
5. 发布后检查 Releases 页面、源文件、文档链接和附件是否可访问。
6. 需要修改文档时，同步仓库与文档/源码快照；不要让校验清单指向旧文件。

已有版本不可随意覆盖用户依赖的模型清单。更新固定资源时维护来源、revision、大小、SHA256、许可和实测记录。

## 对应源码与第三方材料

本项目自有代码 MIT。ComfyUI、社区节点、模型与 FFmpeg 各自适用其许可。对 GPL/LGPL 等组件的再分发，按组件构建与许可要求准备对应源码、构建说明或书面来源，不把本项目源码 ZIP 当作所有第三方组件源码的替代品。详见 THIRD_PARTY_NOTICES.md。
