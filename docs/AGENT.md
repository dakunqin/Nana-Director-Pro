# Agent API v1

适用 v0.1.22。此接口是可选的本地自动化扩展；普通界面创作不需要 Agent、云端服务或付费 API。

## 启用与认证

设置 → Agent 扩展接口 → 启用 → 生成/重置独立令牌 → 选择权限 → 保存设置。

所有 Agent 请求（含 GET）都必须携带 `Authorization: Bearer <独立令牌>`。`read` 允许查询，`write` 允许修改和执行。默认关闭。独立 Agent 令牌与浏览器会话令牌不是同一个凭据。

基础地址：`http://127.0.0.1:<当前端口>/api/v1/agent`。桌面端口为动态值，开发模式默认 8797；从当前实例地址确认，不要硬编码某次会话端口。保持本地访问，不公开令牌和服务到公网。

## 路由

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /capabilities | 协议版本、阶段、权限与能力 |
| GET | /projects | 项目列表 |
| POST | /projects | 创建；必须提供 Idempotency-Key |
| GET | /projects/{id} | 项目、分镜与当前 version |
| PATCH | /projects/{id} | 更新；必须提供当前 version |
| POST | /projects/{id}/plan | 本地模型规划；当前 version |
| POST | /projects/{id}/jobs | 提交镜头；当前 version、shotIds、mode；Idempotency-Key |
| GET | /jobs | 状态、快照、promptId 与归档结果 |
| POST | /jobs/{id}/cancel | 取消待执行/标记取消；不全局中断共享 ComfyUI |

这不是全部界面内部 API 的无条件开放。Agent 路由不提供未列出的任意文件操作、模型安装或独立 export 接口。完整机器定义见 [OpenAPI](openapi.json)；能力以当前 `/capabilities` 响应为准。

## PowerShell 示例

先由你在本地设置实际端口和令牌。以下代码不包含真实凭据。

```powershell
$base = 'http://127.0.0.1:8797/api/v1/agent'
$headers = @{ Authorization = "Bearer $env:NANA_AGENT_TOKEN" }
Invoke-RestMethod "$base/capabilities" -Headers $headers

# 创建项目；同一逻辑请求保留相同键，避免重试创建多个项目
$createHeaders = $headers.Clone()
$createHeaders['Idempotency-Key'] = [guid]::NewGuid().ToString()
$body = @{ name = '自动化书店短片'; script = '清晨，橘猫走过书店。' } | ConvertTo-Json
$p = Invoke-RestMethod "$base/projects" -Method Post -Headers $createHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))

# 自动规划是异步操作；先轮询读取项目，确认 plan 已存在并审阅
$planBody = @{ version = $p.version } | ConvertTo-Json
Invoke-RestMethod "$base/projects/$($p.id)/plan" -Method Post -Headers $headers -ContentType 'application/json' -Body $planBody
```

规划完成后读取最新项目再提交，不能复用规划前 version：

```powershell
$p = Invoke-RestMethod "$base/projects/$($p.id)" -Headers $headers
# 审查 plan、图片引用和资源准备后再运行以下提交
$jobHeaders = $headers.Clone()
$jobHeaders['Idempotency-Key'] = [guid]::NewGuid().ToString()
$jobBody = @{ version = $p.version; shotIds = @($p.plan.shots[0].id); mode = 'text'; continuity = $false } | ConvertTo-Json
Invoke-RestMethod "$base/projects/$($p.id)/jobs" -Method Post -Headers $jobHeaders -ContentType 'application/json' -Body $jobBody
Invoke-RestMethod "$base/jobs" -Headers $headers
```

文本模式不使用图片；引用模式必须有完整图片绑定。不得在尚未检查 plan 时直接执行示例提交。

## 数据结构与参数

Plan 包含 `summary`、`assets[]`、`scenes[]`、`shots[]`。

- Asset：id/name/kind/description；kind 为 `character`、`location`、`prop`。动物按角色资产处理。
- Scene：id/title/description。
- Shot：id/sceneId/title/prompt/duration/assetIds/camera/locked；可有 soundMode、soundPrompt。
- duration 为 2–15 秒整数；场景和资产 ID 必须存在，ID 不能重复。
- soundMode 为 `native` 或 `silent`，缺省 native；声音描述是模型引导，不是精确 TTS。
- 项目设定可更新 aspectRatio、megapixels、sampler、steps、fps 等，仍按服务端校验。
- jobs 模式：auto/reference/first-frame/text；continuity 启用尾帧，tailSource 可为 auto 或当前项目已完成来源任务 ID。
- 具体可用值见使用手册与 video-settings.mjs，新增未知值不能假定支持。

## 并发、幂等与恢复

PATCH/规划/提交需要当前 version。409 表示已有更新，重新读取并处理冲突，不得无条件覆盖。任务保存提交时快照，之后修改项目不重写历史任务。

创建项目和提交任务使用 Idempotency-Key。同一逻辑请求的网络重试必须保留原键；每次随机换键可能重复消耗算力。不同逻辑操作使用不同键。

202 表示已经接受异步操作，不是生成完成。轮询项目或 jobs 查看状态。已知 promptId 先查询任务/后端历史；提交结果未知时不要盲目重发。取消不会全局中断共享 ComfyUI，已提交的计算可能继续归档。

错误一般为 `{ "error": "原因" }`。常见状态：400 输入错误，401 令牌无效，403 未启用/权限不足，404 不存在，409 版本冲突；具体状态随错误类型区分。

## 安全与扩展

令牌只放在本机环境变量或受控配置，不写进 Git、截图、日志、剧本或工作流。重置后旧令牌失效。新增 API 时保持 loopback、Origin/Host、读写范围、输入和文件边界校验，并同步 OpenAPI 与测试。
