import {videoSettings} from './video-settings.mjs';
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { AppError, safePath } from "./security.mjs";
import { Comfy } from "./comfy.mjs";
import { Ollama } from "./ollama.mjs";
import { buildWorkflow } from "./workflow.mjs";

export class Queue {
  constructor(store, root, { clientFactory, unload, media } = {}) {
    this.store = store;
    this.root = root;
    this.media = media;
    this.running = false;
    this.paused = true;
    this.timer = null;
    this.closed = false;
    this.clientFactory =
      clientFactory ||
      ((job) => {
        const s = store.settings();
        return new Comfy(
          job?.comfyUrl || s.comfyUrl,
          job?.allowLan ?? s.allowLan,
        );
      });
    this.unload =
      unload ||
      (async () => {
        const s = store.settings();
        const o = new Ollama(s.ollamaUrl);
        const status = await o.status();
        if (
          status.online &&
          status.models.some((model) => model.name === s.model)
        )
          await o.unload(s.model);
      });
  }
  list() {
    return this.store
      .list("jobs")
      .sort(
        (a, b) =>
          (a.queueOrder ?? 0) - (b.queueOrder ?? 0) ||
          (a.createdAt || "").localeCompare(b.createdAt || ""),
      );
  }
  previousShotId(job){
    if(Object.hasOwn(job,'continuityPreviousShotId'))return job.continuityPreviousShotId;
    const shots=this.store.getProject(job.projectId).plan?.shots||[],index=shots.findIndex(s=>s.id===job.shotId),previous=shots[index-1];
    return previous?.sceneId===job.shot.sceneId?previous.id:null;
  }
  async continuityFrame(job){
    const previousId=this.previousShotId(job);if(!previousId)return null;
    const candidates=this.list().filter(j=>j.id!==job.id&&j.projectId===job.projectId&&j.shotId===previousId&&(job.continuityAnyScene||j.shot?.sceneId===job.shot.sceneId));
    const sameBatch=candidates.filter(j=>j.requestKey===job.requestKey).at(-1),source=job.continuitySourceSelected?this.store.get('jobs',job.continuitySourceJobId):sameBatch||candidates.filter(j=>j.status==='succeeded').at(-1);
    if(job.continuitySourceSelected&&(!source||source.projectId!==job.projectId||source.status!=='succeeded'))throw new AppError('所选来源镜头已不可用，请重新选择');
    if(!source||source.status!=='succeeded')throw new AppError('上一镜头尚未成功完成，无法衔接尾帧；请先生成紧邻的同场景上一镜头');
    let tail=null;
    if(source.tail){try{const file=safePath(this.root,path.isAbsolute(source.tail)?path.relative(this.root,source.tail):source.tail);if(existsSync(file))tail=file;}catch{}}
    if(!tail){if(!source.output||!this.media?.tail)throw new AppError('上一镜头尾帧缺失，且无法重新提取');const video=safePath(this.root,source.output);if(!existsSync(video))throw new AppError('上一镜头视频文件缺失，无法提取尾帧');try{tail=await this.media.tail(video);}catch(e){throw new AppError('上一镜头尾帧提取失败：'+e.message);}if(!tail||!existsSync(tail))throw new AppError('上一镜头未生成有效尾帧');this.save(source,{tail});}
    return {tail,source};
  }
  workflow(id){const job=this.store.get('jobs',id);if(!job)throw new AppError('任务不存在',404);if(job.workflow)return {actual:true,workflow:job.workflow};
 const referenceJobs=['reference','first-frame'].includes(job.mode)?job.shot.assetIds:[];
 const refs=referenceJobs.map(aid=>'pending-upload-'+aid+'.png'),labels=referenceJobs.map(aid=>{const a=job.assetDefinitions?.find(a=>a.id===aid);return a?a.name+'：'+a.description:aid;});
 const hasTail=job.continuity&&!!this.previousShotId(job);if(hasTail){refs.unshift('pending-previous-tail.png');labels.unshift('上一镜头尾帧，保持同场景衔接');}return {actual:false,workflow:buildWorkflow(job.shot,{id:job.id,...job.projectSettings},refs,hasTail||job.mode==='first-frame',labels)};
 }
  save(job, patch) {
    const now=new Date().toISOString();
    if(patch.status==='preflight'&&!job.startedAt)patch={...patch,startedAt:now};
    if(['succeeded','failed','cancelled','interrupted'].includes(patch.status)&&!job.completedAt)patch={...patch,completedAt:patch.completedAt||now};
    return this.store.put("jobs", job.id, {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }
  enqueue(projectId, shotIds, key, mode = "auto", continuity = false, tailSource) {
    if(typeof continuity!=='boolean')throw new AppError('尾帧衔接设置无效');
    if (!key || key.length > 120) throw new AppError("请提供有效幂等键");
    const previous = this.store.get("requests", `queue:${projectId}:${key}`);
    if (previous) return previous.map((id) => this.store.get("jobs", id));
    if (!["auto", "text", "reference", "first-frame"].includes(mode))
      throw new AppError("生成模式无效");
    const project = this.store.getProject(projectId);
    if (!project.plan) throw new AppError("请先完成分镜规划");
    if (
      !Array.isArray(shotIds) ||
      !shotIds.length ||
      shotIds.length > 500 ||
      new Set(shotIds).size !== shotIds.length
    )
      throw new AppError("镜头选择无效");
    const nextOrder = Math.max(0, ...this.list().map((j) => j.queueOrder || 0));
    let selectedSource=null;
    if(tailSource!==undefined&&typeof tailSource!=='string')throw new AppError('来源镜头设置无效');
    if(continuity&&tailSource&&tailSource!=='auto'){selectedSource=this.store.get('jobs',tailSource);if(!selectedSource||selectedSource.projectId!==projectId||selectedSource.status!=='succeeded')throw new AppError('来源镜头不存在、尚未完成或不属于当前项目');}
    const connection = this.store.settings();
    const jobs = shotIds.map((id, index) => {
      const shot = project.plan.shots.find((s) => s.id === id);
      if (!shot) throw new AppError("镜头不存在");
      const resolvedMode = mode === 'auto' ? (shot.assetIds.length ? 'reference' : 'text') : mode;
      if (resolvedMode !== 'text') {
        if (!shot.assetIds.length) throw new AppError('请先勾选至少一个引用资产，并在素材库上传图片');
        for (const aid of shot.assetIds) {
          const asset = project.assets.find(a=>a.assetId===aid);
          if (!asset || !existsSync(safePath(this.root, asset.path))) throw new AppError('请先上传参考图：'+(project.plan.assets.find(a=>a.id===aid)?.name||aid));
        }
        if (shot.assetIds.length > 9) throw new AppError('一个镜头最多使用 9 张图片');
      }
      if (resolvedMode === 'first-frame' && continuity) throw new AppError('指定首帧和上一镜头尾帧衔接不能同时使用，请选择一种');
      const shotIndex=project.plan.shots.findIndex(s=>s.id===id),previous=project.plan.shots[shotIndex-1];let previousId=previous?.sceneId===shot.sceneId?previous.id:null;
      if(tailSource==='auto'){const earlier=project.plan.shots.slice(0,shotIndex).reverse();previousId=earlier.find(s=>shotIds.includes(s.id)||this.list().some(j=>j.projectId===projectId&&j.shotId===s.id&&j.status==='succeeded'))?.id||earlier[0]?.id||null;}
      if(selectedSource)previousId=selectedSource.shotId;
      if(continuity&&previousId&&resolvedMode!=='text'&&shot.assetIds.length>8)throw new AppError('尾帧衔接时最多使用 8 张资产参考图');
      return {
        continuityPreviousShotId: previousId,
        continuitySourceSelected: !!selectedSource,
        continuitySourceJobId: selectedSource?.id,
        continuityAnyScene: tailSource!==undefined,
        id: randomUUID(),
        projectId,
        shotId: id,
        shot: {...structuredClone(shot), assetIds: project.plan.assets.filter(a=>shot.assetIds.includes(a.id)).map(a=>a.id)},
        projectVersion: project.version,
        projectSettings: videoSettings(project),
        assets: structuredClone(project.assets),
        mode: resolvedMode,
        assetDefinitions: structuredClone(project.plan.assets),
        continuity,
        status: "queued",
        createdAt: new Date().toISOString(),
        progress: 0,
        requestKey: key,
        queueOrder: nextOrder + index + 1,
        comfyUrl: connection.comfyUrl,
        allowLan: connection.allowLan,
      };
    });
    for (const j of jobs) this.store.put("jobs", j.id, j);
    this.store.put(
      "requests",
      `queue:${projectId}:${key}`,
      jobs.map((j) => j.id),
    );
    return jobs;
  }
  cancel(id) {
    const job = this.store.get("jobs", id);
    if (!job) throw new AppError("任务不存在", 404);
    if (["queued", "preflight"].includes(job.status))
      return this.save(job, { status: "cancelled" });
    if (["submitted", "running", "collecting"].includes(job.status))
      return this.save(job, {
        cancelRequested: true,
        message: "已提交任务将继续归档；未中断共享 ComfyUI。",
      });
    return job;
  }
  stop() {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.schedule();
  }
  close() {
    this.closed = true;
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  schedule() {
    if (this.closed || this.timer) return;
    const accepted = this.list().some((j) =>
      ["submitted", "running", "collecting"].includes(j.status),
    );
    if (this.paused && !accepted) return;
    if (!accepted && !this.list().some((j) => j.status === "queued")) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run(false).catch(() => {});
    }, 2500);
    this.timer.unref?.();
  }
  async recover() {
    for (const job of this.list()) {
      if (job.status === "preflight") this.save(job, { status: "queued" });
      else if (job.status === "submitting")
        this.save(job, {
          status: "interrupted",
          error:
            "提交期间应用退出，结果是否被接收未知。请检查 ComfyUI 后再决定重试。",
        });
      else if (["submitted", "running", "collecting"].includes(job.status)) {
        try {
          await this.collect(job);
        } catch (e) {
          this.save(job, { message: `恢复等待：${e.message}` });
        }
      }
    }
    this.schedule();
  }
  async collect(job) {
    const client = this.clientFactory(job);
    const history = await client.history(job.promptId);
    if (!history) {
      if (client.pending && !(await client.pending(job.promptId))) {
        this.save(job, {
          status: "interrupted",
          error: "ComfyUI 历史与队列均无此任务，请检查后手动重试",
        });
        return;
      }
      return;
    }
    if (history.status?.status_str === "error") {
      this.save(job, {
        status: "failed",
        error: JSON.stringify(
          history.status.messages || "ComfyUI 生成失败",
        ).slice(0, 1000),
      });
      return;
    }
    if (!history.status?.completed) return;
    const output = Object.values(history.outputs || {})
      .flatMap((o) => [...(o.gifs || []), ...(o.videos || [])])
      .find((o) => /\.mp4$/i.test(o.filename) && o.type === "output");
    if (!output) {
      this.save(job, {
        status: "failed",
        error: "任务完成但未产生 MP4，请检查 VHS 与 FFmpeg",
      });
      return;
    }
    this.save(job, { status: "collecting" });
    const rel = `projects/${job.projectId}/outputs/${job.id}.mp4`,
      dest = safePath(this.root, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, await client.download(output));
    const fps=job.projectSettings?.fps||24;
    if(fps!==24){if(!this.media?.convertFrameRate)throw new AppError('缺少本机帧率转换工具');this.save(job,{status:'collecting',message:'正在转换输出帧率：'+fps+' fps'});await this.media.convertFrameRate(dest,fps);}
    let tail = null;
    if (this.media) {
      try {
        tail = await this.media.tail(dest);
      } catch (e) {
        this.save(job, { message: `关系帧提取失败：${e.message}` });
      }
    }
    const latest = this.store.get("jobs", job.id);
    this.save(latest, {
      status: "succeeded",
      output: rel,
      message: "视频已生成并归档",
      tail,
      progress: 100,
      completedAt: new Date().toISOString(),
    });
  }
  async run(resume = true) {
    if (this.closed) return;
    if (resume) this.paused = false;
    if (this.running) return;
    this.running = true;
    try {
      if (
        this.store
          .list("operations")
          .some((o) => o.kind === "planning" && o.status === "running")
      )
        return;
      const active = this.list().find((j) =>
        ["submitted", "running", "collecting"].includes(j.status),
      );
      if (active) {
        try {
          await this.collect(active);
        } catch (e) {
          this.save(this.store.get("jobs", active.id), { message: e.message });
        }
        return;
      }
      if (this.paused) return;
      let job = this.list().find((j) => j.status === "queued");
      if (!job) return;
      try {
        job = this.save(job, { status: "preflight" });
        await this.unload();
        const client = this.clientFactory(job);
        const project = this.store.getProject(job.projectId);
        const references = [], referenceLabels = [];
        let firstAsFrame = false;
        if(job.continuity){
          const frame=await this.continuityFrame(job);
          if(frame){const upload=await client.upload(frame.tail);references.push((upload.subfolder?upload.subfolder+'/':'')+upload.name);referenceLabels.push('尾帧来源：'+frame.source.shot.title);firstAsFrame=true;job=this.save(job,{continuityApplied:true,continuitySourceJobId:frame.source.id,continuityMessage:job.continuitySourceSelected?'已接入所选镜头尾帧作为首帧':'已接入最近前序镜头尾帧作为首帧'});}
          else job=this.save(job,{continuityApplied:false,continuityMessage:'当前为场景首镜头，无需衔接上一镜头'});
        }
        if (["reference", "first-frame"].includes(job.mode))
          for (const id of job.shot.assetIds) {
            const asset = job.assets.find((a) => a.assetId === id);
            if (!asset) throw new AppError("缺少镜头参考图");
            const upload = await client.upload(safePath(this.root, asset.path));
            const definition = job.assetDefinitions?.find(a=>a.id===id);
            referenceLabels.push(definition ? `${definition.name}：${definition.description}` : id);
            references.push(
              (upload.subfolder ? upload.subfolder + "/" : "") + upload.name,
            );
          }
        if (job.mode === "first-frame") firstAsFrame = true;
        const graph = buildWorkflow(
          job.shot,
          { ...project, ...videoSettings(job.projectSettings), id: job.id },
          references,
          firstAsFrame,
          referenceLabels,
        );
        job=this.save(job,{workflow:graph});
        const check = await client.preflight(graph);
        if (!check.ready) throw new AppError(check.errors.join("\n"), 422);
        if (this.store.get("jobs", job.id).status === "cancelled") return;
        const graphPath = safePath(
          this.root,
          `projects/${job.projectId}/outputs/${job.id}.workflow.json`,
        );
        writeFileSync(graphPath, JSON.stringify(graph, null, 2));
        job = this.save(job, {
          status: "submitting",
          workflow: graph,
          comfyUrl: job.comfyUrl,
        });
        let submitted;
        try {
          submitted = await client.submit(graph, job.id);
        } catch (e) {
          this.save(job, {
            status: "interrupted",
            error: `提交结果未知，请先检查 ComfyUI：${e.message}`,
          });
          return;
        }
        job = this.save(job, {
          status: "running",
          promptId: submitted.prompt_id,
          startedAt: job.startedAt || new Date().toISOString(),
        });
        await this.collect(job);
      } catch (e) {
        const current = this.store.get("jobs", job.id);
        if (
          current.promptId &&
          ["submitted", "running", "collecting"].includes(current.status)
        )
          this.save(current, {
            message: `已接收任务，等待恢复归档：${e.message}`,
          });
        else if (current.status !== "cancelled")
          this.save(current, { status: "failed", error: e.message });
      }
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}
