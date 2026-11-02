import {currentLanguage} from './i18n';
import {t as uiText} from './i18n';
import PreviewDialog from './PreviewDialog';
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  Aperture,
  Info,
  Sparkles,
  LayoutDashboard,
  Clapperboard,
  FolderOpen,
  Images,
  Layers3,
  Box,
  Settings2,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Film,
  HardDrive,
  Monitor,
  Check,
  ChevronRight,
  Menu,
  X,
  Download,
  Pause,
  Play,
  RotateCcw,
  RefreshCw,
  Upload,
  CheckCircle2,
  TriangleAlert,
  ChevronDown,
  Activity,
  Save,
  Trash2,
} from "lucide-react";
import { api, connect, fileUrl, bytes } from "./api";
import type {
  Project,
  Job,
  Operation,
  Catalog,
  Settings,
  Status,
  Hardware,
  Asset,
  Preparation,
} from "./types";
import {
  Empty,
  Busy,
  SectionTitle,
  NewButton,
  jobLabels,
  type Act,
} from "./components";
import Workbench from "./Workbench";
import ModelCenter from "./ModelCenter";
import SettingsPage from "./SettingsPage";
import AboutPage from "./AboutPage";
import {ThemeSelect} from './Appearance';
import AssetGenerator from './AssetGenerator';
import ResourceBar from './ResourceBar';
import JobDetails from './JobDetails';
import QueueClock from './QueueClock';
import PreparationPanel from './PreparationPanel';

const navigation = [
  { id: "overview", label: uiText("工作室总览"), icon: LayoutDashboard },
  { id: "projects", label: uiText("电影项目"), icon: FolderOpen },
  { id: "director", label: uiText("导演工作台"), icon: Clapperboard },
  { id: "asset-generator", label: uiText("生成素材"), icon: Sparkles },
  { id: "assets", label: uiText("素材库"), icon: Images },
  { id: "queue", label: uiText("生成队列"), icon: Layers3 },
  { id: "models", label: uiText("模型中心"), icon: Box },
  { id: "settings", label: uiText("设置"), icon: Settings2 },
];
const example =
  uiText("第一场 · 清晨 · 旧书店\n\n温暖的阳光穿过木窗，落在一排旧书上。一只橘猫从书架后探出头，轻轻跳上窗台。\n\n第二场 · 窗边\n\n一位年轻女孩推门走进书店，停下脚步，望向窗边的猫。猫缓缓转头，和她对视。门铃的余音消失，街道传来轻微的自行车铃声。");
export default function App() {
  const [generationTarget,setGenerationTarget]=useState("");
  const [page, setPage] = useState("overview"),
    [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [jobs, setJobs] = useState<Job[]>([]),
    [ops, setOps] = useState<Operation[]>([]),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [status, setStatus] = useState<Status | null>(null),
    [hardware, setHardware] = useState<Hardware | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [newProject, setNewProject] = useState(false),
    [name, setName] = useState(""),
    [mobile, setMobile] = useState(false),
    [dirty, setDirty] = useState(false);
  const [queueVisit,setQueueVisit]=useState(0);
  useLayoutEffect(()=>{if(page==='queue'||page==='about')window.scrollTo({top:0,left:0,behavior:'instant'});},[page,queueVisit]);
  const dirtyRef = useRef(false),
    activeRef = useRef<string | null>(null);
  const projectRef = useRef<Project | null>(null),
    revision = useRef(0);
  const [preparation,setPreparation]=useState<Preparation|null>(null),[preparationError,setPreparationError]=useState<string|null>(null),[checkingPreparation,setCheckingPreparation]=useState(true);
  const preparationRequest=useRef(0);
  const [preparationTarget,setPreparationTarget]=useState<string|null>(null);
  const [renameTarget,setRenameTarget]=useState<Project|null>(null),[renameValue,setRenameValue]=useState("");
  const showRename=(p:Project)=>{setRenameTarget(p);setRenameValue(p.name);};
  const preparationLatest=useRef<Preparation|null>(null);
  const preparationReady=!!preparation?.videoReady&&!!preparation?.planningReady&&preparation.items.every(item=>item.state==='ready');
  const refreshPreparation=async(force=false)=>{const request=++preparationRequest.current;const visible=force||!preparationLatest.current;if(visible)setCheckingPreparation(true);try{const value=await api<Preparation>('/readiness'+(force?'?refresh=1':''));if(request===preparationRequest.current){preparationLatest.current=value;setPreparation(value);setPreparationError(null);}return value;}catch(e){if(request===preparationRequest.current&&visible){preparationLatest.current=null;setPreparation(null);setPreparationError((e as Error).message);}return null;}finally{if(request===preparationRequest.current)setCheckingPreparation(false);}};
  dirtyRef.current = dirty;
  activeRef.current = project?.id || null;
  projectRef.current = project;
  const setCurrent = (p: Project | null) => {
    projectRef.current = p;
    activeRef.current = p?.id || null;
    setProject(p);
  };
  const toast = (text: string, error = false) => setNotice({ text:uiText(text), error });
  const refresh = async (initial = false) => {
    const statusRequest=api<Status>("/status").catch(()=>null);
    const [ps, js, os, cat] = await Promise.all([
      api<Project[]>("/projects"),
      api<Job[]>("/jobs"),
      api<Operation[]>("/operations"),
      api<Catalog>("/catalog"),
    ]);
    setProjects(ps);
    setJobs(js);
    setOps(os);
    setCatalog(cat);
    if(initial)void statusRequest.then(setStatus).catch(()=>{});else setStatus(await statusRequest);
    if (initial) {
      setSettings(await api<Settings>("/settings"));
      void api<Hardware>("/hardware").then(setHardware).catch(()=>{});
      const selected = localStorage.getItem("nana-project");
      const p = ps.find((p) => p.id === selected) || ps[0] || null;
      setCurrent(p);
    } else if (activeRef.current && !dirtyRef.current) {
      const p = ps.find((p) => p.id === activeRef.current);
      if (p && (!projectRef.current || p.version > projectRef.current.version))
        setCurrent(p);
    }
  };
  useEffect(() => {
    let stopped = false;
    connect()
      .then(() => refresh(true))
      .then(() => {
        if (!stopped) setReady(true);
      })
      .catch((e) => toast(uiText("无法连接本地工作室：") + e.message, true));
    const timer = setInterval(() => {
      if (!stopped) refresh().catch(() => {});
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (status?.install?.status === "completed")
      api<Settings>("/settings")
        .then(setSettings)
        .catch(() => {});
  }, [status?.install?.status]);
  useEffect(()=>{if(!ready)return;void refreshPreparation();const timer=setInterval(()=>void refreshPreparation(),12000);return()=>clearInterval(timer);},[ready]);
  useEffect(()=>{if(ready){preparationLatest.current=null;setPreparation(null);void refreshPreparation(true);}},[settings?.model,settings?.ollamaUrl,settings?.comfyUrl]);
  const preparationDownloads=JSON.stringify([catalog?.downloads.map(d=>[d.id,d.status]),ops.filter(o=>o.kind==='model-pull'||o.kind==='installation').map(o=>[o.id,o.status])]);
  useEffect(()=>{if(ready)void refreshPreparation(true);},[preparationDownloads]);
  useEffect(()=>{if(preparationTarget){const target=document.getElementById('setup-'+preparationTarget);if(target){target.scrollIntoView({block:'start',behavior:'smooth'});setPreparationTarget(null);}}},[page,preparationTarget]);
  const act: Act = async (label, fn, success) => {
    setBusy(label);
    try {
      await fn();
      await refresh();
      if (success) toast(success);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };
  const select = (p: Project) => {
    if (dirty && !window.confirm(uiText("当前有未保存的修改，仍然切换项目吗？")))
      return;
    revision.current++;
    setCurrent(p);
    dirtyRef.current = false;
    setDirty(false);
    localStorage.setItem("nana-project", p.id);
    setPage("director");
  };
  const create = () =>
    act("create", async () => {
      const p = await api<Project>("/projects", "POST", { name });
      select(p);
      setNewProject(false);
      setName("");
    });
  const updateDraft = (p: Project) => {
    revision.current++;
    setCurrent(p);
    dirtyRef.current = true;
    setDirty(true);
  };
  const editAsset = (id: string, patch: Partial<Asset>) => {
    const p = projectRef.current;
    if (p?.plan)
      updateDraft({
        ...p,
        plan: {
          ...p.plan,
          assets: p.plan.assets.map((a) =>
            a.id === id ? { ...a, ...patch } : a,
          ),
        },
      });
  };
  const save = async () => {
    const submitted = projectRef.current,
      submittedRevision = revision.current;
    if (!submitted) return;
    const next = await api<Project>("/projects/" + submitted.id, "PATCH", {
      ...submitted,
      version: submitted.version,
    });
    if (projectRef.current?.id === submitted.id) {
      if (revision.current === submittedRevision) {
        setCurrent(next);
        dirtyRef.current = false;
        setDirty(false);
      } else if (projectRef.current.version < next.version)
        setCurrent({
          ...projectRef.current,
          version: next.version,
          updatedAt: next.updatedAt,
        });
    }
    return next;
  };
  const saveSettings = async (value: Settings) => {
    const s = await api<Settings>("/settings", "PATCH", value);
    setSettings(s);
  };
  const switchPage = (id: string) => {
    if(id==='queue')setQueueVisit(n=>n+1);
    setPage(id);
    setMobile(false);
  };
  const activeJobs = jobs.filter(
    (j) =>
      !["succeeded", "failed", "cancelled", "interrupted"].includes(j.status),
  );
  const queueRunning=jobs.some(j=>['preflight','submitting','submitted','running','collecting'].includes(j.status));
  const content = () => {
    if (page === "director")
      return project ? (
        <Workbench
          project={project}
          jobs={jobs}
          status={status}
          operations={ops}
          dirty={dirty}
          busy={busy}
          act={act}
          onChange={updateDraft}
          onSave={save}
          onRename={showRename}
          onNew={() => setNewProject(true)}
          onNavigate={switchPage}
          preparation={preparation}
          onPrepare={()=>refreshPreparation(true)}
        />
      ) : (
        <Empty
          title={uiText("你的下一部电影，从这里开始")}
          detail={uiText("先创建一个项目，保存剧本，再让本地导演帮你拆解镜头。")}
        >
          <NewButton onClick={() => setNewProject(true)} />
        </Empty>
      );
    if (page === "models")
      return (
        <ModelCenter
          catalog={catalog}
          status={status}
          settings={settings}
          operations={ops}
          act={act}
          busy={busy}
          onNavigate={switchPage}
        />
      );
    if (page === "about")return <AboutPage/>;
    if (page === "settings")
      return settings ? (
        <SettingsPage
          settings={settings}
          hardware={hardware}
          status={status}
          act={act}
          busy={busy}
          onSave={saveSettings}
          onLanguageChange={async(language)=>{if(dirtyRef.current)await save();await api("/ui-preferences","POST",{language});window.location.reload();}}
        />
      ) : (
        <Busy />
      );
    if(page === "asset-generator")return <><SectionTitle eyebrow="ASSET STUDIO" title={uiText("生成素材")} description={uiText("生成、预览人物、动物与场景素材，确认后加入素材库。")}/><AssetGenerator key={project?.id||"none"} initialTarget={generationTarget} project={project} act={act} busy={busy} onSave={save} onNavigate={switchPage} onAdopt={p=>{if(projectRef.current?.id!==p.id)return;revision.current++;if(dirtyRef.current){const current=projectRef.current;setCurrent({...current,assets:p.assets,plan:current.plan?{...current.plan,assets:[...current.plan.assets,...(p.plan?.assets||[]).filter(a=>!current.plan!.assets.some(c=>c.id===a.id))]}:p.plan,version:p.version,updatedAt:p.updatedAt});}else setCurrent(p);switchPage("assets");}}/></>;
    if (page === "assets")
      return (
        <>
          <SectionTitle
            eyebrow="ASSET LIBRARY"
            title={uiText("让角色，始终如一。")}
            description={uiText("从角色到场景，让每一帧保持一致。")}
            action={
              project?.plan && (
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() => {
                      const p = projectRef.current!;
                      updateDraft({
                        ...p,
                        plan: {
                          ...p.plan!,
                          assets: [
                            ...p.plan!.assets,
                            {
                              id: "asset-" + Date.now(),
                              name: uiText("新资产"),
                              kind: "prop",
                              description: uiText("请填写外观与一致性要求"),
                            },
                          ],
                        },
                      });
                    }}
                  >
                    <Plus size={15} />{uiText("添加资产")}</button>
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={() =>
                      void act("save-assets", save, uiText("项目与资产已保存"))
                    }
                  >
                    <Save size={15} />{uiText("保存资产设定")}</button>
                </div>
              )
            }
          />

          {!project?.plan ? (
            <Empty
              icon={<Images size={28} />}
              title={uiText("还没有角色与场景")}
              detail={uiText("完成剧本规划后，本地导演会整理角色、场景和道具。")}
            >
              <button className="button" onClick={() => switchPage("director")}>{uiText("前往导演工作台")}<ArrowRight size={15} />
              </button>
            </Empty>
          ) : (
            <>
              <div className="subtle-banner">{uiText("当前项目：")}{project.name}{uiText("。先上传图片，再在镜头中勾选引用资产。默认自动选择会使用图片保持外观；文生视频不使用图片。")}</div>
              <div className="asset-grid">
                {project.plan.assets.map((asset) => {
                  const image = project.assets.find(
                    (a) => a.assetId === asset.id,
                  );
                  return (
                    <article className="asset-card" key={asset.id}>
                      <div className="asset-image">
                        {image ? (
                          <img src={fileUrl(image.path)} alt={asset.name} />
                        ) : (
                          <Images size={36} />
                        )}
                        <span className="asset-kind">
                          {
                            {
                              character: uiText("角色"),
                              location: uiText("场景"),
                              prop: uiText("道具"),
                            }[asset.kind]
                          }
                        </span>
                      </div>
                      <div className="asset-body">
                        <h3>{asset.name}</h3>
                        <p>{asset.description}</p>
                        <details className="asset-edit">
                          <summary>{uiText("编辑资产设定")}</summary>
                          <div className="form-stack">
                            <label>{uiText("资产名称")}<input
                                value={asset.name}
                                onChange={(e) =>
                                  editAsset(asset.id, { name: e.target.value })
                                }
                              />
                            </label>
                            <label>{uiText("资产类型")}<select
                                value={asset.kind}
                                onChange={(e) =>
                                  editAsset(asset.id, {
                                    kind: e.target.value as Asset["kind"],
                                  })
                                }
                              >
                                <option value="character">{uiText("人物 / 角色")}</option>
                                <option value="location">{uiText("场景")}</option>
                                <option value="prop">{uiText("道具")}</option>
                              </select>
                            </label>
                            <label>{uiText("资产描述")}<textarea
                                rows={4}
                                value={asset.description}
                                onChange={(e) =>
                                  editAsset(asset.id, {
                                    description: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <button
                              className="button small"
                              disabled={project.plan!.shots.some((s) =>
                                s.assetIds.includes(asset.id),
                              )}
                              title={uiText("被镜头引用的资产，请先在镜头设定中解除引用")}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    uiText("移除这条资产设定？已上传的文件仍保留在项目中。"),
                                  )
                                )
                                  updateDraft({
                                    ...project,
                                    plan: {
                                      ...project.plan!,
                                      assets: project.plan!.assets.filter(
                                        (a) => a.id !== asset.id,
                                      ),
                                    },
                                  });
                              }}
                            >
                              <Trash2 size={13} />{uiText("移除资产")}</button>
                          </div>
                        </details>
                        <button className="button small danger-outline" disabled={!!busy} onClick={()=>{if(window.confirm(uiText("删除此素材及绑定图片，并解除镜头引用？已生成的视频不会删除。")))void act('delete-library-asset',async()=>{const saved=await save();if(!saved)return;const p=await api<Project>('/projects/'+saved.id+'/assets/'+asset.id,'DELETE',{version:saved.version});setCurrent(p);dirtyRef.current=false;setDirty(false);},uiText("素材已删除，镜头引用已解除"));}}><Trash2 size={14}/>{uiText("删除素材")}</button>
                        <button className="button small" disabled={!!busy} onClick={()=>{setGenerationTarget(asset.id);switchPage("asset-generator");}}>{uiText("生成四视图")}</button>
                        <label className="button small upload">
                          <Upload size={14} />
                          {image ? uiText("更换参考图") : uiText("上传参考图")}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              void act(
                                "asset",
                                async () => {
                                  if (file.size > 20 * 1024 * 1024)
                                    throw new Error(uiText("图片不能超过 20 MB"));
                                  const base64 = await new Promise<string>(
                                    (resolve, reject) => {
                                      const r = new FileReader();
                                      r.onload = () =>
                                        resolve(String(r.result).split(",")[1]);
                                      r.onerror = reject;
                                      r.readAsDataURL(file);
                                    },
                                  );
                                  if (
                                    !projects
                                      .find((p) => p.id === project.id)
                                      ?.plan?.assets.some(
                                        (a) => a.id === asset.id,
                                      )
                                  )
                                    await save();
                                  const p = await api<Project>(
                                    "/projects/" + project.id + "/assets",
                                    "POST",
                                    { assetId: asset.id, base64 },
                                  );
                                  if (projectRef.current?.id === p.id) {
                                    revision.current++;
                                    if (dirtyRef.current)
                                      setCurrent({
                                        ...projectRef.current,
                                        assets: p.assets,
                                        version: Math.max(
                                          p.version,
                                          projectRef.current.version,
                                        ),
                                        updatedAt: p.updatedAt,
                                      });
                                    else setCurrent(p);
                                  }
                                },
                                uiText("参考图已绑定"),
                              );
                            }}
                          />
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      );
    if (page === "queue")
      return (
        <>
          <SectionTitle
            eyebrow="RENDER QUEUE"
            title={uiText("每一帧，都在路上。")}
            description={uiText("串行生成，自动归档。失败镜头可单独重试。")}
            action={
              <div className="button-row">
                <button
                  className="button"
                  onClick={() =>
                    void act(
                      "pause",
                      () => api("/jobs/pause", "POST"),
                      uiText("已暂停后续任务"),
                    )
                  }
                >
                  <Pause size={15} />{uiText("暂停后续")}</button>
                <button
                  className="button primary"
                  onClick={() =>
                    void act("run", () => api("/jobs/run", "POST"))
                  }
                >
                  <Play size={15} />{uiText("继续队列")}</button>
              </div>
            }
          />
          <OperationList operations={ops} act={act} />
          {jobs.length ? (
            <div className="job-list">
              {[...jobs].reverse().map((job) => (
                <div className="job-row" key={job.id}>
                  <div className={"job-symbol " + job.status}>
                    {job.status === "succeeded" ? (
                      <Check size={20} />
                    ) : ["preflight","submitting","submitted","running","collecting"].includes(job.status) ? (<LoaderCircle size={20} className="spin"/>) : job.status === "failed" ? (
                      <TriangleAlert size={20} />
                    ) : (
                      <Film size={20} />
                    )}
                  </div>
                  <div className="job-info">
                    <strong>{job.shot.title}</strong>
                    <span>
                      {projects.find((p) => p.id === job.projectId)?.name} ·{" "}
                      {job.shot.duration}s · {job.shotId}
                    </span>
                    {job.continuityMessage&&<p className="continuity-note">{uiText(job.continuityMessage)}</p>}
                    {(job.error || job.message) && (
                      <p className={job.error ? "error-text" : ""}>
                        {job.error || job.message}
                      </p>
                    )}
                  </div>
                  <JobDetails job={job}/>
                  <span className={"badge " + job.status}>
                    {jobLabels[job.status] || job.status}
                  </span>
                  {job.output && (
                    <a
                      className="icon-button"
                      href={fileUrl(job.output, true)}
                      title={uiText("下载片段")}
                    >
                      <Download size={18} />
                    </a>
                  )}
                  {["failed", "interrupted", "cancelled"].includes(
                    job.status,
                  ) ? (
                    <button
                      className="icon-button"
                      title={uiText("重试镜头")}
                      onClick={() =>
                        void act("retry", () =>
                          api("/jobs/" + job.id + "/retry", "POST"),
                        )
                      }
                    >
                      <RotateCcw size={17} />
                    </button>
                  ) : (
                    !["succeeded"].includes(job.status) && (
                      <button
                        className="icon-button"
                        title={uiText("取消任务")}
                        onClick={() =>
                          void act("cancel", () =>
                            api("/jobs/" + job.id + "/cancel", "POST"),
                          )
                        }
                      >
                        <X size={17} />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Layers3 size={28} />}
              title={uiText("队列准备好了")}
              detail={uiText("在导演工作台选择镜头，就可以开始你的第一次生成。")}
            />
          )}

        </>
      );
    if (page === "projects")
      return (
        <>
          <SectionTitle
            eyebrow="YOUR FILMS"
            title={uiText("每个故事，都值得被看见。")}
            description={uiText("剧本、分镜、素材和成片，保存在你自己的电脑里。")}
            action={<NewButton onClick={() => setNewProject(true)} />}
          />
          <ProjectGrid
            projects={projects}
            onSelect={select}
            onRename={showRename}
          onNew={() => setNewProject(true)}
          />
        </>
      );
    return (
      <>
        <div className="overview-heading">
          <div className="eyebrow">
            <span className="tiny-star">✳</span> YOUR LOCAL FILM STUDIO
          </div>
          <span className="quiet">{uiText("创作的主场，在你这里。")}</span>
        </div>
        <section className="hero">
          <div className="hero-copy">
            <div className="pill">
              <span className="dot lime" />{uiText("全本地 · 自由创作 · 开源")}</div>
            <h1>{uiText("让故事，")}<br />{uiText("成为画面。")}</h1>
            <p>{uiText("从一个灵感，到一部作品。")}<br />{uiText("你的 AI 导演与视频引擎，尽在本地。")}</p>
            <NewButton onClick={() => setNewProject(true)} />
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() =>
                void act("example", async () => {
                  const p = await api<Project>("/projects/example", "POST", {
                    name: uiText("窗边的相遇 · 示例剧本"),
                    script: example,
                  });
                  select(p);
                })
              }
            >{uiText("试试示例剧本")}<ArrowUpRight size={15} />
            </button>
          </div>
          <div className="hero-art" aria-label={uiText("电影取景器装饰")}>
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <div className="art-grain" />
            <div className="viewfinder">
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner bl" />
              <span className="corner br" />
              <div className="finder-top">
                <span>
                  <span className="dot lime" /> CREATIVE FREEDOM
                </span>
                <Aperture size={22} />
              </div>
              <div className="finder-center">
                <div className="aperture-ring">
                  <Aperture size={66} strokeWidth={0.6} />
                </div>
                <span>YOUR NEXT FRAME</span>
              </div>
              <div className="finder-bottom">
                <span>
                  100% LOCAL
                  <br />
                  <small>{uiText("无限故事，本地发生")}</small>
                </span>
                <span className="frame-lines">▏▏▏▏▏▏▏▏▏▏▏▏</span>
              </div>
            </div>
            <div className="art-label">
              <span className="dot" /> NANA DIRECTOR PRO <span>01 / ∞</span>
            </div>
          </div>
        </section>
        <section className="stat-grid">
          <div className="stat-card">
            <FolderOpen size={20} />
            <div>
              <span>{uiText("电影项目")}</span>
              <strong>
                {String(projects.length).padStart(2, "0")}
                <small>{uiText("部作品，等待发生")}</small>
              </strong>
            </div>
          </div>
          <div className="stat-card">
            <Film size={20} />
            <div>
              <span>{uiText("已完成镜头")}</span>
              <strong>
                {String(
                  jobs.filter((j) => j.status === "succeeded").length,
                ).padStart(2, "0")}
                <small>{uiText("每一次想象的落地")}</small>
              </strong>
            </div>
          </div>
          <div className="stat-card">
            <Activity size={20} />
            <div>
              <span>{uiText("正在进行")}</span>
              <strong>
                {String(activeJobs.length).padStart(2, "0")}
                <small>{uiText("个视频任务")}</small>
              </strong>
            </div>
          </div>
          <div className="stat-card">
            <HardDrive size={20} />
            <div>
              <span>{uiText("数据盘可用空间")}</span>
              <strong>
                {hardware ? bytes(hardware.freeBytes) : uiText("检测中")}
                <small>{uiText("模型与作品的空间")}</small>
              </strong>
            </div>
          </div>
        </section>
        <div className="section-row">
          <div>
            <h2>{uiText("最近的故事")}<span className="count">{projects.length}</span>
            </h2>
            <p>{uiText("回到你的创作现场。")}</p>
          </div>
          <button
            className="text-button"
            onClick={() => switchPage("projects")}
          >{uiText("全部项目")}<ArrowRight size={16} />
          </button>
        </div>
        <ProjectGrid
          projects={projects.slice(0, 3)}
          onSelect={select}
          onRename={showRename}
          onNew={() => setNewProject(true)}
        />
        <section className="bottom-grid">
          <div className="panel engine-panel">
            <div className="section-row">
              <h3>{uiText("引擎就绪，灵感就位。")}</h3>
              <button
                className="icon-button"
                aria-label={uiText("检查运行环境")}
                onClick={() => switchPage("settings")}
              >
                <ArrowUpRight size={19} />
              </button>
            </div>
            <Engine
              name={uiText("本地 AI 导演")}
              detail={settings?.model || "Ollama"}
              online={!preparation||preparation.initializing?null:status?.ollama.online??null}
            />
            <Engine
              name={uiText("视频生成引擎")}
              detail="ComfyUI · MiniMax H3"
              online={!preparation||preparation.initializing?null:status?.comfy.online??null}
            />
            <p className="footnote">{uiText("连接成功后，仍需检查模型与节点，并完成真实出片测试。")}</p>
          </div>
          <div className="panel quick-panel">
            <div className="mini-label">{uiText("从这里开始 / GET STARTED")}</div>
            <h3>{uiText("把环境交给我们，")}<br />{uiText("把时间留给创作。")}</h3>
            <button className="button" onClick={() => switchPage("settings")}>{uiText("打开安装向导")}<ArrowRight size={16} />
            </button>
            <div className="quick-glyph">
              <Box size={68} strokeWidth={0.6} />
            </div>
          </div>
        </section>
      </>
    );
  };
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            switchPage("overview");
          }}
        >
          <div className="brand-symbol">
            <Aperture size={27} />
          </div>
          <span>
            nana<span className="brand-pro">DIRECTOR PRO</span>
          </span>
        </a>
        <div className="workspace-label">{uiText("你的创作空间")}<span>LOCAL</span>
        </div>
        <nav>
          {navigation.map((n, i) => (
            <button
              key={n.id}
              className={
                "nav-item " +
                (page === n.id ? "active" : "") +
                (n.id === "models" ? " nav-gap" : "")
              }
              onClick={() => switchPage(n.id)}
            >
              {n.id==="queue"&&queueRunning?<LoaderCircle size={19} className="spin nav-running-icon"/>:<n.icon size={19} />}
              <span>{n.label}</span>
              {n.id === "queue" && activeJobs.length > 0 && (
                <span className={"nav-count"+(queueRunning?" nav-count-running":"")}>{activeJobs.length}</span>
              )}
              {page === n.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={"nav-item "+(page==='about'?'active':'')} onClick={()=>switchPage('about')}><Info size={19}/><span>{uiText("关于")}</span></button>
          <div className="privacy-card">
            <div>
              <span className="dot lime" />{uiText("隐私，始终在本地")}</div>
            <p>{uiText("无需付费 API")}<br />{uiText("你的故事，只属于你。")}</p>
          </div>
          <div className="version">
            <span className="avatar">N</span>
            <div>
              Nana Studio<small>{uiText("Nana Director PRO · 开源版")}</small>
            </div>
            <Aperture size={15} />
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-overlay"
          aria-label={uiText("关闭导航")}
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={uiText("打开导航")}
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <button className="workspace-project-name" aria-label={uiText("重命名当前项目")} disabled={!project} title={project?.name||uiText("未选择项目")} onClick={()=>project&&showRename(project)}>{uiText("项目：")}{project?.name||uiText("未选择项目")}</button>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <ResourceBar/><div className="topbar-right"><QueueClock jobs={jobs} onOpen={()=>switchPage("queue")}/><button className={'readiness-indicator '+(preparationError&&!preparation?'warning':!preparation||preparation.initializing||checkingPreparation?'checking':preparationReady?'ready':'warning')} aria-label={preparationError&&!preparation?uiText("准备检查失败"):!preparation||preparation.initializing||checkingPreparation?uiText("正在检测准备状态"):preparationReady?uiText("资源已就绪"):uiText("资源尚需准备")} title={(preparationError&&!preparation?uiText("检测失败"):!preparation||preparation.initializing?uiText("正在检测"):preparationReady?uiText("已就绪，可以生成"):uiText("资源尚需准备"))+uiText(" · 点击查看设置")} onClick={()=>switchPage('settings')}>{preparationError&&!preparation?<TriangleAlert size={17}/>:!preparation||preparation.initializing||checkingPreparation?<RefreshCw size={17} className="spin"/>:preparationReady?<CheckCircle2 size={17}/>:<TriangleAlert size={17}/>}</button><ThemeSelect compact/>
            <span className="local-tag">
              <span className="dot lime" />{uiText("本地运行")}</span>
            <span className="topbar-divider" />
            <button
              className="engine-chip"
              onClick={() => switchPage("settings")}
            >
              <Monitor size={15} />
              <span>
                {hardware?.gpus[0]?.name?.replace("NVIDIA GeForce ", "") ||
                  uiText("运行环境")}
              </span>
              <ChevronDown size={12} />
            </button>
            <span className="avatar small-avatar">N</span>
          </div>
        </header>
        <main
          className={
            page === "director" ? "main-content studio-content" : "main-content"
          }
        >
          {notice && (
            <div
              className={"notice " + (notice.error ? "notice-error" : "")}
              role="status"
            >
              {notice.error ? (
                <TriangleAlert size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )}
              <span>{notice.text}</span>
              <button
                className="icon-button"
                aria-label={uiText("关闭提示")}
                onClick={() => setNotice(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="loading-screen">
              <Busy>{uiText("正在打开本地工作室，请稍候…")}</Busy><p>{uiText("正在读取项目和配置。服务与硬件会在界面打开后继续检测，无需重复安装。")}</p>
            </div>
          ) : (
            <>{(page==="overview"||page==="settings")&&<PreparationPanel value={preparation} error={preparationError} checking={checkingPreparation} onRefresh={()=>void refreshPreparation(true)} onNavigate={(page,target)=>{switchPage(page);setPreparationTarget(target||null);}}/>}{content()}</>
          )}
        </main>
        <footer className="app-footer">
          <span>
            <span className="dot lime" />
            LOCAL FIRST. STORY ALWAYS.
          </span>
          <span>{uiText("Nana Director PRO · 开源版")}</span>
        </footer>
      </div>
      {renameTarget&&<PreviewDialog title={uiText("重命名项目")} onClose={()=>setRenameTarget(null)} closeLabel={uiText("取消")}><form className="import-dialog-content" onSubmit={e=>{e.preventDefault();void act('rename-project',async()=>{const current=projectRef.current;const target=current?.id===renameTarget.id?current:renameTarget;const next=await api<Project>('/projects/'+target.id,'PATCH',{name:renameValue.trim(),version:target.version});if(current?.id===next.id){revision.current++;setCurrent(dirtyRef.current?{...current,name:next.name,version:next.version,updatedAt:next.updatedAt}:next);}setRenameTarget(null);},uiText("项目名称已更新"));}}><label>{uiText("新的项目名称")}<input value={renameValue} maxLength={120} onChange={e=>setRenameValue(e.target.value)}/></label><button className="button primary" type="submit" disabled={!!busy||!renameValue.trim()}>{uiText("保存名称")}</button></form></PreviewDialog>}
      {newProject && (
        <div className="modal-backdrop" onClick={() => setNewProject(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label={uiText("关闭窗口")}
              onClick={() => setNewProject(false)}
            >
              <X size={19} />
            </button>
            <div className="empty-icon">
              <Clapperboard size={28} />
            </div>
            <div className="eyebrow">A NEW STORY BEGINS</div>
            <h2 id="new-title">{uiText("你的下一部作品")}</h2>
            <p>{uiText("给故事起个名字。所有内容都将保存在本机。")}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label>{uiText("项目名称")}<input
                  autoFocus
                  aria-label={uiText("项目名称")}
                  value={name}
                  maxLength={120}
                  placeholder={uiText("例如：夏日最后一班列车")}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                className="button primary full"
                disabled={!name.trim() || busy === "create"}
              >
                {busy === "create" ? (
                  <Busy />
                ) : (
                  <>{uiText("创建项目")}<ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Engine({
  name,
  detail,
  online,
}: {
  name: string;
  detail: string;
  online: boolean|null;
}) {
  return (
    <div className="engine-row">
      <div className="engine-icon">
        {name.includes("AI") ? (
          <Aperture size={20} />
        ) : (
          <Clapperboard size={20} />
        )}
      </div>
      <div>
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>
      <span className={"badge " + (online ? "succeeded" : "offline")}>
        <span className={"dot " + (online ? "lime" : "")} />
        {online===null?<><RefreshCw size={12} className="spin"/>{uiText("正在检测")}</>:online ? uiText("已连接") : uiText("未连接")}
      </span>
    </div>
  );
}
function ProjectGrid({
  projects,
  onSelect,
  onNew,
  onRename,
}: {
  projects: Project[];
  onSelect: (p: Project) => void;
  onRename: (p:Project)=>void;
  onNew: () => void;
}) {
  return (
    <div className="project-grid">
      {projects.map((p, i) => (
        <article
          className={"project-card palette-" + (i % 3)}
          key={p.id}
        ><button className="project-card-open" onClick={()=>onSelect(p)}>
          <div className="project-cover">
            <div className="project-cover-lines" />
            <Clapperboard size={34} strokeWidth={0.8} />
            <span className="project-tag">
              {p.plan
                ? uiText("已规划 ") + p.plan.shots.length + uiText(" 个镜头")
                : uiText("剧本创作中")}
            </span>
            <span className="cover-no">
              FILM / {String(i + 1).padStart(2, "0")}
            </span>
          </div>
          <div className="project-body">
            <h3>
              {p.name}
              <ArrowUpRight size={17} />
            </h3>
            <p>
              {new Date(p.updatedAt).toLocaleDateString(currentLanguage())}{uiText("更新")}<span>{p.aspectRatio}</span>
            </p>
          </div>
        </button><button className="text-button project-rename" onClick={()=>onRename(p)}>{uiText("重命名项目")}</button></article>
      ))}
      <button className="new-project-card" onClick={onNew}>
        <span className="new-project-plus">
          <Plus size={24} />
        </span>
        <strong>{uiText("开启一个新故事")}</strong>
        <span>{uiText("下一部作品，从这里开始")}</span>
      </button>
    </div>
  );
}
export function OperationList({
  operations,
  act,
}: {
  operations: Operation[];
  act: Act;
}) {
  return (
    <div className="operations">
      {[...operations]
        .reverse()
        .slice(0, 8)
        .map((op) => (
          <div className="operation" key={op.id}>
            <div className="section-row">
              <strong>
                {op.status==="running"&&<LoaderCircle className="spin" size={15}/>}
                {{
                  planning: uiText("本地导演规划"),
                  export: uiText("成片导出"),
                  backup: uiText("项目备份"),
                  "model-pull": uiText("导演模型下载"),
                }[op.kind] || op.kind}
                <span className={"badge " + op.status}>
                  {jobLabels[op.status] || op.status}
                </span>
              </strong>
              {op.status === "running" && (
                <button
                  className="icon-button"
                  title={uiText("取消操作")}
                  onClick={() =>
                    void act("cancel-op", () =>
                      api("/operations/" + op.id + "/cancel", "POST"),
                    )
                  }
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <p className={op.status === "failed" ? "error-text" : ""}>
              {op.message}
            </p>
            {op.status === "running" && (
              <progress value={op.progress} max={100} />
            )}{" "}
            {op.result?.path && (
              <a className="button small" href={fileUrl(op.result.path, true)}>
                <Download size={15} />{uiText("下载")}{op.kind === "export" ? uiText("成片") : uiText("备份")}
              </a>
            )}
          </div>
        ))}
    </div>
  );
}
