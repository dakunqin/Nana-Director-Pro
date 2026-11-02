# 架构与边界

```text
Electron / 本机浏览器
    └─ React 中文工作室
         └─ loopback HTTP 服务（随机会话令牌 / Origin 校验）
              ├─ SQLite：项目、下载、作业、设置、操作记录
              ├─ Ollama：结构化剧本与分镜，仅本地模型
              ├─ ComfyUI：预检、上传、提交、历史恢复、归档
              ├─ FFmpeg：关系帧、规范化、拼接
              └─ 下载/环境管理：独立 Python 和固定资源清单
```

服务模块位于 `server/`。`store` 管数据与乐观锁；`security` 管来源和文件边界；`planner/ollama` 管本地规划；`workflow/comfy/queue` 管视频作业；`downloads/environment` 管环境；`media` 管导出。`app` 组合服务并定义 API。

用户手动保存与 Agent 修改都使用项目版本号。镜头进入队列时保存参数和资产快照。提交前记录 `submitting`，服务中途退出时标记未知，避免自动重发可能已被接受的 GPU 作业。已知 prompt_id 先查 ComfyUI 历史。

托管环境使用独立 Python，不向系统 Python 安装包。应用仅停止自身子进程。已有 ComfyUI 上不执行全局中断；已提交镜头的取消请求会保留并继续归档，避免丢掉已消耗算力的结果。

安全默认：仅 loopback、写请求令牌、Origin/Host 检查、无默认 CORS、路径根目录约束、可信 HTTPS 下载清单、固定哈希、压缩包路径检查、子进程不使用 shell。Agent 默认关闭，令牌独立。

开发版无自动更新与自动迁移旧导演台数据；升级保持数据盘不变。依赖清单固定下载产物，但社区节点 requirements 中的间接 Python 依赖仍由 pip 解析；每次安装记录 pip freeze，不能声称跨日期完全相同。正式稳定版应在兼容验证后进一步固定完整 Python 锁定环境。
