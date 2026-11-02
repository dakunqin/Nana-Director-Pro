import {formatPrompt} from '../server/prompt-template.mjs';
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.mjs";
import { Media } from "../server/media.mjs";
test("operation history returns the most recent completion last regardless of UUID ordering", async (t) => {
  const { app, request } = await fixture(t);
  app.store.put("operations", "zz-old", {
    id: "zz-old",
    updatedAt: "2020-01-01T00:00:00Z",
  });
  app.store.put("operations", "aa-new", {
    id: "aa-new",
    updatedAt: "2026-10-31T00:00:00Z",
  });
  assert.equal((await request("/api/v1/operations")).data.at(-1).id, "aa-new");
});
async function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "nana-api-"));
  const app = await createApp({
    root,
    port: 0,
    token: "test-session",
    recover: false,
  });
  t.after(() => app.close());
  const request = async (
    route,
    method = "GET",
    body,
    token = "test-session",
    extra = {},
  ) => {
    const r = await fetch(app.url + route, {
      method,
      headers: {
        authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  return { app, request, root };
}
test("writes require session auth and cross-site session reads are blocked", async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (await request("/api/v1/projects", "POST", { name: "x" }, "wrong")).status,
    401,
  );
  assert.equal(
    (
      await request("/api/v1/session", "GET", null, "", {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
});
test("project API creates, persists edits and rejects stale versions", async (t) => {
  const { request } = await fixture(t);
  const created = await request("/api/v1/projects", "POST", { name: "影片" });
  assert.equal(created.status, 201);
  const id = created.data.id;
  const saved = await request("/api/v1/projects/" + id, "PATCH", {
    version: 1,
    script: "一只猫看向窗外",
  });
  assert.equal(saved.data.version, 2);
  assert.equal(
    (
      await request("/api/v1/projects/" + id, "PATCH", {
        version: 1,
        script: "过期编辑",
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/api/v1/projects/" + id)).data.script,
    "一只猫看向窗外",
  );
});
test("agent is off by default, uses a distinct secret and enforces scopes", async (t) => {
  const { app, request } = await fixture(t);
  assert.equal((await request("/api/v1/agent/capabilities")).status, 403);
  app.store.saveSettings({
    agentEnabled: true,
    agentToken: "agent-secret",
    agentScopes: ["read"],
  });
  assert.equal((await request("/api/v1/agent/capabilities")).status, 401);
  assert.equal(
    (await request("/api/v1/agent/capabilities", "GET", null, "agent-secret"))
      .status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/v1/agent/projects",
        "POST",
        { name: "denied" },
        "agent-secret",
      )
    ).status,
    403,
  );
});
test("file route rejects paths escaping data root", async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request("/api/v1/file?path=..%2Fsecret")).status, 403);
});
test("artifact paths cannot normalize out of projects into the credentials database", async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (await request("/api/v1/file?path=projects%2F..%2Fstudio.sqlite")).status,
    403,
  );
});
test("export refuses missing clips instead of claiming a finished video", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "nana-media-"));
  const media = new Media(root);
  await assert.rejects(
    media.export({ id: "p", plan: { shots: [{ id: "s" }] } }, []),
    /没有可导出|缺少/,
  );
});

test('readiness reports offline resources and blocks new planning and video jobs', async (t) => {
  const {request} = await fixture(t);
  await request('/api/v1/settings','PATCH',{ollamaUrl:'http://127.0.0.1:1',comfyUrl:'http://127.0.0.1:1'});
  const state = await request('/api/v1/readiness?refresh=1');
  assert.equal(state.status,200);
  assert.equal(state.data.planningReady,false);
  assert.equal(state.data.videoReady,false);
  const project = (await request('/api/v1/projects','POST',{name:'准备检查',script:'猫走过街道'})).data;
  assert.equal((await request(`/api/v1/projects/${project.id}/plan`,'POST',{})).status,409);
  assert.equal((await request(`/api/v1/projects/${project.id}/jobs`,'POST',{shotIds:['missing'],key:'blocked'})).status,409);
  assert.equal((await request('/api/v1/jobs')).data.length,0);
});

test('import preview is read-only and imported storyboard can be saved with normal version checks',async t=>{const {request}=await fixture(t);const p=(await request('/api/v1/projects','POST',{name:'导入测试'})).data;const preview=await request(`/api/v1/projects/${p.id}/import-preview`,'POST',{kind:'storyboard',format:'csv',text:'prompt,duration\nA cat,5',version:p.version});assert.equal(preview.status,200);assert.equal((await request('/api/v1/projects/'+p.id)).data.plan,null);const saved=await request('/api/v1/projects/'+p.id,'PATCH',{version:p.version,plan:preview.data.plan});assert.equal(saved.status,200);assert.equal(saved.data.plan.shots[0].prompt,formatPrompt('A cat'));assert.equal((await request(`/api/v1/projects/${p.id}/import-preview`,'POST',{kind:'script',format:'text',text:'new',version:p.version})).status,409);});

test('job workflow endpoint returns saved graph or snapshot preview without submitting anything',async t=>{const {app,request}=await fixture(t);app.store.put('jobs','workflow-test',{id:'workflow-test',projectId:'snapshot-only',shot:{id:'s',prompt:'Original snapshot',duration:5,assetIds:[]},projectSettings:{aspectRatio:'16:9'},mode:'text',status:'queued'});const preview=await request('/api/v1/jobs/workflow-test/workflow');assert.equal(preview.status,200);assert.equal(preview.data.actual,false);assert.equal(preview.data.workflow['36'].inputs.prompt,formatPrompt('Original snapshot'));const job=app.store.get('jobs','workflow-test');app.store.put('jobs',job.id,{...job,workflow:{node:{class_type:'SavedNode',inputs:{}}}});const actual=await request('/api/v1/jobs/workflow-test/workflow');assert.equal(actual.data.actual,true);assert.equal(actual.data.workflow.node.class_type,'SavedNode');assert.equal((await request('/api/v1/jobs/unknown/workflow')).status,404);});

test('current shot workflow preview is read-only and honors unsaved sound settings',async t=>{const {app,request}=await fixture(t);const project=app.store.createProject({name:'preview'}),plan={summary:'test',assets:[],scenes:[{id:'scene',title:'s',description:''}],shots:[{id:'shot',sceneId:'scene',title:'test',prompt:'A cat',camera:'固定',duration:5,assetIds:[],soundMode:'native',soundPrompt:'No dialogue, rainfall'}]};const body={plan,shotId:'shot',aspectRatio:'16:9',megapixels:.5,mode:'text',continuity:false};const result=await request('/api/v1/projects/'+project.id+'/workflow-preview','POST',body);assert.equal(result.status,200);assert.equal(result.data.actual,false);assert.deepEqual(result.data.workflow['12'].inputs.audio,['11',1]);assert.equal(app.store.getProject(project.id).plan,null);assert.equal(app.queue.list().length,0);plan.shots[0].soundMode='silent';const silent=await request('/api/v1/projects/'+project.id+'/workflow-preview','POST',body);assert.equal(silent.data.workflow['12'].inputs.audio,undefined);plan.shots[0].soundMode='wrong';assert.equal((await request('/api/v1/projects/'+project.id+'/workflow-preview','POST',body)).status,400);});

test('project job endpoint forwards selected tail take into the accepted task snapshot',async t=>{const {Readiness}=await import('../server/readiness.mjs');const original=Readiness.prototype.check;Readiness.prototype.check=async()=>({videoReady:true});t.after(()=>Readiness.prototype.check=original);const {app,request}=await fixture(t);app.queue.run=async()=>{};const p=app.store.createProject({name:'selected-source'}),shot={id:'s',sceneId:'scene',title:'shot',prompt:'cat',camera:'固定',duration:5,assetIds:[]};app.store.updateProject(p.id,{plan:{summary:'cat',assets:[],scenes:[{id:'scene',title:'s',description:''}],shots:[shot]}},p.version);app.store.put('jobs','source-take',{id:'source-take',projectId:p.id,shotId:'old',shot:{...shot,id:'old'},status:'succeeded'});const response=await request('/api/v1/projects/'+p.id+'/jobs','POST',{shotIds:['s'],key:'selected-endpoint',mode:'text',continuity:true,tailSource:'source-take'});assert.equal(response.status,202);assert.equal(response.data[0].continuitySourceJobId,'source-take');assert.equal(response.data[0].continuitySourceSelected,true);});

test('export operation exposes project identity and processing progress before completion',async t=>{const original=Media.prototype.export;Media.prototype.export=async function(project,jobs,{onProgress}){onProgress({progress:45,message:'正在处理镜头 1 / 1'});await new Promise(r=>setTimeout(r,60));return {path:'projects/'+project.id+'/film.mp4',clips:1};};t.after(()=>Media.prototype.export=original);const {app,request}=await fixture(t);const project=app.store.createProject({name:'export-progress'}),response=await request('/api/v1/projects/'+project.id+'/export','POST',{partial:false});assert.equal(response.status,202);const progress=(await request('/api/v1/operations')).data.find(o=>o.id===response.data.id);assert.equal(progress.projectId,project.id);assert.equal(progress.progress,45);await new Promise(r=>setTimeout(r,100));const completed=(await request('/api/v1/operations')).data.find(o=>o.id===response.data.id);assert.equal(completed.status,'completed');assert.equal(completed.result.clips,1);});

test('film downloads use current project name including UTF-8 for old film.mp4 outputs',async t=>{const {app,root}=await fixture(t);const {mkdirSync,writeFileSync}=await import('node:fs');const p=app.store.createProject({name:'我的中文电影'}),relative='projects/'+p.id+'/outputs/export-test/film.mp4';mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});writeFileSync(path.join(root,relative),'video');const response=await fetch(app.url+'/api/v1/file?path='+encodeURIComponent(relative)+'&download=1');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/filename\*=UTF-8''/);assert.ok(response.headers.get('content-disposition').includes(encodeURIComponent('我的中文电影.mp4')));assert.equal(await response.text(),'video');});

test('example project endpoint reuses the sample, including earlier versions, and survives rename',async t=>{const {app,request}=await fixture(t);const old=app.store.createProject({name:'窗边的相遇 · 示例剧本',script:'旧版示例'});const first=await request('/api/v1/projects/example','POST',{name:'示例',script:'新内容'});assert.equal(first.status,200);assert.equal(first.data.id,old.id);const changed=app.store.updateProject(old.id,{name:'我的修改'},old.version);const again=await request('/api/v1/projects/example','POST',{name:'示例',script:'新内容'});assert.equal(again.data.id,old.id);assert.equal(again.data.name,changed.name);assert.equal(again.data.script,'旧版示例');assert.equal(app.store.listProjects().length,1);});

test('sample reuse removes only untouched duplicate copies and preserves edited projects',async t=>{const {app,request}=await fixture(t);const input={name:'窗边的相遇 · 示例剧本',script:'原始示例'};const one=app.store.createProject(input),duplicate=app.store.createProject(input),edited=app.store.createProject({...input,script:'修改过的剧本'});const result=await request('/api/v1/projects/example','POST',input);assert.equal(result.status,200);assert.ok([one.id,duplicate.id].includes(result.data.id));assert.equal(app.store.listProjects().length,2);assert.ok(app.store.getProject(edited.id));});
