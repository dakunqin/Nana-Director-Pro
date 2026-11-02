import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.mjs";
import { buildWorkflow, preflight } from "../server/workflow.mjs";
import { Queue } from "../server/queue.mjs";
import { setTimeout as delay } from "node:timers/promises";
import {createServer} from 'node:http';
test('manual video generation does not try to unload an uninstalled director model',async t=>{let generates=0;const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/tags'){res.end(JSON.stringify({models:[]}));return;}generates++;res.writeHead(404);res.end(JSON.stringify({error:'model not installed'}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const root=mkdtempSync(path.join(tmpdir(),'nana-unload-')),store=new Store(root);t.after(()=>store.close());store.saveSettings({ollamaUrl:'http://127.0.0.1:'+server.address().port});const queue=new Queue(store,root);t.after(()=>queue.close());await assert.doesNotReject(queue.unload());assert.equal(generates,0);});
const shot = {
  id: "shot1",
  sceneId: "scene1",
  title: "猫",
  prompt: "橘猫缓慢走过街道，清晨，自然光。",
  duration: 5,
  assetIds: [],
  seed: 123,
};
test("base workflow binds five exact models, user seed and reference inputs", () => {
  const graph = buildWorkflow(
    shot,
    { id: "test", aspectRatio: "16:9", megapixels: 0.5 },
    ["cat.png"],
  );
  assert.equal(
    graph["1"].inputs.unet_name,
    "minimax_h3_fl2va_int8_convrot.safetensors",
  );
  assert.equal(graph["9"].inputs.noise_seed, 123);
  assert.equal(graph["6"].inputs.task_type, "Ref2VA");
  assert.equal(graph["41"].inputs.image, "cat.png");
  assert.ok(
    Object.values(graph).some(
      (n) =>
        n.inputs.lora_name ===
        "minimax_h3_fl2v_turbo_4step_v0.1_comfyui_alpha8-T8-convert.safetensors",
    ),
  );
});
test("preflight rejects missing nodes and models before submission", () => {
  const graph = buildWorkflow(shot, {
    id: "test",
    aspectRatio: "16:9",
    megapixels: 0.5,
  });
  const result = preflight(graph, {});
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((s) => s.includes("UNETLoader")));
  const info = Object.fromEntries(
    Object.values(graph).map((n) => [
      n.class_type,
      { input: { required: {} } },
    ]),
  );
  info.UNETLoader.input.required.unet_name = [["other.safetensors"]];
  assert.ok(
    preflight(graph, info).errors.some((s) => s.includes("minimax_h3_fl2va")),
  );
});
function setup(t, client) {
  const root = mkdtempSync(path.join(tmpdir(), "nana-queue-"));
  const store = new Store(root);
  t.after(() => store.close());
  const p = store.createProject({ name: "电影" });
  store.updateProject(
    p.id,
    {
      plan: {
        summary: "猫",
        assets: [],
        scenes: [{ id: "scene1", title: "街道", description: "清晨" }],
        shots: [shot],
      },
    },
    1,
  );
  const queue = new Queue(store, root, {
    clientFactory: () => client,
    unload: async () => {},
    media: { tail: async () => null },
  });
  return { store, queue, p, root };
}
test("enqueue is idempotent and completed media is archived into project", async (t) => {
  const client = {
    preflight: async () => ({ ready: true, errors: [] }),
    submit: async () => ({ prompt_id: "comfy1" }),
    history: async () => ({
      status: { completed: true },
      outputs: {
        12: { gifs: [{ filename: "cat.mp4", subfolder: "", type: "output" }] },
      },
    }),
    download: async () => Buffer.from("video"),
    upload: async () => ({ name: "cat.png" }),
  };
  const { queue, p, root } = setup(t, client);
  const a = queue.enqueue(p.id, ["shot1"], "request1");
  const b = queue.enqueue(p.id, ["shot1"], "request1");
  assert.equal(a[0].id, b[0].id);
  await queue.run();
  const done = queue.list()[0];
  assert.equal(done.status, "succeeded");
  assert.ok(existsSync(path.join(root, done.output)));
  queue.stop();
});
test("recovery never resubmits an accepted prompt", async (t) => {
  let submits = 0;
  const client = {
    submit: async () => {
      submits++;
    },
    history: async () => ({
      status: { completed: true },
      outputs: { 12: { gifs: [{ filename: "saved.mp4", type: "output" }] } },
    }),
    download: async () => Buffer.from("recovered"),
  };
  const { store, queue, p } = setup(t, client);
  store.put("jobs", "old", {
    id: "old",
    projectId: p.id,
    shotId: "shot1",
    shot,
    status: "running",
    promptId: "accepted",
    createdAt: new Date().toISOString(),
  });
  await queue.recover();
  assert.equal(submits, 0);
  assert.equal(queue.list()[0].status, "succeeded");
  queue.stop();
});
test("cancelling an accepted shared job avoids global interruption and still archives output", async (t) => {
  const { store, queue, p } = setup(t, {});
  store.put("jobs", "old", {
    id: "old",
    projectId: p.id,
    shotId: "shot1",
    shot,
    status: "running",
    promptId: "accepted",
  });
  queue.cancel("old");
  assert.equal(store.get("jobs", "old").status, "running");
  assert.equal(store.get("jobs", "old").cancelRequested, true);
  queue.stop();
});
test("transient collection failure preserves accepted prompt instead of enabling regeneration", async (t) => {
  let submits = 0;
  const client = {
    preflight: async () => ({ ready: true, errors: [] }),
    submit: async () => {
      submits++;
      return { prompt_id: "accepted" };
    },
    history: async () => {
      throw new Error("temporary network error");
    },
  };
  const { queue, p } = setup(t, client);
  queue.enqueue(p.id, ["shot1"], "collect-failure");
  await queue.run();
  const job = queue.list()[0];
  assert.equal(job.status, "running");
  assert.equal(job.promptId, "accepted");
  assert.equal(submits, 1);
  queue.stop();
});
test("pause clears timer handle and accepted prompts continue to be monitored", async (t) => {
  const { queue, store, p } = setup(t, {
    history: async () => null,
    pending: async () => true,
  });
  queue.paused = false;
  queue.schedule();
  queue.stop();
  assert.equal(queue.timer, null);
  store.put("jobs", "accepted", {
    id: "accepted",
    projectId: p.id,
    shot,
    status: "running",
    promptId: "comfy",
  });
  queue.stop();
  assert.ok(queue.timer);
  queue.stop();
  clearTimeout(queue.timer);
  queue.timer = null;
});
test("restart schedules monitoring even when the prompt is not completed yet", async (t) => {
  const { queue, store, p } = setup(t, {
    history: async () => null,
    pending: async () => true,
  });
  store.put("jobs", "pending", {
    id: "pending",
    projectId: p.id,
    shot,
    status: "running",
    promptId: "comfy",
  });
  await queue.recover();
  assert.ok(queue.timer);
  clearTimeout(queue.timer);
  queue.timer = null;
});
test("all queued shots retain the requested order even with equal timestamps", (t) => {
  const { queue, store, p } = setup(t, {});
  const project = store.getProject(p.id);
  project.plan.shots = Array.from({ length: 6 }, (_, i) => ({
    ...shot,
    id: "shot" + i,
  }));
  store.updateProject(p.id, { plan: project.plan }, project.version);
  queue.enqueue(
    p.id,
    project.plan.shots.map((s) => s.id),
    "ordered",
  );
  assert.deepEqual(
    queue.list().map((j) => j.shotId),
    ["shot0", "shot1", "shot2", "shot3", "shot4", "shot5"],
  );
  queue.stop();
});
test("recovery collects from the saved ComfyUI endpoint after settings change", async (t) => {
  const { queue, store, p } = setup(t, {});
  let endpoint;
  queue.clientFactory = (job) => {
    endpoint = job.comfyUrl;
    return { history: async () => null, pending: async () => true };
  };
  store.put("jobs", "saved", {
    id: "saved",
    projectId: p.id,
    shot,
    status: "running",
    promptId: "old-prompt",
    comfyUrl: "http://127.0.0.1:8189",
    allowLan: false,
  });
  store.saveSettings({ comfyUrl: "http://127.0.0.1:8190" });
  await queue.recover();
  assert.equal(endpoint, "http://127.0.0.1:8189");
  queue.close();
});

test('automatic mode never falls back to text when selected character has no uploaded image',t=>{
 const {store,p,queue,root}=setup(t,{});
 const project=store.getProject(p.id);store.updateProject(p.id,{plan:{...project.plan,assets:[{id:'cat',name:'橘猫',kind:'character',description:'橘色短毛'}],shots:[{...shot,assetIds:['cat']}]}},project.version);
 assert.throws(()=>queue.enqueue(p.id,['shot1'],'auto-missing','auto'),/橘猫/);
 assert.throws(()=>queue.enqueue(p.id,['shot1'],'reference-empty','reference'),/橘猫/);
 assert.equal(queue.list().length,0);
});
test('reference and first-frame modes cannot silently become text with no selected asset',t=>{
 const {p,queue}=setup(t,{});
 for(const mode of ['reference','first-frame'])assert.throws(()=>queue.enqueue(p.id,['shot1'],mode,mode),/勾选/);
 assert.equal(queue.enqueue(p.id,['shot1'],'auto-empty','auto')[0].mode,'text');
});
test('first frame and hybrid workflows bind picture identities without shifting reference indexes',()=>{
 const project={id:'identity',aspectRatio:'16:9',megapixels:0.5};
 const ref=buildWorkflow(shot,project,['cat.png'],false,['橘猫：橘色短毛']);
 assert.equal(ref['6'].inputs.task_type,'Ref2VA');assert.match(ref['36'].inputs.prompt,/<Picture 1>: 橘猫/);
 const first=buildWorkflow(shot,project,['frame.png'],true,['首帧画面']);assert.equal(first['6'].inputs.task_type,'I2VA');assert.deepEqual(first['6'].inputs.first_frame,['41',0]);
 const hybrid=buildWorkflow(shot,project,['frame.png','cat.png'],true,['首帧画面','橘猫']);assert.equal(hybrid['6'].inputs.task_type,'Hybrid');assert.deepEqual(hybrid['6'].inputs['ref_images.ref_image_0'],['42',0]);assert.match(hybrid['36'].inputs.prompt,/<Picture 1>: 橘猫/);
});

test('automatic asset references upload the chosen image and submit Ref2VA with identity mapping',async t=>{
 let submitted,uploaded;
 const client={upload:async file=>{uploaded=file;return {name:'cat-upload.png'};},preflight:async()=>({ready:true,errors:[]}),submit:async graph=>{submitted=graph;return {prompt_id:'identity-test'};},history:async()=>null,pending:async()=>true};
 const {store,p,queue,root}=setup(t,client);t.after(()=>queue.close());
 const image=`projects/${p.id}/assets/cat.png`;writeFileSync(path.join(root,image),Buffer.from('image fixture'));
 const project=store.getProject(p.id);store.updateProject(p.id,{assets:[{assetId:'cat',path:image}],plan:{...project.plan,assets:[{id:'cat',name:'橘猫',kind:'character',description:'橘色短毛、白色爪子'}],shots:[{...shot,assetIds:['cat']}]}},project.version);
 const [job]=queue.enqueue(p.id,['shot1'],'identity-auto','auto');assert.equal(job.mode,'reference');await queue.run();
 assert.equal(uploaded,path.join(root,image));assert.equal(submitted['6'].inputs.task_type,'Ref2VA');assert.equal(submitted['41'].inputs.image,'cat-upload.png');assert.match(submitted['36'].inputs.prompt,/<Picture 1>: 橘猫：橘色短毛、白色爪子/);
});

test('task timing includes preparation, freezes at terminal state and workflow previews use task snapshots',async t=>{const {queue,p,store}=setup(t,{});const [job]=queue.enqueue(p.id,['shot1'],'timing');const preview=queue.workflow(job.id);assert.equal(preview.actual,false);assert.match(preview.workflow['36'].inputs.prompt,/橘猫/);const started=queue.save(job,{status:'preflight'});assert.ok(started.startedAt);const done=queue.save(started,{status:'failed'});assert.ok(done.completedAt);assert.equal(queue.save(done,{message:'checked'}).completedAt,done.completedAt);const graph={one:{class_type:'Custom',inputs:{}}};queue.save(done,{workflow:graph});assert.deepEqual(queue.workflow(job.id),{actual:true,workflow:graph});assert.throws(()=>queue.workflow('missing'),/不存在/);});

test('native audio is the default and explicit silent output disconnects audio',()=>{const normal=buildWorkflow(shot,{id:'default'});assert.deepEqual(normal['12'].inputs.audio,['11',1]);const silent=buildWorkflow({...shot,soundMode:'silent'},{id:'silent'});assert.equal(silent['12'].inputs.audio,undefined);const native=buildWorkflow({...shot,soundMode:'native',soundPrompt:'Mandarin speech, quiet rain'},{id:'native'});assert.deepEqual(native['12'].inputs.audio,['11',1]);assert.match(native['36'].inputs.prompt,/Mandarin speech, quiet rain/);assert.throws(()=>buildWorkflow({...shot,soundMode:'invalid'},{id:'bad'}),/声音/);});

test('new aspect ratios and sampling options propagate into workflow snapshots',async t=>{const {queue,p,store}=setup(t,{});for(const [aspectRatio,label]of [['4:3','4:3 (Standard)'],['3:4','3:4 (Portrait Standard)'],['3:2','3:2 (Photo)'],['2:3','2:3 (Portrait Photo)'],['21:9','21:9 (Ultrawide)']]){const graph=buildWorkflow(shot,{id:'test',aspectRatio,megapixels:1.1,sampler:'heun',steps:8,fps:30});assert.equal(graph['16'].inputs.aspect_ratio,label);assert.equal(graph['7'].inputs.steps,8);assert.equal(graph['7'].inputs.sampler_name,'heun');assert.equal(graph['12'].inputs.frame_rate,24);}const old=store.getProject(p.id);store.updateProject(p.id,{fps:30,steps:8,sampler:'heun'},old.version);const [job]=queue.enqueue(p.id,['shot1'],'fps-snapshot');assert.equal(job.projectSettings.fps,30);assert.equal(job.projectSettings.steps,8);});

test('collection converts to the queued frame rate even after project settings change',async t=>{let converted=0;const {queue,p,store}=setup(t,{preflight:async graph=>{assert.equal(graph['7'].inputs.steps,8);return {ready:true,errors:[]};},submit:async()=>({prompt_id:'fps'}),history:async()=>({status:{completed:true},outputs:{12:{gifs:[{filename:'clip.mp4',type:'output'}]}}}),download:async()=>Buffer.from('video')});let project=store.getProject(p.id);project=store.updateProject(p.id,{steps:8,fps:30},project.version);const [job]=queue.enqueue(p.id,['shot1'],'convert-snapshot');store.updateProject(p.id,{steps:12,fps:60},project.version);queue.media={convertFrameRate:async(file,fps)=>{converted++;assert.equal(fps,30);},tail:async()=>null};await queue.run();assert.equal(converted,1);assert.equal(store.get('jobs',job.id).status,'succeeded');queue.close();});

test('continuity uses the immediate previous storyboard shot across separate submissions and re-extracts missing tails',async t=>{let submitted,uploaded;const {queue,p,store,root}=setup(t,{preflight:async()=>({ready:true,errors:[]}),upload:async file=>{uploaded=file;return {name:'previous-tail.png'};},submit:async graph=>{submitted=graph;return {prompt_id:'connected'};},history:async()=>({status:{completed:true},outputs:{12:{gifs:[{filename:'clip.mp4',type:'output'}]}}}),download:async()=>Buffer.from('video')});const current=store.getProject(p.id),nextShot={...shot,id:'shot2',title:'第二镜头'};store.updateProject(p.id,{plan:{...current.plan,shots:[shot,nextShot]}},current.version);const output='projects/'+p.id+'/outputs/previous.mp4';writeFileSync(path.join(root,output),'video');store.put('jobs','previous',{id:'previous',projectId:p.id,shotId:shot.id,shot,requestKey:'another-click',status:'succeeded',output,queueOrder:1,createdAt:new Date().toISOString()});queue.media={tail:async video=>{const tail=video+'.tail.png';writeFileSync(tail,'image');return tail;}};const [job]=queue.enqueue(p.id,['shot2'],'single-click','text',true);await queue.run();assert.equal(submitted['6'].inputs.task_type,'I2VA');assert.deepEqual(submitted['6'].inputs.first_frame,['41',0]);assert.equal(submitted['41'].inputs.image,'previous-tail.png');assert.ok(uploaded.endsWith('previous.mp4.tail.png'));assert.equal(store.get('jobs',job.id).continuitySourceJobId,'previous');assert.equal(store.get('jobs',job.id).continuityApplied,true);queue.close();});

test('continuity never silently generates a same-scene successor without its predecessor',async t=>{let submits=0;const {queue,p,store}=setup(t,{preflight:async()=>({ready:true,errors:[]}),submit:async()=>{submits++;return {prompt_id:'bad'};}});const current=store.getProject(p.id);store.updateProject(p.id,{plan:{...current.plan,shots:[shot,{...shot,id:'shot2'}]}},current.version);const [job]=queue.enqueue(p.id,['shot2'],'missing-previous','text',true);await queue.run();assert.equal(submits,0);assert.equal(store.get('jobs',job.id).status,'failed');assert.match(store.get('jobs',job.id).error,/上一镜头/);queue.close();});

test('a failed predecessor from the same batch cannot be replaced by an older successful take',async t=>{const {queue,p,store}=setup(t,{});const current=store.getProject(p.id);store.updateProject(p.id,{plan:{...current.plan,shots:[shot,{...shot,id:'shot2'}]}},current.version);store.put('jobs','old',{id:'old',projectId:p.id,shotId:shot.id,shot,status:'succeeded',requestKey:'old',queueOrder:0});const batch=queue.enqueue(p.id,['shot1','shot2'],'new-batch','text',true);queue.save(batch[0],{status:'failed'});await assert.rejects(queue.continuityFrame(batch[1]),/上一镜头/);assert.equal(await queue.continuityFrame(batch[0]),null);queue.close();});

test('explicit tail source uses the selected completed take across scenes and rejects foreign projects',async t=>{let graph;const {queue,p,store,root}=setup(t,{preflight:async()=>({ready:true,errors:[]}),upload:async()=>({name:'selected.png'}),submit:async g=>{graph=g;return {prompt_id:'selected'};},history:async()=>({status:{completed:true},outputs:{12:{gifs:[{filename:'clip.mp4',type:'output'}]}}}),download:async()=>Buffer.from('video')});const tail=path.join(root,'selected.png');writeFileSync(tail,'image');store.put('jobs','selected',{id:'selected',projectId:p.id,shotId:'another',shot:{...shot,id:'another',sceneId:'other-scene'},status:'succeeded',tail,requestKey:'old',queueOrder:1});store.put('jobs','foreign',{id:'foreign',projectId:'foreign',status:'succeeded',shot,tail});assert.throws(()=>queue.enqueue(p.id,['shot1'],'foreign-ref','text',true,'foreign'),/来源镜头/);const [job]=queue.enqueue(p.id,['shot1'],'selected-ref','text',true,'selected');assert.equal(job.continuitySourceSelected,true);assert.equal(job.continuitySourceJobId,'selected');await queue.run();assert.equal(graph['6'].inputs.task_type,'I2VA');assert.equal(graph['41'].inputs.image,'selected.png');queue.close();});

test('automatic selectable tail picks the closest available earlier storyboard shot',t=>{const {queue,p,store}=setup(t,{});const current=store.getProject(p.id);store.updateProject(p.id,{plan:{...current.plan,shots:[shot,{...shot,id:'shot2'},{...shot,id:'shot3'}]}},current.version);store.put('jobs','done-first',{id:'done-first',projectId:p.id,shotId:shot.id,shot,status:'succeeded',requestKey:'old',queueOrder:1});const [job]=queue.enqueue(p.id,['shot3'],'auto-source','text',true,'auto');assert.equal(job.continuityPreviousShotId,'shot1');queue.close();});
