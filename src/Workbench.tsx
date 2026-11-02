import {formatPrompt,visualDescription} from '../server/prompt-template.mjs';
import ExportPanel from './ExportPanel';
import {t as uiText} from './i18n';
import WorkflowButton from './WorkflowButton';
import ImportContent from './ImportContent';
import CameraPicker from './CameraPicker';
import { useEffect, useState, useRef } from "react";
import {
  GripVertical,
  LoaderCircle,
  Save,
  Sparkles,
  Play,
  Plus,
  Lock,
  Unlock,
  Trash2,
  Film,
  Images,
  ArrowUpRight,
  Download,
  Clapperboard,
  Check,
  ShieldCheck,
} from "lucide-react";
import type { Project, Job, Status, Operation, Shot,Preparation } from "./types";
import { api, fileUrl } from "./api";
import { Empty, Busy, jobLabels, type Act } from "./components";

interface Props {
  project: Project;
  jobs: Job[];
  status: Status | null;
  operations: Operation[];
  dirty: boolean;
  busy: string;
  act: Act;
  onChange: (p: Project) => void;
  onSave: () => Promise<Project | undefined>;
  onNew: () => void;
  onRename:(project:Project)=>void;
  onNavigate: (p: string) => void;
  preparation:Preparation|null;
  onPrepare:()=>Promise<Preparation|null>;
}
export default function Workbench({
  project,
  jobs,
  status,
  operations,
  dirty,
  busy,
  act,
  onChange,
  onSave,
  onNew,
  onRename,
  onNavigate,
  preparation,
  onPrepare,
}: Props) {
  const [draggedShot,setDraggedShot]=useState<string|null>(null),[dropTarget,setDropTarget]=useState<{id:string;after:boolean}|null>(null);
  const monitorRef=useRef<HTMLDivElement>(null);
  const [tailSource,setTailSource]=useState('auto'),[queuedTask,setQueuedTask]=useState<Job|null>(null);
  const sceneListRef=useRef<HTMLDivElement>(null),sceneCountRef=useRef(project.plan?.scenes.length||0);
  useEffect(()=>{const count=project.plan?.scenes.length||0;if(count>sceneCountRef.current&&sceneListRef.current)sceneListRef.current.scrollTop=sceneListRef.current.scrollHeight;sceneCountRef.current=count;},[project.plan?.scenes.length]);
  const [selected, updateSelected] = useState(""),
    [tab, setTab] = useState("script"),
    [mode, setMode] = useState("auto"),
    [continuity, setContinuity] = useState(false),
    [partial, setPartial] = useState(false),
    [check, setCheck] = useState<string | null>(null);
  const setSelected=(id:string)=>{updateSelected(id);try{localStorage.setItem('nana-shot:'+project.id,id);}catch{}};
  useEffect(() => {
    let saved='';try{saved=localStorage.getItem('nana-shot:'+project.id)||'';}catch{}
    updateSelected(project.plan?.shots.some(s=>s.id===saved)?saved:project.plan?.shots[0]?.id||'');
    setCheck(null);
    setMode("auto");
    setContinuity(false);
    setQueuedTask(null);
  }, [project.id]);
  const shots = project.plan?.shots || [],
    shot = shots.find((s) => s.id === selected) || shots[0];
  const output = jobs
    .filter(
      (j) =>
        j.projectId === project.id &&
        j.shotId === shot?.id &&
        j.status === "succeeded",
    )
    .at(-1);
  useEffect(()=>setTailSource('auto'),[project.id,shot?.id]);
  const completedTails=Array.from(new Map(jobs.filter(j=>j.projectId===project.id&&j.status==='succeeded').map(j=>[j.shotId,j])).values());
  const observedTask=jobs.filter(j=>j.projectId===project.id&&j.shotId===shot?.id).at(-1),task=queuedTask&&queuedTask.shotId===shot?.id&&!jobs.some(j=>j.id===queuedTask.id)?queuedTask:observedTask;
  const taskPending=!!task&&!['succeeded','failed','interrupted','cancelled'].includes(task.status);
  const planning = operations.find(
    (o) => o.kind === "planning" && o.status === "running",
  );
  const needsImages=(s:Shot)=>mode!=='text'&&(mode!=='auto'||s.assetIds.length>0);
  const missingFor=(s:Shot)=>needsImages(s)?s.assetIds.filter(id=>!project.assets.some(a=>a.assetId===id)):[];
  const missingReferences=Array.from(new Set(shots.flatMap(missingFor)));
  const shotMissingReferences=!!shot&&(missingFor(shot).length>0||(needsImages(shot)&&!shot.assetIds.length));
  const canGenerate=!!visualDescription(shot?.prompt)&&!busy&&!!preparation?.videoReady&&!shotMissingReferences&&!(mode==='first-frame'&&continuity);
  const noSelectedImages=shots.some(s=>needsImages(s)&&!s.assetIds.length);
  const assetName=(id:string)=>project.plan?.assets.find(a=>a.id===id)?.name||id;
  const editShot = (patch: Partial<Shot>) => {
    if (!project.plan || !shot) return;
    onChange({
      ...project,
      plan: {
        ...project.plan,
        shots: shots.map((s) => (s.id === shot.id ? { ...s, ...patch } : s)),
      },
    });
  };
  const enqueue = async (all: boolean) => {
    const check=await onPrepare();if(!check?.videoReady)throw new Error(uiText("视频生成准备尚未完成，请点击顶栏状态图标，在设置中补齐服务、节点或模型。"));
    const p = dirty ? await onSave() : project;
    if (!p) return;
    const accepted=await api<Job[]>("/projects/" + p.id + "/jobs", "POST", {
      shotIds: all ? p.plan?.shots.map((s) => s.id) : [shot?.id],
      key: crypto.randomUUID(),
      mode,
      continuity,
      tailSource:continuity?(all?'auto':tailSource):undefined,
    });
    if(all)onNavigate('queue');else{setQueuedTask(accepted[0]||null);requestAnimationFrame(()=>monitorRef.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));}
  };
  const moveShot=(id:string,targetId:string,after=false)=>{if(!project.plan||id===targetId||busy)return;const source=shots.find(s=>s.id===id);if(!source)return;const ordered=shots.filter(s=>s.id!==id),index=ordered.findIndex(s=>s.id===targetId);if(index<0)return;ordered.splice(index+(after?1:0),0,source);onChange({...project,plan:{...project.plan,shots:ordered}});};
  const addShot = () => {
    const id = "shot-" + Date.now();
    onChange({
      ...project,
      plan: {
        summary: project.plan?.summary || uiText("手动分镜"),
        assets: project.plan?.assets || [],
        scenes: project.plan?.scenes.length
          ? project.plan.scenes
          : [{ id: "scene-1", title: uiText("场景 1"), description: uiText("手动场景") }],
        shots: [
          ...shots,
          {
            id,
            sceneId: project.plan?.scenes[0]?.id || "scene-1",
            title: uiText("新镜头"),
            prompt: formatPrompt(""),
            soundMode: "native",
            duration: 5,
            camera: "固定镜头",
            assetIds: [],
            locked: false,
          },
        ],
      },
    });
    setSelected(id);
  };
  return (
    <>
      <div className="workbench-heading">
        <div>
          <div className="eyebrow">DIRECTOR'S WORKSPACE</div>
          <h1>
            {project.name}
            <span className="badge">
              {dirty ? uiText("有未保存修改") : uiText("已保存到本地")}
            </span>
          </h1>
        </div>
        <div className="button-row">
          <button className="button" disabled={!!busy} onClick={()=>onRename(project)}>{uiText("重命名项目")}</button>
          <button
            className="button"
            onClick={() => void act("save", onSave, uiText("剧本已保存"))}
            disabled={!!busy}
          >
            <Save size={15} />{uiText("保存剧本")}</button>
          <button
            className="button primary"
            disabled={!shots.length || !!busy || !preparation?.videoReady || (missingReferences.length>0||noSelectedImages)||(mode==='first-frame'&&continuity)}
            onClick={() => void act("generate-all", () => enqueue(true))}
          >
            <Play size={15} />{uiText("生成全部镜头")}</button>
        </div>
      </div>
      {(missingReferences.length>0||noSelectedImages)&&<div className="subtle-banner"><Images size={18}/><span>{uiText("参考图还未准备好：")}{missingReferences.map(assetName).join("、") || uiText("请先为镜头勾选引用资产")}{uiText("。勾选资产不会自动创建图片，请在素材库上传角色定妆照或场景图。")}</span><button className="button small" onClick={()=>onNavigate('assets')}>{uiText("去素材库上传参考图")}<ArrowUpRight size={14}/></button></div>}
      <div className="workflow-steps">
        {[uiText("剧本与规划"), uiText("资产与分镜"), uiText("生成与审片"), uiText("成片导出")].map((s, i) => (
          <div
            key={s}
            className={
              (i === 0 && !shots.length) || (i === 1 && shots.length)
                ? "current"
                : ""
            }
          >
            <span>
              {i === 0 && shots.length ? (
                <Check size={12} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            {s}
            {i < 3 && <i />}
          </div>
        ))}
      </div>
      <div className="studio-grid">
        <section className="panel script-panel">
          <div className="tabs">
            <button
              className={tab === "script" ? "active" : ""}
              onClick={() => setTab("script")}
            >{uiText("剧本")}</button>
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >{uiText("项目设定")}</button>
            <ImportContent only="script" project={project} onChange={onChange} onSave={onSave} act={act} busy={busy}/>
            <span className="quiet">{project.script.length}{uiText("字")}</span>
          </div>
          {tab === "script" ? (
            <>
              <textarea
                className="script-editor"
                aria-label={uiText("剧本正文")}
                placeholder={
                  uiText("写下你的故事…\n\n场景、人物、动作、对白。\n本地导演会将它们转化成镜头。")
                }
                value={project.script}
                onChange={(e) =>
                  onChange({ ...project, script: e.target.value })
                }
              />
              <div className="script-actions">
                <span>
                  <span className="dot lime" />{uiText("仅使用本地模型")}</span>
                <button
                  className="button primary full"
                  disabled={!project.script.trim() || !!busy || !!planning || !preparation?.planningReady}
                  onClick={() =>
                    void act("plan", async () => {
                      const check=await onPrepare();if(!check?.planningReady)throw new Error(uiText("本地导演尚未准备好，请先按顶部清单启动服务并下载所选模型。"));
                      const p = dirty ? await onSave() : project;
                      if (p) await api("/projects/" + p.id + "/plan", "POST");
                    })
                  }
                >
                  {planning || busy === "plan" ? (
                    <Busy>{uiText("本地导演规划中")}</Busy>
                  ) : (
                    <>
                      <Sparkles size={17} />{uiText("分析剧本 · 生成分镜")}</>
                  )}
                </button>
                {planning && <p>{planning.message}</p>}
                {!status?.ollama.online && (
                  <button
                    className="text-button"
                    onClick={() => onNavigate("settings")}
                  >{uiText("先连接本地导演引擎")}<ArrowUpRight size={13} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="form-stack">
              <label>{uiText("视觉风格")}<textarea aria-label={uiText("视觉风格")}
                  rows={4}
                  value={project.style}
                  onChange={(e) =>
                    onChange({ ...project, style: e.target.value })
                  }
                />
              </label>
              <label>{uiText("画面比例")}<select aria-label={uiText("画面比例")}
                  value={project.aspectRatio}
                  onChange={(e) =>
                    onChange({ ...project, aspectRatio: e.target.value })
                  }
                >
                  <option value="16:9">{uiText("16:9 · 横屏电影")}</option>
                  <option value="9:16">{uiText("9:16 · 竖屏短片")}</option>
                  <option value="1:1">{uiText("1:1 · 方形画面")}</option>
                  <option value="4:3">{uiText('4:3 · 横屏')}</option><option value="3:4">{uiText('3:4 · 竖屏')}</option><option value="3:2">{uiText('3:2 · 横屏')}</option><option value="2:3">{uiText('2:3 · 竖屏')}</option><option value="21:9">{uiText('21:9 · 超宽屏')}</option>
                </select>
              </label>
              <label>{uiText("生成分辨率")}<select aria-label={uiText("生成分辨率")}
                  value={project.megapixels}
                  onChange={(e) =>
                    onChange({ ...project, megapixels: Number(e.target.value) })
                  }
                >
                  <option value={0.42}>{uiText("0.42 MP · 预览")}</option>
                  <option value={0.5}>{uiText("0.5 MP · 首次测试推荐")}</option>
                  <option value={0.7}>{uiText("0.7 MP · 高质量")}</option>
                  <option value={0.9}>0.9 MP</option><option value={1}>{uiText("1.0 MP · 高资源设备")}</option><option value={1.1}>1.1 MP</option>
                </select>
              </label>
              <p className="footnote">{uiText("首次建议使用 5 秒、0.5 MP。高分辨率是否可用取决于工作流和设备。")}</p>
              <label>{uiText('采样器')}<select aria-label={uiText('采样器')} value={project.sampler||'dual_clock_euler'} onChange={e=>onChange({...project,sampler:e.target.value})}><option value="dual_clock_euler">dual_clock_euler · {uiText('默认')}</option>{['euler','euler_ancestral','heun','dpmpp_2m','dpmpp_2m_sde'].map(name=><option key={name} value={name}>{name}</option>)}</select></label>
              <div className="form-row"><label>{uiText('采样步数')}<input aria-label={uiText('采样步数')} type="number" min={1} max={1000} step={1} value={project.steps??4} onChange={e=>onChange({...project,steps:Number(e.target.value)})}/></label><label>{uiText('输出帧率')}<select aria-label={uiText('输出帧率')} value={project.fps??24} onChange={e=>onChange({...project,fps:Number(e.target.value)})}>{[12,15,24,25,30,48,50,60].map(fps=><option key={fps} value={fps}>{fps} fps</option>)}</select></label></div>
              <p className="footnote">{uiText('默认 4 步、24 fps。H3 原生按 24 fps 生成，其他输出帧率通过本机转换保持时长与声音同步，不增加模型生成的运动细节。')}</p>
              {project.plan && (
                <fieldset>
                  <legend>{uiText("场景管理")}</legend>
                  <div ref={sceneListRef} className="scene-list" role="region" aria-label={uiText("场景列表")} tabIndex={0}>
                  {project.plan.scenes.map((scene) => (
                    <div className="scene-edit" key={scene.id}>
                      <label>{uiText("场景名称")}<input
                          value={scene.title}
                          onChange={(e) =>
                            onChange({
                              ...project,
                              plan: {
                                ...project.plan!,
                                scenes: project.plan!.scenes.map((s) =>
                                  s.id === scene.id
                                    ? { ...s, title: e.target.value }
                                    : s,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                      <label>{uiText("场景描述")}<textarea
                          rows={2}
                          value={scene.description}
                          onChange={(e) =>
                            onChange({
                              ...project,
                              plan: {
                                ...project.plan!,
                                scenes: project.plan!.scenes.map((s) =>
                                  s.id === scene.id
                                    ? { ...s, description: e.target.value }
                                    : s,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                      <button
                        className="text-button"
                        disabled={
                          project.plan!.scenes.length <= 1 ||
                          shots.some((s) => s.sceneId === scene.id)
                        }
                        onClick={() =>
                          onChange({
                            ...project,
                            plan: {
                              ...project.plan!,
                              scenes: project.plan!.scenes.filter(
                                (s) => s.id !== scene.id,
                              ),
                            },
                          })
                        }
                      >
                        <Trash2 size={12} />{uiText("删除未引用场景")}</button>
                    </div>
                  ))}</div>
                  <button
                    className="button small"
                    onClick={() =>
                      onChange({
                        ...project,
                        plan: {
                          ...project.plan!,
                          scenes: [
                            ...project.plan!.scenes,
                            {
                              id: "scene-" + Date.now(),
                              title: uiText("新场景"),
                              description: "",
                            },
                          ],
                        },
                      })
                    }
                  >
                    <Plus size={13} />{uiText("添加场景")}</button>
                </fieldset>
              )}
              <button className="button" onClick={onNew}>
                <Plus size={15} />{uiText("新建其他项目")}</button>
            </div>
          )}
        </section>
        <section className="panel shot-panel">
          <div className="panel-heading">
            <h3>{uiText("分镜序列")}<span className="count">{shots.length}</span>
            </h3>
            <ImportContent only="storyboard" project={project} onChange={onChange} onSave={onSave} act={act} busy={busy}/>
            <button
              className="icon-button"
              aria-label={uiText("添加手动镜头")}
              onClick={addShot}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="shot-list" role="group" aria-label={uiText('分镜列表')} onDragOver={e=>{if(!draggedShot)return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();if(e.clientY<rect.top+25)e.currentTarget.scrollTop-=24;else if(e.clientY>rect.bottom-25)e.currentTarget.scrollTop+=24;}} onDrop={e=>{if(!draggedShot)return;e.preventDefault();if(shots.length)moveShot(draggedShot,shots[shots.length-1].id,true);setDraggedShot(null);setDropTarget(null);}}>
            {shots.length ? (
              shots.map((s, i) => (
                <button
                  className={
                    "shot-item " + (shot?.id === s.id ? "selected" : "")+(draggedShot===s.id?" dragging":"")+(dropTarget?.id===s.id?(dropTarget.after?" drop-after":" drop-before"):"")
                  }
                  key={s.id}
                  draggable={!busy}
                  title={uiText('拖动排序；Alt+上下方向键移动镜头')}
                  onDragStart={e=>{if(busy){e.preventDefault();return;}setDraggedShot(s.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-nana-shot',s.id);}}
                  onDragOver={e=>{if(!draggedShot||draggedShot===s.id)return;e.preventDefault();e.dataTransfer.dropEffect='move';const rect=e.currentTarget.getBoundingClientRect(),after=e.clientY>rect.top+rect.height/2;setDropTarget(old=>old?.id===s.id&&old.after===after?old:{id:s.id,after});}}
                  onDrop={e=>{if(!draggedShot)return;e.preventDefault();e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();moveShot(draggedShot,s.id,e.clientY>rect.top+rect.height/2);setDraggedShot(null);setDropTarget(null);}}
                  onDragEnd={()=>{setDraggedShot(null);setDropTarget(null);}}
                  onKeyDown={e=>{if(!e.altKey)return;if(e.key==='ArrowUp'&&i>0){e.preventDefault();moveShot(s.id,shots[i-1].id);}else if(e.key==='ArrowDown'&&i<shots.length-1){e.preventDefault();moveShot(s.id,shots[i+1].id,true);}}}
                  onClick={() => setSelected(s.id)}
                >
                  <GripVertical size={13} className="shot-grip" aria-hidden="true"/>
                  <div className="shot-thumb">
                    <Clapperboard size={20} strokeWidth={1} />
                    <span>{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <div>
                    <strong>{s.title}</strong>
                    <p>
                      {s.camera} · {s.duration}s
                    </p>
                  </div>
                  {s.locked && <Lock size={12} />}
                </button>
              ))
            ) : (
              <Empty
                icon={<Clapperboard size={25} />}
                title={uiText("等待第一个镜头")}
                detail={uiText("让本地导演分析剧本，或手动添加分镜。")}
              />
            )}
          </div>
          <div className="shot-list-footer">
            <span>{project.plan?.scenes.length || 0}{uiText("个场景")}</span>
            <span>{uiText("共")}{shots.reduce((sum, s) => sum + s.duration, 0)}{uiText("秒")}</span>
          </div>
        </section>
        <section className="preview-column">
          <div className="panel preview-panel" ref={monitorRef}>
            <div className="panel-heading monitor-heading">
              <h3>{uiText("审片监视器")}</h3>
              <div className="monitor-project-info mini-label" role="group" aria-label={uiText('项目生成参数')}><span>{project.aspectRatio} / H3</span><span>{project.megapixels} MP</span><span>{project.sampler||'dual_clock_euler'}</span><span>{uiText('{0} 步',[project.steps??4])}</span><span>{project.fps??24} fps</span><span>{uiText('{0} 个场景',[project.plan?.scenes.length||0])}</span><span className="monitor-style" title={project.style}>{uiText('风格：')}{project.style}</span></div>
            </div>
            <div className="video-preview">
              {output?.output ? (
                <video
                  controls
                  key={output.output}
                  src={fileUrl(output.output)}
                />
              ) : (
                <div>
                  <div className="preview-crosshair" />
                  <Film size={36} strokeWidth={1} />
                  <p>{uiText("画面即将发生")}</p>
                  <span>{uiText("生成完成后，在这里预览真实视频")}</span>
                </div>
              )}
            </div>
            <div className="preview-meta">
              <span>
                <span className="dot lime" />
                {taskPending?<><LoaderCircle className="spin" size={14}/>{jobLabels[task!.status]||task!.status}</>:output ? uiText("已归档到本地") : uiText("等待生成")}
              </span>
              {output?.output && (
                <a href={fileUrl(output.output, true)}>
                  <Download size={14} />{uiText("下载片段")}</a>
              )}
            </div>
          </div>
          {task&&<div className="monitor-task-feedback" role="status">{uiText('镜头任务：')}{jobLabels[task.status]||task.status}{task.error?' · '+uiText(task.error):task.message?' · '+uiText(task.message):''}</div>}
          {shot && (
            <section className="panel shot-detail">
              <div className="panel-heading">
                <h3>{uiText("镜头设定")}</h3>
                <div className="button-row"><button className="button primary small generate-shot-button" disabled={!canGenerate} onClick={()=>void act('generate',()=>enqueue(false))}><Play size={14}/>{uiText('生成此镜头')}</button>
                  <button
                    className={
                      "icon-button " + (shot.locked ? "lime-text" : "")
                    }
                    title={
                      shot.locked ? uiText("解锁镜头") : uiText("锁定镜头，重新规划时保留")
                    }
                    onClick={() => editShot({ locked: !shot.locked })}
                  >
                    {shot.locked ? <Lock size={15} /> : <Unlock size={15} />}
                  </button>
                  <button
                    className="icon-button"
                    title={uiText("删除镜头")}
                    onClick={() => {
                      if (window.confirm(uiText("删除这个镜头？")))
                        onChange({
                          ...project,
                          plan: {
                            ...project.plan!,
                            shots: shots.filter((s) => s.id !== shot.id),
                          },
                        });
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="form-stack">
                <label>{uiText("镜头标题")}<input
                    value={shot.title}
                    onChange={(e) => editShot({ title: e.target.value })}
                  />
                </label>
                <div className="form-row">
                  <label>{uiText("时长 / 秒")}<input
                      type="number"
                      min={2}
                      max={15}
                      value={shot.duration}
                      onChange={(e) =>
                        editShot({ duration: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>{uiText("种子")}<input
                      type="number"
                      min={0}
                      value={shot.seed ?? 123456789}
                      onChange={(e) =>
                        editShot({ seed: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <label>{uiText("场景")}<select
                    value={shot.sceneId}
                    onChange={(e) => editShot({ sceneId: e.target.value })}
                  >
                    {project.plan?.scenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>{uiText('声音输出')}<select aria-label={uiText('声音输出')} value={shot.soundMode||'native'} onChange={e=>editShot({soundMode:e.target.value as 'silent'|'native'})}><option value="silent">{uiText('无声输出')}</option><option value="native">{uiText('H3 原生声音（默认）')}</option></select></label>
                {shot.soundMode!=='silent'?<><label>{uiText('声音描述')}<textarea aria-label={uiText('声音描述')} rows={3} maxLength={2000} value={shot.soundPrompt||''} onChange={e=>editShot({soundPrompt:e.target.value})} placeholder={uiText('例如：只有风声和脚步声，无对白；或指定普通话对白及台词。')}/></label><p className="footnote">{uiText('原生声音由视频模型生成，描述可引导语言和内容，但不保证准确；这不是独立配音功能。')}</p></>:<p className="footnote">{uiText('无声输出不写入模型音轨，避免出现未设置的人声。已生成的视频不会被修改。')}</p>}
                <CameraPicker value={shot.camera} onChange={camera=>editShot({camera})}/>
                <label>{uiText("生成提示词")}<textarea aria-label={uiText("生成提示词")}
                    rows={5}
                    value={shot.prompt}
                    onChange={(e) => editShot({ prompt: e.target.value })}
                  />
                </label>
                {!!project.plan?.assets.length && (
                  <fieldset>
                    <legend>{uiText("引用资产 · 勾选需要保持一致的主体")}</legend>
                    {project.plan.assets.map((a) => (
                      <label className="checkbox-label" key={a.id}>
                        <input
                          type="checkbox"
                          checked={shot.assetIds.includes(a.id)}
                          onChange={(e) =>
                            editShot({
                              assetIds: e.target.checked
                                ? [...shot.assetIds, a.id]
                                : shot.assetIds.filter((id) => id !== a.id),
                            })
                          }
                        />
                        {a.name} · {project.assets.some(image=>image.assetId===a.id)?uiText("已绑定参考图"):uiText("未上传图片")}
                      </label>
                    ))}
                  </fieldset>
                )}
                <div className="form-row">
                  <label>{uiText("生成方式")}<select
                      aria-label={uiText("生成方式")}
                      value={mode}
                      onChange={(e) => {setMode(e.target.value);if(e.target.value==='first-frame')setContinuity(false);}}
                    >
                      <option value="auto">{uiText("自动选择（推荐，引用资产时使用参考图）")}</option>
                      <option value="reference">{uiText("参考图模式 · 保持角色与外观")}</option>
                      <option value="first-frame">{uiText("首帧图生视频 · 从指定画面开始")}</option>
                      <option value="text">{uiText("文生视频 · 不使用图片")}</option>
                    </select>
                  </label>
                </div>
                <div className="subtle-banner" role="status"><span>{mode==='text'?uiText("文生视频不会使用引用资产的图片，人物外观可能改变。要保持人物一致，请使用自动选择或参考图模式。"):mode==='first-frame'?uiText("按上方资产列表从上到下，第一项已勾选资产的图片作为首帧，其余图片作为参考；适合已有完整构图的画面。"):mode==='auto'?uiText("自动选择：当前镜头有引用资产时使用图片参考；没有引用资产时使用文生视频。不会在缺图时自动退回文生视频。"):uiText("参考图用于保持主体身份与外观，不强制将图片作为视频第一帧。")}</span></div>
                {shot.assetIds.length>0&&<div className="reference-preview">{project.plan?.assets.filter(a=>shot.assetIds.includes(a.id)).map(a=>{const image=project.assets.find(i=>i.assetId===a.id);return <div key={a.id}>{image?<img src={fileUrl(image.path)} alt={a.name+uiText("参考图")}/>:<Images size={24}/>}<span>{a.name} · {image?uiText("图片已绑定"):uiText("缺少图片")}</span></div>;})}</div>}
                {shotMissingReferences&&<p className="footnote" role="status">{uiText("此镜头不能生成：")}{missingFor(shot).map(assetName).join('、')||uiText("未选择引用资产")}{uiText("尚未准备参考图。请点击页面上方“去素材库上传参考图”。")}</p>}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    disabled={mode==='first-frame'}
                    checked={continuity}
                    onChange={(e) => setContinuity(e.target.checked)}
                  />{uiText("可选镜头尾帧")}</label>
                {continuity&&<><label>{uiText('尾帧来源')}<select aria-label={uiText('尾帧来源')} value={tailSource} disabled={!!busy||mode==='first-frame'} onChange={e=>setTailSource(e.target.value)}><option value="auto">{uiText('自动：最近的上一镜头')}</option>{completedTails.map(j=><option key={j.id} value={j.id}>{j.shot.title} · {uiText('已完成')}</option>)}</select></label><p className="footnote">{uiText('默认选取最近已完成的前序镜头；可手动选择当前项目的其他已完成镜头。尾帧作为首帧，资产参考图仍按生成方式处理。')}</p></>}
                <p className="footnote">{uiText("文生视频无需参考图，但人物一致性可能较弱。")}</p>
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() =>
                      void act("preflight", async () => {
                        if (dirty) await onSave();
                        const r = await api<{
                          ready: boolean;
                          errors: string[];
                        }>("/projects/" + project.id + "/preflight", "POST");
                        setCheck(
                          r.ready
                            ? uiText("模型和节点检查通过。真实生成仍需测试。")
                            : r.errors.join("\n"),
                        );
                      })
                    }
                  >
                    <ShieldCheck size={15} />{uiText("资源预检")}</button>
                  <button
                    className="button primary generate-shot-button"
                    disabled={!canGenerate}
                    onClick={() => void act("generate", () => enqueue(false))}
                  >
                    <Play size={15} />{uiText("生成此镜头")}</button>
                  <WorkflowButton filename={shot.id} load={()=>api('/projects/'+project.id+'/workflow-preview','POST',{plan:project.plan,shotId:shot.id,aspectRatio:project.aspectRatio,megapixels:project.megapixels,sampler:project.sampler,steps:project.steps,fps:project.fps,mode,continuity,tailSource})}/>
                </div>
                {check && <pre className="check-result">{check}</pre>}
              </div>
            </section>
          )}
        </section>
      </div>
      <div className="panel export-bar">
        <div>
          <h3>{uiText("把镜头，变成作品。")}</h3>
          <p>{uiText("规范化画幅、帧率与音轨，在本地拼接导出 MP4。")}</p>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={partial}
            onChange={(e) => setPartial(e.target.checked)}
          />{uiText("仅导出已完成镜头")}</label>
        <button
          className="button"
          onClick={() =>
            void act("backup", async () => {
              if (dirty) await onSave();
              await api("/projects/" + project.id + "/backup", "POST");
              onNavigate("queue");
            })
          }
          disabled={!!busy||!preparation?.backupReady}
        >{uiText("备份项目")}</button>
        <ExportPanel project={project} operations={operations} busy={busy} act={act} partial={partial} onSave={onSave} dirty={dirty} disabled={!jobs.some(j=>j.projectId===project.id&&j.status==='succeeded'&&project.plan?.shots.some(s=>s.id===j.shotId))||!preparation?.exportReady}/>
      </div>
    </>
  );
}
