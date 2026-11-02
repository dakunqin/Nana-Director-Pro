import {APP_VERSION} from './app-version';
import {t as uiText} from './i18n';
import LanguageSettings from './LanguageSettings';
import PreviewDialog from './PreviewDialog';
import ServiceControls from './ServiceControls';
import { useEffect, useState } from "react";
import {
  Cpu,
  HardDrive,
  Download,
  Play,
  Square,
  Save,
  ShieldCheck,
  KeyRound,
  Copy,
  FolderOpen,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { api, bytes } from "./api";
import type { Settings, Hardware, Status } from "./types";
import { SectionTitle, Busy, type Act } from "./components";
import Appearance from './Appearance';
interface Props {
  settings: Settings;
  hardware: Hardware | null;
  status: Status | null;
  act: Act;
  busy: string;
  onSave: (s: Settings) => Promise<void>;
  onLanguageChange:(language:string)=>Promise<void>;
}
export default function SettingsPage({
  settings,
  hardware,
  status,
  act,
  busy,
  onSave,
  onLanguageChange,
}: Props) {
  const [draft, setDraft] = useState(settings),
    [license, setLicense] = useState(false),
    [agentKey, setAgentKey] = useState(""),
    [logs, setLogs] = useState(""),
    [logType, setLogType] = useState("comfy");
  const [documentOpen,setDocumentOpen]=useState(false),[documentText,setDocumentText]=useState("");
  useEffect(() => setDraft(settings), [settings]);
  return (
    <>
      {documentOpen&&<PreviewDialog title={uiText("OpenAPI 文档")} closeLabel={uiText("关闭文档 · 返回")} onClose={()=>setDocumentOpen(false)}><pre tabIndex={0} className="document-preview">{documentText}</pre></PreviewDialog>}
      <SectionTitle
        eyebrow="SETUP & PREFERENCES"
        title={uiText("让创作，从容开始。")}
        description={uiText("安装、连接和诊断，在一个地方完成。")}
        action={
          <button
            className="button primary"
            disabled={!!busy}
            onClick={() =>
              void act("settings", () => onSave(draft), uiText("设置已保存"))
            }
          >
            <Save size={15} />{uiText("保存设置")}</button>
        }
      />
      <div className="setup-steps">
        <div>
          <span>01</span>
          <strong>{uiText("检测设备")}</strong>
          <small>{uiText("了解本机能力")}</small>
        </div>
        <div>
          <span>02</span>
          <strong>{uiText("安装环境")}</strong>
          <small>{uiText("独立环境，便于维护")}</small>
        </div>
        <div>
          <span>03</span>
          <strong>{uiText("下载模型")}</strong>
          <small>{uiText("按需选择本地模型")}</small>
        </div>
        <div>
          <span>04</span>
          <strong>{uiText("真实出片")}</strong>
          <small>{uiText("先完成 5 秒小样")}</small>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="section-row">
            <h2>
              <span id="setup-hardware"><Cpu size={20} /></span>{uiText("硬件与存储")}</h2>
            <span className="badge">
              {hardware?.platform} · {hardware?.arch}
            </span>
          </div>
          {hardware?.gpus.length ? (
            hardware.gpus.map((g) => (
              <div className="hardware-row" key={g.index}>
                <span>GPU {g.index}</span>
                <strong>
                  {g.name}
                  <small>
                    {(g.vramMB / 1024).toFixed(1)}{uiText("GB 显存 · 驱动")}{g.driver}
                  </small>
                </strong>
              </div>
            ))
          ) : (
            hardware ? <p>{uiText("未检测到 NVIDIA GPU。仍可使用本地导演和项目编辑。")}</p> : <Busy>{uiText("正在读取显卡与内存信息，请稍候…")}</Busy>
          )}
          <div className="hardware-row">
            <span>{uiText("系统内存")}</span>
            <strong>{hardware?.ramGB} GB</strong>
          </div>
          <div className="hardware-row">
            <span>{uiText("可用磁盘")}</span>
            <strong>{bytes(hardware?.freeBytes)}</strong>
          </div>
          <p className="footnote">
            {uiText(hardware?.videoSupport || "")}{uiText("。多张显卡的显存不直接相加。")}</p>
          <label>{uiText("数据目录")}<input readOnly value={hardware?.dataRoot || ""} />
          </label>
          <div className="button-row">
            {window.nanaDesktop && (
              <>
                <button
                  className="button small"
                  onClick={() =>
                    void act("root", async () => {
                      const root = await window.nanaDesktop!.chooseDataRoot();
                      if (root)
                        window.alert(
                          uiText("新的数据目录将于重启后使用。旧项目不会自动迁移，请先备份。"),
                        );
                    })
                  }
                >
                  <FolderOpen size={14} />{uiText("选择数据盘")}</button>
                <button
                  className="button small"
                  onClick={() => void window.nanaDesktop!.openDataRoot()}
                >{uiText("打开目录")}</button>
              </>
            )}
          </div>
          <p className="footnote">{uiText("浏览器开发模式可通过 NANA_DATA_DIR 设置数据盘。重装与更新不会主动删除项目。")}</p>
        </section>
        <section className="panel settings-card">
          <div className="section-row">
            <h2>
              <span id="setup-runtime"><Download size={20} /></span>{uiText("一键安装运行环境")}</h2>
            <span className="badge">Windows x64</span>
          </div>
          <p>{uiText("独立安装 ComfyUI、Python、Ollama 与三个基础节点包。已安装这些服务的用户可直接在下方填写地址。")}</p>
          <div className="package-list">
            <span>{uiText("ComfyUI 便携环境")}<small>{uiText("约 2.0 GB 下载")}</small>
            </span>
            <span>{uiText("Ollama 本地模型服务")}<small>{uiText("约 1.6 GB 下载")}</small>
            </span>
            <span>
              T8 · VHS · Comfyroll<small>{uiText("固定提交与完整性校验")}</small>
            </span>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={license}
              onChange={(e) => setLicense(e.target.checked)}
            />{uiText("同意从官方来源安装开源环境及节点")}</label>
          <p className="footnote">
            <a
              href="https://github.com/Comfy-Org/ComfyUI"
              target="_blank"
              rel="noreferrer"
            >
              ComfyUI / GPL-3.0
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/ollama/ollama"
              target="_blank"
              rel="noreferrer"
            >
              Ollama / MIT
            </a>{" "}{uiText("· 节点各自许可见资源清单。模型另行下载。")}</p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={
                !license || !!busy || status?.install?.status === "running"
              }
              onClick={() =>
                void act("install", () =>
                  api("/environment/install", "POST", { acceptLicenses: true }),
                )
              }
            >
              {status?.install?.status === "running" ? (
                <Busy>{uiText("安装中")}</Busy>
              ) : (
                <>
                  <Download size={15} />{uiText("安装 / 修复环境")}</>
              )}
            </button>
            <ServiceControls settings={settings} status={status} act={act} busy={busy}/>
          </div>
          {status?.install && (
            <div className="install-progress">
              <p
                className={
                  status.install.status === "failed" ? "error-text" : ""
                }
              >
                {status.install.message}
              </p>
              <progress max={100} value={status.install.progress} />
            </div>
          )}
        </section>
        <section className="panel settings-card">
          <h2>{uiText("本地导演服务")}</h2>
          <div className="form-stack">
            <label>{uiText("Ollama 地址")}<input
                aria-label={uiText("Ollama 地址")}
                value={draft.ollamaUrl}
                onChange={(e) =>
                  setDraft({ ...draft, ollamaUrl: e.target.value })
                }
              />
            </label>
            <label>{uiText("导演模型")}<select
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              >
                {["0.6b", "1.7b", "4b", "8b", "14b", "32b"].map((m) => (
                  <option key={m} value={"qwen3:" + m}>
                    Qwen3 · {m.toUpperCase()}
                  </option>
                ))}
                {Array.from(new Set([settings.model,...(status?.ollama.models||[]).map(m=>m.name)])).filter(m=>!['0.6b','1.7b','4b','8b','14b','32b'].some(v=>m==='qwen3:'+v)).map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>{uiText("导演计算设备")}<select
                value={draft.directorDevice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    directorDevice: e.target.value as "auto" | "cpu",
                  })
                }
              >
                <option value="auto">{uiText("自动 · GPU 不足时退回 CPU")}</option>
                <option value="cpu">{uiText("仅 CPU · 为视频生成保留显存")}</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.managedOllama}
                onChange={(e) =>
                  setDraft({ ...draft, managedOllama: e.target.checked })
                }
              />{uiText("由本应用管理 Ollama 启停")}</label>
            <div
              className={
                "connection-state " + (status?.ollama.online ? "online" : "")
              }
            >
              <span
                className={"dot " + (status?.ollama.online ? "lime" : "")}
              />
              {!status ? uiText("正在检测本地导演服务，请等待…") : status.ollama.online
                ? uiText("本地导演服务已连接")
                : uiText("尚未连接本地导演服务")}
            </div>
            <p className="footnote">{uiText("只允许本机 Ollama 与已审核本地模型标签；不启用云模型，不要求 API Key。模型在“模型中心”下载。")}</p>
          </div>
        </section>
        <section className="panel settings-card">
          <h2>{uiText("ComfyUI 视频引擎")}</h2>
          <div className="form-stack">
            <label>{uiText("ComfyUI 地址")}<input
                aria-label={uiText("ComfyUI 地址")}
                value={draft.comfyUrl}
                onChange={(e) =>
                  setDraft({ ...draft, comfyUrl: e.target.value })
                }
              />
            </label>
            <div className="form-row">
              <label>{uiText("生成设备")}<select
                  value={draft.gpuIndex}
                  onChange={(e) =>
                    setDraft({ ...draft, gpuIndex: Number(e.target.value) })
                  }
                >
                  {hardware?.gpus.length ? (
                    hardware.gpus.map((g) => (
                      <option value={g.index} key={g.index}>
                        {g.index} · {g.name}
                      </option>
                    ))
                  ) : (
                    <option value={0}>{uiText("默认 GPU 0")}</option>
                  )}
                </select>
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.lowVram}
                onChange={(e) =>
                  setDraft({ ...draft, lowVram: e.target.checked })
                }
              />{uiText("托管 ComfyUI 使用低显存模式")}</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.managedComfy}
                onChange={(e) =>
                  setDraft({ ...draft, managedComfy: e.target.checked })
                }
              />{uiText("由本应用管理 ComfyUI 启停")}</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.allowLan}
                onChange={(e) =>
                  setDraft({ ...draft, allowLan: e.target.checked })
                }
              />{uiText("允许接入私人局域网 ComfyUI")}</label>
            <div
              className={
                "connection-state " + (status?.comfy.online ? "online" : "")
              }
            >
              <span className={"dot " + (status?.comfy.online ? "lime" : "")} />
              {!status ? uiText("正在检测 ComfyUI，请等待…") : status.comfy.online ? uiText("ComfyUI 已连接") : uiText("ComfyUI 尚未连接")}
            </div>
            <p className="footnote">{uiText("连接已有实例不会修改其环境或停止进程。接入局域网设备后，视频生成不再完全发生于本机。")}</p>
          </div>
        </section>
        <section className="panel settings-card">
          <h2>
            <KeyRound size={19} />{uiText("Agent 扩展接口")}</h2>
          <p>{uiText("日常创作无需外部 Agent。需要自动化时，可启用独立的本地接口和访问令牌。")}</p>
          <div className="form-stack">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.agentEnabled}
                onChange={(e) =>
                  setDraft({ ...draft, agentEnabled: e.target.checked })
                }
              />{uiText("启用 Agent API")}</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.agentScopes.includes("write")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    agentScopes: e.target.checked
                      ? ["read", "write"]
                      : ["read"],
                  })
                }
              />{uiText("允许 Agent 修改项目与提交任务")}</label>
            <button
              className="button"
              onClick={() =>
                void act("key", async () => {
                  const r = await api<{ token: string }>(
                    "/settings/agent-token",
                    "POST",
                  );
                  setAgentKey(r.token);
                })
              }
            >
              <KeyRound size={14} />{uiText("生成 / 重置独立令牌")}</button>
            {agentKey && (
              <div className="secret-box">
                <code>{agentKey}</code>
                <button
                  className="icon-button"
                  title={uiText("复制令牌")}
                  onClick={() =>
                    void act(
                      "copy",
                      () => navigator.clipboard.writeText(agentKey),
                      uiText("令牌已复制"),
                    )
                  }
                >
                  <Copy size={16} />
                </button>
                <p>{uiText("请妥善保存。切换页面后不再显示。")}</p>
              </div>
            )}
            <code className="api-path">/api/v1/agent/capabilities</code>
            <button className="text-button" disabled={!!busy} onClick={()=>void act('view-openapi',async()=>{setDocumentOpen(true);setDocumentText(uiText("正在读取文档，请稍候…"));try{setDocumentText(JSON.stringify(await api('/openapi'),null,2));}catch(e){setDocumentText(uiText("读取失败：")+(e as Error).message);throw e;}})}>{uiText("查看 OpenAPI 文档")}<ArrowUpRight size={14}/></button>
          </div>
        </section>
        <section className="panel settings-card">
          <div className="section-row">
            <h2>{uiText("运行日志与诊断")}</h2>
            <button
              className="icon-button"
              title={uiText("刷新日志")}
              onClick={() =>
                void act("log", async () =>
                  setLogs(
                    (await api<{ text: string }>("/logs/" + logType)).text,
                  ),
                )
              }
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <select
            aria-label={uiText("日志类型")}
            value={logType}
            onChange={(e) => {
              setLogType(e.target.value);
              setLogs("");
            }}
          >
            <option value="comfy">{uiText("ComfyUI 日志")}</option>
            <option value="ollama">{uiText("Ollama 日志")}</option>
            <option value="installation">{uiText("安装日志")}</option>
          </select>
          <pre className="log-view">{logs || uiText("点击刷新，读取本机日志。")}</pre>
          <p className="footnote">{uiText("真实出片验收：创建测试项目 → 下载完整模型 → 资源预检 → 生成 5 秒镜头 → 确认可播放且已归档。只有连通服务不算验收完成。")}</p>
        </section>
        <LanguageSettings onChange={onLanguageChange} act={act} busy={busy}/><Appearance/>
      </div>
    </>
  );
}
