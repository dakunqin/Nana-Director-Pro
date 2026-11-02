import {t as uiText} from './i18n';
import CustomModels from './CustomModels';
import { useState } from "react";
import {
  Download,
  Pause,
  Check,
  ArrowUpRight,
  Box,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";
import { api, bytes } from "./api";
import type { Catalog, Status, Settings, Operation } from "./types";
import { SectionTitle, Busy, jobLabels, type Act } from "./components";
interface Props {
  catalog: Catalog | null;
  status: Status | null;
  settings: Settings | null;
  operations: Operation[];
  act: Act;
  busy: string;
  onNavigate: (p: string) => void;
}
export default function ModelCenter({
  catalog,
  status,
  settings,
  operations,
  act,
  busy,
  onNavigate,
}: Props) {
  const [licenses, setLicenses] = useState(false);
  const [imageDownload,setImageDownload]=useState<string|null>(null);
  if (!catalog) return <Busy />;
  const h3 = catalog.resources.filter((r) => r.group === "h3");
  const imageSelection=catalog.resources.filter(r=>imageDownload==='flux-bundle'?r.group==='image-flux':r.id===imageDownload);
  const download = (ids: string[]) =>
    act(
      "download",
      () => api("/models/download", "POST", { ids, acceptLicenses: licenses }),
      uiText("已加入下载队列"),
    );
  return (
    <>
      <SectionTitle
        eyebrow="LOCAL MODEL LIBRARY"
        title={uiText("你的本地模型库")}
        description={uiText("一次下载，持续创作。每个模型的来源、许可与状态，清楚可见。")}
        action={
          <span className="pill">
            <ShieldCheck size={14} />{uiText("SHA256 完整性校验")}</span>
        }
      />
      <CustomModels act={act} busy={busy}/>
      <div className="model-intro panel">
        <div className="model-intro-symbol">
          <BrainCircuit size={32} />
        </div>
        <div>
          <h3>{uiText("先规划故事，再生成画面。")}</h3>
          <p>{uiText("导演模型负责剧本和分镜；H3 模型负责视频和声音。系统按阶段释放模型，减少显存争用。")}</p>
        </div>
        <button className="text-button" onClick={() => onNavigate("settings")}>{uiText("环境设置")}<ArrowUpRight size={15} />
        </button>
      </div>
      <div className="section-row" id="setup-director-models">
        <div>
          <h2>{uiText("本地导演模型")}</h2>
          <p>{uiText("通过 Ollama 下载与管理；不会调用云端模型。")}</p>
        </div>
        <a
          className="text-button"
          href="https://ollama.com/library/qwen3"
          target="_blank"
          rel="noreferrer"
        >{uiText("模型来源与许可")}<ArrowUpRight size={14} />
        </a>
      </div>
      <div className="director-model-grid">
        {catalog.directorModels.map((model) => {
          const installed = status?.ollama.models.some(
            (m) => m.name === model.id,
          );
          const pulling = operations.find(
            (o) => o.kind === "model-pull" && o.status === "running",
          );
          return (
            <article
              key={model.id}
              className={
                "panel director-model " +
                (settings?.model === model.id ? "recommended" : "")
              }
            >
              <div className="section-row">
                <BrainCircuit size={24} />
                {settings?.model === model.id && (
                  <span className="badge succeeded">{uiText("当前使用")}</span>
                )}
              </div>
              <h3>{uiText(model.name)}</h3>
              <p>{uiText(model.description)}</p>
              <span className="footnote">{uiText("建议内存 ≥")}{model.ramGB} GB</span>
              <button
                className="button full"
                disabled={
                  !status?.ollama.online || !!busy || !!pulling || installed
                }
                onClick={() =>
                  void act("pull", () =>
                    api("/models/pull", "POST", { model: model.id }),
                  )
                }
              >
                {installed ? (
                  <>
                    <Check size={15} />{uiText("已安装")}</>
                ) : pulling ? (
                  <Busy />
                ) : (
                  <>
                    <Download size={15} />{uiText("下载到本机")}</>
                )}
              </button>
            </article>
          );
        })}
      </div>
      {!status?.ollama.online && (
        <div className="subtle-banner">{uiText("请先在“设置”中安装并启动 Ollama，或连接已有本地服务。")}</div>
      )}
      {operations
        .filter((o) => o.kind === "model-pull")
        .slice(-2)
        .map((o) => (
          <div className="operation" key={o.id}>
            <strong>{uiText("导演模型下载 ·")}{jobLabels[o.status] || o.status}</strong>
            <p>{uiText(o.message)}</p>
            {o.status === "running" && (
              <progress value={o.progress} max={100} />
            )}
          </div>
        ))}
      <div className="section-row" id="setup-video-models">
        <div>
          <h2>{uiText("MiniMax H3 · 基础视频套件")}<span className="badge">{uiText("5 个模型")}</span>
          </h2>
          <p>{uiText("极速文戏 / Standard · 合计")}{" "}
            {bytes(h3.reduce((sum, r) => sum + r.size, 0))}{uiText("，另需运行环境与作品空间。")}</p>
        </div>
        <button
          className="button primary"
          disabled={!licenses || !!busy}
          onClick={() => void download(h3.map((r) => r.id))}
        >
          <Download size={16} />{uiText("下载整套模型")}</button>
      </div>
      <div className="license-box">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={licenses}
            onChange={(e) => setLicenses(e.target.checked)}
          />{uiText("我已阅读各资源的来源与许可证，并确认符合下载及使用条件。")}</label>
        <p>{uiText("软件开源许可与模型许可相互独立。模型不会随软件分发。")}</p>
      </div>
      <section className="panel settings-card"><h2>{uiText("推荐：FLUX.2 Klein 4B · 人物参考编辑四视图")}</h2><p>{uiText("分别生成四个角度，并通过参考潜变量保持主体特征；比 SDXL 四格草稿更适合本任务。实际一致性仍需审片。套件包含扩散模型、文本编码器、VAE。")}</p>{catalog.resources.filter(r=>r.group==='image-flux').map(r=>{const task=catalog.downloads.find(d=>d.id===r.id);return <div key={r.id}><a href={r.source} target="_blank" rel="noreferrer">{uiText(r.name)}</a> · {bytes(r.size)}{task&&<><p>{jobLabels[task.status]||task.status} · {bytes(task.completed||0)} / {bytes(r.size)}</p><progress value={task.completed||0} max={r.size}/>{task.error&&<p>{uiText(task.error)}</p>}{['downloading','verifying'].includes(task.status)&&<button className="button small" onClick={()=>void act('pause-flux',()=>api('/downloads/'+r.id+'/pause','POST'))}>{uiText("暂停")}{uiText(r.name)}</button>}</>}</div>;})}<button className="button primary" disabled={!!busy} onClick={()=>setImageDownload('flux-bundle')}>{uiText("下载 FLUX 四视图套件")}</button></section>
      <section className="panel settings-card" id="setup-image-models"><h2>{uiText("四视图素材 · 图片生成模型")}</h2><p>{uiText("独立于 H3 视频模型。首次使用需下载，已有兼容 SDXL checkpoint 也可直接选择。托管 ComfyUI 下载后请重启服务。")}</p>{catalog.resources.filter(r=>r.group==='image').map(r=>{const task=catalog.downloads.find(d=>d.id===r.id);const active=task&&['downloading','verifying'].includes(task.status);return <div key={r.id}><h3>{uiText(r.name)} · {bytes(r.size)}</h3><a href={r.source} target="_blank" rel="noreferrer">{uiText("来源与许可：")}{uiText(r.license)}</a>{task&&<><p>{jobLabels[task.status]||task.status} · {bytes(task.completed||0)} / {bytes(r.size)}</p><progress max={r.size} value={task.completed||0}/>{task.error&&<p>{uiText(task.error)}</p>}</>}{active?<button className="button" onClick={()=>void act('pause-image-download',()=>api('/downloads/'+r.id+'/pause','POST'))}>{uiText("暂停图片模型下载")}</button>:<button className="button" disabled={!!busy||task?.status==='completed'} onClick={()=>setImageDownload(r.id)}>{task?.status==='completed'?uiText("图片模型已校验"):uiText("下载图片模型")}</button>}</div>;})}</section>
      {imageDownload&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label={uiText("下载图片模型")}><h2>{uiText("下载四视图图片模型")}</h2><p>{imageSelection.map(r=>r.name).join("、")} · {bytes(imageSelection.reduce((sum,r)=>sum+r.size,0))}{uiText("。使用条件与软件开源许可独立。")}</p><p>{imageSelection.map(r=><a key={r.id} href={r.source} target="_blank" rel="noreferrer">{uiText(r.name)}{uiText("· 来源及")}{uiText(r.license)}{uiText("许可")}<br/></a>)}</p><p>{uiText("确认后开始本机下载并校验完整性；下载后请重启 ComfyUI，再检查图片引擎。")}</p><div className="button-row"><button className="button" onClick={()=>setImageDownload(null)}>{uiText("取消")}</button><button className="button primary" disabled={!!busy} onClick={()=>void act('download-image',async()=>{await api('/models/download','POST',{ids:imageSelection.map(r=>r.id),acceptLicenses:true});setImageDownload(null);},uiText("图片模型已加入下载队列"))}>{uiText("同意许可并开始下载")}</button></div></section></div>}
      <div className="resource-table">
        {h3.map((resource) => {
          const task = catalog.downloads.find((d) => d.id === resource.id);
          const active =
            task?.status === "downloading" || task?.status === "verifying";
          return (
            <article className="resource-row" key={resource.id}>
              <div className="resource-icon">
                <Box size={24} strokeWidth={1.2} />
              </div>
              <div className="resource-info">
                <h3>
                  {uiText(resource.name)}
                  <span className="badge">{bytes(resource.size)}</span>
                </h3>
                <code>{resource.path.split("/").at(-1)}</code>
                <div className="resource-links">
                  <a href={resource.source} target="_blank" rel="noreferrer">{uiText("来源与许可")}<ArrowUpRight size={11} />
                  </a>
                  <span>{uiText(resource.license)}</span>
                </div>
                {task && (
                  <>
                    <div className="download-meta">
                      <span>
                        {jobLabels[task.status] || task.status}
                        {task.status === "downloading"
                          ? " · " + bytes(task.speed || 0) + "/s"
                          : ""}
                      </span>
                      <span>
                        {bytes(task.completed || 0)} / {bytes(resource.size)}
                      </span>
                    </div>
                    <progress max={resource.size} value={task.completed || 0} />
                    {task.error && <p className="error-text">{uiText(task.error)}</p>}
                  </>
                )}
              </div>
              {task?.status === "completed" ? (
                <span className="verified">
                  <Check size={17} />{uiText("已校验")}</span>
              ) : active ? (
                <button
                  className="icon-button"
                  aria-label={uiText("暂停 ") + resource.name}
                  onClick={() =>
                    void act("pause-download", () =>
                      api("/downloads/" + resource.id + "/pause", "POST"),
                    )
                  }
                >
                  <Pause size={18} />
                </button>
              ) : (
                <button
                  className="button small"
                  disabled={!licenses || !!busy}
                  onClick={() => void download([resource.id])}
                >
                  <Download size={15} />
                  {task ? uiText("继续 / 重试") : uiText("下载")}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <div className="subtle-banner">
        <ShieldCheck size={17} />
        <span>{uiText("资源清单已固定版本与文件哈希。当前 H3 GPU 组合仍需真实出片验收，高级工作流暂不启用。")}</span>
      </div>
      <div className="panel info-panel">
        <h3>{uiText("已有模型？无需重复下载。")}</h3>
        <p>{uiText("将文件放到数据目录下对应的 models 子目录，再点击下载：系统会先校验已有文件，正确后直接登记。托管 ComfyUI 会读取这个共享模型目录。")}</p>
        <p>{uiText("使用已有 ComfyUI 时，直接使用它的模型目录；提交前的资源预检会检查真实可用的模型与节点。")}</p>
      </div>
    </>
  );
}
