import {videoSettings} from './video-settings.mjs';
import {previewImport} from './imports.mjs';
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  createReadStream,
  existsSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { Store } from "./store.mjs";
import {
  AppError,
  safePath,
  localServiceUrl,
  checkRequest,
  readJson,
} from "./security.mjs";
import { Ollama, DIRECTOR_MODELS } from "./ollama.mjs";
import { planProject, validatePlan } from "./planner.mjs";
import { DownloadManager } from "./downloads.mjs";
import { Environment, catalog, startManagedOnLaunch } from "./environment.mjs";
import { Queue } from "./queue.mjs";
import { Comfy } from "./comfy.mjs";
import { buildWorkflow } from "./workflow.mjs";
import { Media, exportFilename } from "./media.mjs";
import {ModelLibrary} from './model-library.mjs';
import {AssetStudio} from './asset-studio.mjs';
import {ResourceMonitor} from './monitor.mjs';
import {Readiness} from './readiness.mjs';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".json": "application/json",
  ".zip": "application/zip",
  ".ico": "image/x-icon",
};
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
function serveFile(req, res, file, download = false, downloadName) {
  if (!existsSync(file) || !statSync(file).isFile())
    throw new AppError("文件不存在", 404);
  const size = statSync(file).size,
    headers = {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      ...(download
        ? {
            "Content-Disposition":
              'attachment; filename="' +
              (downloadName||path.basename(file)).replace(/[^\w.-]/g, "_") +
              '"; filename*=UTF-8\'\''+encodeURIComponent(downloadName||path.basename(file)).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()),
          }
        : {}),
    };
  if (req.headers.range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if (!m) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    const start = Number(m[1]),
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || end < start) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": end - start + 1,
    });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, "Content-Length": size });
    createReadStream(file).pipe(res);
  }
}
export async function createApp({
  root = path.join(appRoot, "data"),
  port = 8797,
  token = randomBytes(32).toString("hex"),
  recover = true,
} = {}) {
  const store = new Store(root),
    downloads = new DownloadManager(store, root),
    environment = new Environment(store, root, downloads),
    media = new Media(root),
    queue = new Queue(store, root, { media });
  const readiness=new Readiness(store,root,environment);
  const assetStudio=new AssetStudio(store,root);
  const modelLibrary=new ModelLibrary(store,root);
  const controllers = new Map(),
    tasks = new Set();
  const monitor = new ResourceMonitor();
  let hardwareCache = null,
    statusCache = null,
    url = "";
  for (const op of store.list("operations"))
    if (op.status === "running")
      store.put("operations", op.id, {
        ...op,
        status: "interrupted",
        message: "应用已重启，可重新执行此操作",
      });
  function background(promise) {
    tasks.add(promise);
    promise.catch(() => {}).finally(() => tasks.delete(promise));
  }
  function operation(kind, fn, metadata={}) {
    const id = randomUUID();
    const update = (patch) =>
      store.put("operations", id, {
        ...store.get("operations", id),
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    update({ id, kind, ...metadata, status: "running", message: "准备中", progress: 0 });
    const controller = new AbortController();
    controllers.set(id, controller);
    background(
      (async () => {
        try {
          const result = await fn(update, controller.signal);
          update({
            status: "completed",
            progress: 100,
            result,
            message: "已完成",
          });
        } catch (e) {
          update({
            status: controller.signal.aborted ? "cancelled" : "failed",
            message: e.message,
          });
        } finally {
          controllers.delete(id);
        }
      })(),
    );
    return { id, status: "running" };
  }
  async function requirePreparation(kind) {
    if(assetStudio.busy())throw new AppError('素材图片正在生成，请完成后再规划或生成视频',409);
    const result = await readiness.check(true);
    if (!result[kind]) throw new AppError('准备尚未完成，请点击顶栏状态图标，到设置查看所需操作', 409);
  }
  async function planning(project) {
    await requirePreparation('planningReady');
    if (
      store
        .list("operations")
        .some((o) => o.kind === "planning" && o.status === "running") ||
      queue
        .list()
        .some((j) =>
          [
            "preflight",
            "submitting",
            "running",
            "collecting",
            "submitted",
          ].includes(j.status),
        )
    )
      throw new AppError("请等待正在进行的规划或生成任务完成", 409);
    return operation("planning", async (update, signal) => {
      const settings = store.settings();
      const comfy = new Comfy(settings.comfyUrl, settings.allowLan);
      if ((await comfy.status()).online) await comfy.free();
      const plan = await planProject(project, settings, {
        signal,
        onProgress: (p) =>
          update({ ...p, progress: Math.round((p.current / p.total) * 90) }),
      });
      return store.updateProject(project.id, { plan }, project.version);
    });
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    try {
      const parsed = new URL(req.url, url || "http://127.0.0.1"),
        route = parsed.pathname,
        method = req.method;
      const agent = route.startsWith("/api/v1/agent/"),
        settings = store.settings();
      checkRequest(req, agent ? settings.agentToken : token, url);
      if (agent) {
        if (!settings.agentEnabled)
          throw new AppError("Agent 接口尚未启用", 403);
        const supplied = Buffer.from(
            (req.headers.authorization || "").replace(/^Bearer /, ""),
          ),
          expected = Buffer.from(settings.agentToken || "");
        if (
          !expected.length ||
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        )
          throw new AppError("Agent 令牌无效", 401);
        if (method !== "GET" && !settings.agentScopes.includes("write"))
          throw new AppError("Agent 未获写入权限", 403);
        if (method === "GET" && !settings.agentScopes.includes("read"))
          throw new AppError("Agent 未获读取权限", 403);
        const base = route.replace("/api/v1/agent", "");
        if (base === "/capabilities" && method === "GET")
          return json(res, 200, {
            version: "v1",
            stages: ["script", "planning", "review", "execution", "export"],
            scopes: settings.agentScopes,
            openapi: "/api/v1/openapi",
          });
        if (base === "/projects" && method === "GET")
          return json(res, 200, store.listProjects());
        if (base === "/jobs" && method === "GET")
          return json(res, 200, queue.list());
        if (base === "/projects" && method === "POST") {
          const b = await readJson(req);
          if (!req.headers["idempotency-key"])
            throw new AppError("请提供 Idempotency-Key");
          const key = "agent-project:" + req.headers["idempotency-key"];
          const prior = store.get("requests", key);
          if (prior) return json(res, 200, store.getProject(prior));
          const p = store.createProject(b);
          store.put("requests", key, p.id);
          return json(res, 201, p);
        }
        const match = /^\/projects\/([\w-]+)(?:\/(plan|jobs))?$/.exec(base);
        if (match) {
          const p = store.getProject(match[1]);
          if (method === "GET") return json(res, 200, p);
          const b = await readJson(req);
          if (b.version !== p.version)
            throw new AppError("项目版本已变化", 409);
          if (method === "PATCH" && !match[2]) {
            if (b.plan) b.plan = validatePlan(b.plan,{allowAssetDraft:true});
            delete b.assets;
            return json(res, 200, store.updateProject(p.id, b, b.version));
          }
          if (method === "POST" && match[2] === "plan")
            return json(res, 202, await planning(p));
          if (method === "POST" && match[2] === "jobs") {
            await requirePreparation('videoReady');
          const jobs = queue.enqueue(
              p.id,
              b.shotIds,
              req.headers["idempotency-key"],
              b.mode || "auto",
              !!b.continuity,
            b.tailSource,
            );
            background(queue.run());
            return json(res, 202, jobs);
          }
        }
        const cancel = /^\/jobs\/([\w-]+)\/cancel$/.exec(base);
        if (cancel && method === "POST")
          return json(res, 200, queue.cancel(cancel[1]));
        throw new AppError("Agent 路由不存在", 404);
      }
      if (route === "/api/v1/session" && method === "GET")
        return json(res, 200, { token, version: "0.1.11" });
      if (route === "/api/v1/health")
        return json(res, 200, { online: true, service: "nana-director-pro" });
      if (route === '/api/v1/resources' && method === 'GET') return json(res,200,await monitor.read());
      if (route === "/api/v1/hardware") {
        if (!hardwareCache) hardwareCache = await environment.hardware();
        return json(res, 200, { ...hardwareCache, dataRoot: root });
      }
      if (route === "/api/v1/status") {
        if (parsed.searchParams.get("refresh")==="1" || !statusCache || Date.now() - statusCache.at > 2500)
          statusCache = { at: Date.now(), data: await environment.status() };
        return json(res, 200, statusCache.data);
      }
      if(route==='/api/v1/readiness'&&method==='GET')return json(res,200,await readiness.check(parsed.searchParams.get('refresh')==='1'));
      if(route==='/api/v1/ui-preferences'&&method==='GET')return json(res,200,{language:settings.uiLanguage||'system'});
      if(route==='/api/v1/ui-preferences'&&method==='POST'){const body=await readJson(req);if(!['system','zh-CN','zh-TW','en','ja','ko','es'].includes(body.language))throw new AppError('语言选项无效');store.saveSettings({uiLanguage:body.language});return json(res,200,{language:body.language});}
      const importRoute=/^\/api\/v1\/projects\/([\w-]+)\/import-preview$/.exec(route);
      if(importRoute&&method==='POST'){const body=await readJson(req,5*1024*1024),project=store.getProject(importRoute[1]);if(body.version!==project.version)throw new AppError('项目已更新，请重新打开项目后导入',409);if(body.contextAssets!==undefined&&!Array.isArray(body.contextAssets))throw new AppError('素材信息无效');const context={...project,plan:project.plan||body.contextAssets?{...(project.plan||{}),assets:body.contextAssets||project.plan?.assets||[],shots:project.plan?.shots||[]}:null};return json(res,200,previewImport(body,context));}
      const draftDelete=/^\/api\/v1\/projects\/([\w-]+)\/asset-generations\/([\w-]+)$/.exec(route);
      if(draftDelete&&method==='DELETE')return json(res,200,assetStudio.deleteDraft(draftDelete[1],draftDelete[2]));
      const assetDelete=/^\/api\/v1\/projects\/([\w-]+)\/assets\/([\w-]+)$/.exec(route);
      if(assetDelete&&method==='DELETE'){if(queue.list().some(j=>!['succeeded','failed','cancelled','interrupted'].includes(j.status)))throw new AppError('视频任务仍在使用素材，请完成后再删除',409);return json(res,200,assetStudio.deleteAsset(assetDelete[1],assetDelete[2],(await readJson(req)).version));}
      const referenceRoute=/^\/api\/v1\/projects\/([\w-]+)\/asset-reference$/.exec(route);
      if(referenceRoute&&method==='POST')return json(res,200,assetStudio.uploadReference(referenceRoute[1],(await readJson(req,30*1024*1024)).base64));
      if(route==='/api/v1/asset-studio'&&method==='GET')return json(res,200,await assetStudio.status());
      const assetRoute=/^\/api\/v1\/projects\/([\w-]+)\/asset-generations(?:\/([\w-]+)\/adopt)?$/.exec(route);
      if(assetRoute){
        store.getProject(assetRoute[1]);
        if(method==='GET'&&!assetRoute[2])return json(res,200,assetStudio.list(assetRoute[1]));
        if(method==='POST'&&assetRoute[2])return json(res,200,assetStudio.adopt(assetRoute[1],assetRoute[2],await readJson(req)));
        if(method==='POST'){
          if(queue.list().some(j=>!['succeeded','failed','cancelled','interrupted'].includes(j.status))||store.list('operations').some(o=>o.status==='running'&&['planning','installation'].includes(o.kind)))throw new AppError('请等待当前视频、规划或环境安装任务完成，再生成素材',409);
          const job=await assetStudio.start(assetRoute[1],await readJson(req));background(assetStudio.run());return json(res,202,job);
        }
      }
      if (route === "/api/v1/settings" && method === "GET") {
        const { agentToken, ...safe } = settings;
        return json(res, 200, { ...safe, agentTokenConfigured: !!agentToken });
      }
      if (route === "/api/v1/settings" && method === "PATCH") {
        if(assetStudio.busy())throw new AppError("素材生成期间请勿修改服务设置",409);
        const body = await readJson(req),
          allowed = [
            "comfyUrl",
            "ollamaUrl",
            "model",
            "allowLan",
            "managedComfy",
            "managedOllama",
            "gpuIndex",
            "lowVram",
            "directorDevice",
            "agentEnabled",
            "agentScopes",
            "firstRun",
          ];
        const b = Object.fromEntries(
          Object.entries(body).filter(([k]) => allowed.includes(k)),
        );
        if (
          b.directorDevice !== undefined &&
          !["auto", "cpu"].includes(b.directorDevice)
        )
          throw new AppError("导演计算设备无效");
        for (const k of [
          "allowLan",
          "managedComfy",
          "managedOllama",
          "lowVram",
          "agentEnabled",
          "firstRun",
        ])
          if (b[k] !== undefined && typeof b[k] !== "boolean")
            throw new AppError("设置类型无效");
        if (
          b.gpuIndex !== undefined &&
          (!Number.isInteger(b.gpuIndex) || b.gpuIndex < 0 || b.gpuIndex > 15)
        )
          throw new AppError("显卡编号无效");
        if (
          b.agentScopes &&
          (!Array.isArray(b.agentScopes) ||
            b.agentScopes.some((s) => !["read", "write"].includes(s)))
        )
          throw new AppError("Agent 权限无效");
        localServiceUrl(
          b.comfyUrl || settings.comfyUrl,
          b.allowLan ?? settings.allowLan,
        );
        localServiceUrl(b.ollamaUrl || settings.ollamaUrl);
        new Ollama(b.ollamaUrl || settings.ollamaUrl).assertLocal(
          b.model || settings.model,
        );
        if (
          queue
            .list()
            .some((j) =>
              [
                "preflight",
                "submitting",
                "running",
                "submitted",
                "collecting",
              ].includes(j.status),
            )
        )
          throw new AppError("生成期间请勿修改服务设置", 409);
        const { agentToken, ...result } = store.saveSettings(b);
        statusCache = null;
        return json(res, 200, {
          ...result,
          agentTokenConfigured: !!agentToken,
        });
      }
      if (route === "/api/v1/settings/agent-token" && method === "POST") {
        const secret = randomBytes(32).toString("hex");
        store.saveSettings({ agentToken: secret });
        return json(res, 200, { token: secret });
      }
      if (route === "/api/v1/projects" && method === "GET")
        return json(res, 200, store.listProjects());
      if (route === "/api/v1/projects" && method === "POST")
        return json(res, 201, store.createProject(await readJson(req)));
      if(route==='/api/v1/projects/example'&&method==='POST')return json(res,200,store.exampleProject(await readJson(req)));
      const match =
        /^\/api\/v1\/projects\/([\w-]+)(?:\/(plan|jobs|assets|export|backup|preflight|workflow-preview))?$/.exec(
          route,
        );
      if (match) {
        const project = store.getProject(match[1]);
        if (!match[2] && method === "GET") return json(res, 200, project);
        if (!match[2] && method === "PATCH") {
          const b = await readJson(req);
          if (b.plan) b.plan = validatePlan(b.plan,{allowAssetDraft:true});
          if (b.assets) delete b.assets;
          return json(res, 200, store.updateProject(project.id, b, b.version));
        }
        if (match[2] === "plan" && method === "POST")
          return json(res, 202, await planning(project));
        if(match[2]==='workflow-preview'&&method==='POST'){
          const b=await readJson(req),plan=validatePlan(b.plan,{allowAssetDraft:true}),shot=plan.shots.find(s=>s.id===b.shotId);
          if(!shot||!['auto','text','reference','first-frame'].includes(b.mode)||!b.aspectRatio)throw new AppError('工作流预览参数无效');
          const mode=b.mode==='auto'?(shot.assetIds.length?'reference':'text'):b.mode,refs=mode==='text'?[]:plan.assets.filter(a=>shot.assetIds.includes(a.id));
          const images=refs.map(a=>'pending-upload-'+a.id+'.png'),labels=refs.map(a=>a.name+'：'+a.description),index=plan.shots.findIndex(s=>s.id===shot.id);let hasTail=b.continuity&&plan.shots[index-1]?.sceneId===shot.sceneId;if(b.continuity&&b.tailSource==='auto')hasTail=index>0;if(b.continuity&&b.tailSource&&b.tailSource!=='auto'){const source=store.get('jobs',b.tailSource);if(!source||source.projectId!==project.id||source.status!=='succeeded')throw new AppError('来源镜头不可用');hasTail=true;}if(hasTail){images.unshift('pending-previous-tail.png');labels.unshift('上一镜头尾帧，保持同场景衔接');}const graph=buildWorkflow(shot,{id:project.id,...videoSettings(b)},images,hasTail||mode==='first-frame',labels);
          return json(res,200,{actual:false,workflow:graph});
        }
        if (match[2] === "preflight" && method === "POST") {
          const graph = buildWorkflow(
            project.plan?.shots[0] || {
              prompt:
                "安装测试：一只橘猫在清晨的街道缓慢走过，自然光，环境声，无对白。",
              duration: 5,
            },
            { ...project, id: "preflight" },
          );
          return json(
            res,
            200,
            await new Comfy(settings.comfyUrl, settings.allowLan).preflight(
              graph,
            ),
          );
        }
        if (match[2] === "jobs" && method === "POST") {
          const b = await readJson(req);
          await requirePreparation('videoReady');
          const jobs = queue.enqueue(
            project.id,
            b.shotIds,
            b.key,
            b.mode || "auto",
            !!b.continuity,
            b.tailSource,
          );
          background(queue.run());
          return json(res, 202, jobs);
        }
        if (match[2] === "assets" && method === "POST") {
          const b = await readJson(req, 30 * 1024 * 1024);
          if (
            typeof b.base64 !== "string" ||
            !project.plan?.assets.some((a) => a.id === b.assetId)
          )
            throw new AppError("资产或图片数据无效");
          const bytes = Buffer.from(b.base64, "base64");
          let extension;
          if (
            bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
            extension = "png";
          else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
            extension = "jpg";
          else if (
            bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          )
            extension = "webp";
          else throw new AppError("仅支持 PNG、JPEG、WebP 图片");
          const rel = `projects/${project.id}/assets/${randomUUID()}.${extension}`;
          writeFileSync(safePath(root, rel), bytes);
          const assets = [
            ...project.assets.filter((a) => a.assetId !== b.assetId),
            { assetId: b.assetId, path: rel },
          ];
          return json(
            res,
            200,
            store.updateProject(project.id, { assets }, project.version),
          );
        }
        if (match[2] === "export" && method === "POST") {
          const b = await readJson(req);
          return json(
            res,
            202,
            operation("export", async (update) =>
              media.export(project, queue.list(), { partial: !!b.partial,onProgress:update }),
              {projectId:project.id},
            ),
          );
        }
        if (match[2] === "backup" && method === "POST") {
          return json(
            res,
            202,
            operation("backup", async () => {
              writeFileSync(
                safePath(root, `projects/${project.id}/jobs.json`),
                JSON.stringify(
                  queue.list().filter((j) => j.projectId === project.id),
                  null,
                  2,
                ),
              );
              return media.backup(project);
            }),
          );
        }
      }
      if (route === "/api/v1/jobs" && method === "GET")
        return json(res, 200, queue.list());
      if (route === "/api/v1/jobs/run" && method === "POST") {
        background(queue.run());
        return json(res, 202, { message: "队列已启动" });
      }
      if (route === "/api/v1/jobs/pause" && method === "POST") {
        queue.stop();
        return json(res, 200, {
          message: "已暂停后续任务；当前 ComfyUI 任务继续完成",
        });
      }
      const taskWorkflow=/^\/api\/v1\/jobs\/([\w-]+)\/workflow$/.exec(route);
      if(taskWorkflow&&method==='GET')return json(res,200,queue.workflow(taskWorkflow[1]));
      const action = /^\/api\/v1\/jobs\/([\w-]+)\/(cancel|retry)$/.exec(route);
      if (action && method === "POST") {
        const job = store.get("jobs", action[1]);
        if (!job) throw new AppError("任务不存在", 404);
        if (action[2] === "cancel") return json(res, 200, queue.cancel(job.id));
        if (!["failed", "interrupted", "cancelled"].includes(job.status))
          throw new AppError("只能重试失败、中断或取消的任务");
        await requirePreparation('videoReady');
          const jobs = queue.enqueue(
          job.projectId,
          [job.shotId],
          randomUUID(),
          job.mode,
          job.continuity,
          job.continuitySourceSelected?job.continuitySourceJobId:job.continuityAnyScene?"auto":undefined,
        );
        background(queue.run());
        return json(res, 202, jobs);
      }
      if (route === "/api/v1/operations" && method === "GET")
        return json(
          res,
          200,
          store
            .list("operations")
            .sort((a, b) =>
              (a.updatedAt || "").localeCompare(b.updatedAt || ""),
            )
            .slice(-40),
        );
      const cancelOp = /^\/api\/v1\/operations\/([\w-]+)\/cancel$/.exec(route);
      if (cancelOp && method === "POST") {
        controllers.get(cancelOp[1])?.abort();
        return json(res, 200, { message: "已请求取消" });
      }
      if(route==='/api/v1/models/custom'&&method==='GET')return json(res,200,modelLibrary.list());
      if(route==='/api/v1/models/import'&&method==='POST')return json(res,201,await modelLibrary.importFile(req,{folder:parsed.searchParams.get('folder'),filename:parsed.searchParams.get('filename'),size:Number(parsed.searchParams.get('size'))}));
      if (route === "/api/v1/catalog")
        return json(res, 200, {
          ...catalog,
          directorModels: DIRECTOR_MODELS,
          downloads: downloads.list(),
        });
      if (route === "/api/v1/models/download" && method === "POST") {
        const b = await readJson(req);
        if (b.acceptLicenses !== true)
          throw new AppError("请先阅读并确认模型许可");
        const ids = b.ids;
        if (!Array.isArray(ids) || ids.length > 20)
          throw new AppError("资源选择无效");
        const resources = ids.map((id) => {
          const r = catalog.resources.find((r) => r.id === id);
          if (!r) throw new AppError("资源不存在");
          return r;
        });
        background(
          (async () => {
            for (const r of resources) await downloads.start(r);
          })(),
        );
        return json(res, 202, { message: "已加入下载队列" });
      }
      const pauseDl = /^\/api\/v1\/downloads\/([\w-]+)\/pause$/.exec(route);
      if (pauseDl && method === "POST") {
        downloads.pause(pauseDl[1]);
        return json(res, 200, { message: "已请求暂停" });
      }
      if (route === "/api/v1/models/pull" && method === "POST") {
        const b = await readJson(req);
        new Ollama(settings.ollamaUrl).assertLocal(b.model);
        return json(
          res,
          202,
          operation("model-pull", async (update, signal) => {
            await new Ollama(settings.ollamaUrl).pull(
              b.model,
              (p) =>
                update({
                  message: p.status,
                  progress: p.total
                    ? Math.floor(((p.completed || 0) / p.total) * 100)
                    : 0,
                }),
              signal,
            );
            return { model: b.model };
          }),
        );
      }
      if (route === "/api/v1/environment/install" && method === "POST") {
        const b = await readJson(req);
        if (b.acceptLicenses !== true)
          throw new AppError("请确认运行环境与节点许可");
        background(environment.install());
        return json(res, 202, { message: "安装已启动" });
      }
      if (route === "/api/v1/environment/start" && method === "POST") {
        statusCache = null;
        return json(res, 200, await environment.start());
      }
      if (route === "/api/v1/environment/stop" && method === "POST") {
        if(assetStudio.busy())throw new AppError("素材生成正在进行，请先等待完成再停止服务",409);
        if (
          queue
            .list()
            .some((j) =>
              [
                "preflight",
                "submitting",
                "running",
                "submitted",
                "collecting",
              ].includes(j.status),
            )
        )
          throw new AppError("请等待当前视频任务完成，再停止服务", 409);
        statusCache = null;
        return json(res, 200, await environment.stop());
      }
      if (route.startsWith("/api/v1/logs/") && method === "GET")
        return json(res, 200, {
          text: environment.log(route.split("/").at(-1)),
        });
      if (route === "/api/v1/file" && method === "GET") {
        const rel = parsed.searchParams.get("path") || "";
        if (!/^(projects|backups)\//.test(rel))
          throw new AppError("文件访问范围无效", 403);
        const [scope, ...segments] = rel.split("/");
        const film=/^projects\/([\w-]+)\/outputs\/export-[\w-]+\/[^/]+\.mp4$/i.exec(rel),filmProject=film?store.get('projects',film[1]):null;
        return serveFile(
          req,
          res,
          safePath(path.join(root, scope), segments.join("/")),
          parsed.searchParams.has("download"),
          filmProject?exportFilename(filmProject.name):undefined,
        );
      }
      if (route === "/api/v1/openapi")
        return serveFile(req, res, path.join(appRoot, "docs", "openapi.json"));
      if (route.startsWith("/api/")) throw new AppError("接口不存在", 404);
      const dist = path.join(appRoot, "dist");
      let file = safePath(
        dist,
        decodeURIComponent(route.slice(1) || "index.html"),
      );
      if (!existsSync(file) && !path.extname(file))
        file = path.join(dist, "index.html");
      return serveFile(req, res, file);
    } catch (e) {
      if (!res.headersSent)
        json(res, e.status || 500, {
          error: e.status ? e.message : `操作失败：${e.message}`,
        });
      else res.end();
    }
  });
  server.requestTimeout = 120000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  url = `http://127.0.0.1:${server.address().port}`;
  if (recover) {
    background(queue.recover());
    background(assetStudio.run());
    background(startManagedOnLaunch(store,environment).catch(error=>store.put('operations','startup',{id:'startup',kind:'startup',status:'failed',message:error.message,progress:0,updatedAt:new Date().toISOString()})));
  }
  const close = async () => {
    queue.close();
    assetStudio.close();
    for (const c of controllers.values()) c.abort();
    for (const d of downloads.list()) downloads.pause(d.id);
    await Promise.allSettled([...tasks]);
    await environment.stop();
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
    store.close();
  };
  return {
    url,
    server,
    store,
    queue,
    environment,
    downloads,
    close,
    hasWork: () =>
      tasks.size > 0 || modelLibrary.active.size>0 || assetStudio.busy() ||
      queue
        .list()
        .some((j) =>
          [
            "preflight",
            "submitting",
            "running",
            "submitted",
            "collecting",
          ].includes(j.status),
        ),
  };
}

