import { test, expect } from "@playwright/test";
test('reference mode points to asset upload before accepting a video task',async({page})=>{await page.route('**/api/v1/readiness*',route=>route.fulfill({json:{...missingPreparation,planningReady:true,videoReady:true,exportReady:true,items:missingPreparation.items.map(item=>({...item,state:'ready'}))}}));await editableProject(page);await page.getByRole('button',{name:'01 橘猫 固定 · 5s',exact:true}).click();await page.getByLabel('生成方式',{exact:true}).selectOption('reference');await expect(page.getByRole('button',{name:'生成此镜头',exact:true}).first()).toBeDisabled();await page.getByRole('button',{name:'去素材库上传参考图',exact:true}).click();await expect(page.getByRole('heading',{name:'让角色，始终如一。'})).toBeVisible();});
const missingPreparation={checkedAt:'2026-10-31T18:00:00Z',planningReady:false,videoReady:false,exportReady:true,inferenceValidated:false,items:[{id:'director-model',title:'剧本与分镜模型',state:'missing',summary:'尚未安装所选导演模型',details:[],action:{label:'去下载或选择导演模型',page:'models'}},{id:'video-models',title:'H3 基础五模型',state:'missing',summary:'还缺 5 个模型；运行环境安装完成不等于模型已下载',details:['H3 主模型：minimax_h3_fl2va_int8_convrot.safetensors'],action:{label:'去下载 H3 基础模型',page:'models'}}]};
test('startup preparation guides through the top status icon outside overview',async({page})=>{await page.route('**/api/v1/readiness*',r=>r.fulfill({json:missingPreparation}));await editableProject(page);await expect(page.getByRole('region',{name:'准备检查'})).toHaveCount(0);await expect(page.getByRole('button',{name:'生成全部镜头',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'分析剧本 · 生成分镜',exact:true})).toBeDisabled();await expect(page.getByText('Dakun Qin',{exact:false})).toHaveCount(0);await page.getByRole('button',{name:'资源尚需准备',exact:true}).click();await expect(page.getByText('使用前还需准备',{exact:true})).toBeVisible();await page.getByRole('button',{name:'去下载 H3 基础模型',exact:true}).click();await expect(page.getByRole('heading',{name:'你的本地模型库'})).toBeVisible();});
test('failed preparation check stays blocked and retry can restore the resource-ready state',async({page})=>{let healthy=false;await page.route('**/api/v1/readiness*',route=>route.fulfill(healthy?{json:{...missingPreparation,planningReady:true,videoReady:true,items:missingPreparation.items.map(item=>({...item,state:'ready',summary:'资源可用'}))}}:{status:503,json:{error:'检查超时'}}));await editableProject(page);await page.getByRole('button',{name:'准备检查失败',exact:true}).click();await expect(page.getByText('暂时无法完成准备检查',{exact:true})).toBeVisible();healthy=true;await page.getByRole('button',{name:'重新检查准备状态',exact:true}).click();await expect(page.getByText('已就绪，可以生成',{exact:true})).toBeVisible();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await page.getByRole('button',{name:'01 橘猫 固定 · 5s',exact:true}).click();await page.getByLabel('生成方式',{exact:true}).selectOption('text');await expect(page.getByRole('button',{name:'生成全部镜头',exact:true})).toBeEnabled();});
test("users can correct asset classification and add a scene without an external agent", async ({
  page,
}) => {
  await editableProject(page);
  await page.getByRole("button", { name: "素材库", exact: true }).click();
  await page.getByText("编辑资产设定", { exact: true }).first().click();
  await page.getByLabel("资产名称").first().fill("橘猫角色");
  await page.getByLabel("资产类型").first().selectOption("character");
  await page.getByRole("button", { name: "保存资产设定", exact: true }).click();
  await expect(
    page.getByText("项目与资产已保存", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "导演工作台", exact: true }).click();
  await page.getByRole("button", { name: "项目设定", exact: true }).click();
  await page.getByRole("button", { name: "添加场景", exact: true }).click();
  await page.getByLabel("场景名称").last().fill("窗边");
  await page.getByRole("button", { name: "保存剧本", exact: true }).click();
  await expect(page.getByText("剧本已保存", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "素材库", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "橘猫角色", exact: true }),
  ).toBeVisible();
});
async function editableProject(page: any) {
  await page.goto("/");
  const { token } = await (await page.request.get("/api/v1/session")).json();
  const headers = { Authorization: "Bearer " + token };
  const p = await (
    await page.request.post("/api/v1/projects", {
      headers,
      data: { name: "草稿保护测试", script: "原始剧本" },
    })
  ).json();
  await page.request.patch("/api/v1/projects/" + p.id, {
    headers,
    data: {
      version: p.version,
      plan: {
        summary: "猫",
        assets: [
          { id: "cat", name: "猫", kind: "character", description: "橘猫" },
        ],
        scenes: [{ id: "scene1", title: "街道", description: "清晨" }],
        shots: [
          {
            id: "shot1",
            sceneId: "scene1",
            title: "橘猫",
            prompt: "橘猫走过街道",
            duration: 5,
            camera: "固定",
            assetIds: ["cat"],
          },
        ],
      },
    },
  });
  await page.evaluate(
    (id: string) => localStorage.setItem("nana-project", id),
    p.id,
  );
  await page.reload();
  await page.getByRole("button", { name: "导演工作台", exact: true }).click();
  return p;
}
test("starting services after installer changes does not overwrite managed flags with stale form defaults", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("ComfyUI 地址").waitFor();
  const { token } = await (await page.request.get("/api/v1/session")).json();
  await page.request.patch("/api/v1/settings", {
    headers: { Authorization: "Bearer " + token },
    data: { managedComfy: true, managedOllama: true },
  });
  await page.route("**/api/v1/environment/start", (route) =>
    route.fulfill({ json: { message: "启动请求已发送" } }),
  );
  await page.getByRole("button", { name: "启动服务", exact: true }).click();
  await expect(
    page.getByText("服务启动中，请稍候查看状态", { exact: true }),
  ).toBeVisible();
  const result = await (await page.request.get("/api/v1/settings")).json();
  expect(result.managedComfy).toBe(true);
  expect(result.managedOllama).toBe(true);
});
test("editing while a save is pending preserves the newer draft", async ({
  page,
}) => {
  const p = await editableProject(page);
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  let responseReady!: () => void;
  const waiting = new Promise<void>((r) => (responseReady = r));
  await page.route("**/api/v1/projects/" + p.id, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch();
    responseReady();
    await hold;
    await route.fulfill({ response });
  });
  await page.getByLabel("剧本正文").fill("已提交保存的版本");
  await page.getByRole("button", { name: "保存剧本", exact: true }).click();
  await waiting;
  await page.getByLabel("剧本正文").fill("请求期间继续编辑的新版本");
  release();
  await expect(page.getByText("剧本已保存", { exact: true })).toBeVisible();
  await expect(page.getByLabel("剧本正文")).toHaveValue(
    "请求期间继续编辑的新版本",
  );
  await expect(page.getByText("有未保存修改", { exact: true })).toBeVisible();
  await page.unroute("**/api/v1/projects/" + p.id);
  await page.getByRole("button", { name: "保存剧本", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "导演工作台", exact: true }).click();
  await expect(page.getByLabel("剧本正文")).toHaveValue(
    "请求期间继续编辑的新版本",
  );
});
test("reference upload does not discard an unsaved script", async ({
  page,
}) => {
  await editableProject(page);
  await page.getByLabel("剧本正文").fill("上传图片时必须保留的未保存剧本");
  await page.getByRole("button", { name: "素材库", exact: true }).click();
  await page.locator("input[type=file]").last().setInputFiles("desktop/icon.png");
  await expect(page.getByText("参考图已绑定", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "导演工作台", exact: true }).click();
  await expect(page.getByLabel("剧本正文")).toHaveValue(
    "上传图片时必须保留的未保存剧本",
  );
});
test("create a real project, save script, navigate models and environment", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /让故事，\s*成为画面。/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新建电影项目", exact: true }).click();
  await page.getByLabel("项目名称").fill("浏览器测试电影");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "浏览器测试电影" }),
  ).toBeVisible();
  await page
    .getByLabel("剧本正文")
    .fill("清晨，一只橘猫在安静的街道上缓慢走过。");
  await page.getByRole("button", { name: "保存剧本", exact: true }).click();
  await expect(page.getByText("剧本已保存", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "导演工作台", exact: true }).click();
  await expect(page.getByLabel("剧本正文")).toHaveValue(
    "清晨，一只橘猫在安静的街道上缓慢走过。",
  );
  await page.getByRole("button", { name: "模型中心", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "你的本地模型库" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /H3 主模型 · INT8/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByLabel("ComfyUI 地址")).toBeVisible();
});
test("mobile navigation and empty media state remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "素材库", exact: true }).click();
  await expect(
    page.getByText("从角色到场景，让每一帧保持一致。"),
  ).toBeVisible();
});

test('camera library supports combinations and interface style survives reload',async({page})=>{
  await editableProject(page);
  await page.getByRole('button',{name:'01 橘猫 固定 · 5s',exact:true}).click();
  await page.getByText(/浏览镜头语言库/).click();
  await page.getByLabel('搜索镜头语言').fill('环绕');
  await page.getByRole('button',{name:'环绕镜头',exact:true}).click();
  await expect(page.getByLabel('镜头语言',{exact:true})).toHaveValue('固定、环绕镜头');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByLabel('软件界面风格').selectOption('paper');
  await expect(page.locator('html')).toHaveAttribute('data-theme','paper');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','paper');
  await expect(page.getByText('性能',{exact:true}).first()).toBeVisible();
});

test('uploading a selected asset unlocks automatic reference generation and first-frame mode is available',async({page})=>{
 await page.route('**/api/v1/readiness*',r=>r.fulfill({json:{...missingPreparation,planningReady:true,videoReady:true,items:missingPreparation.items.map(i=>({...i,state:'ready'}))}}));
 const p=await editableProject(page);
 await page.getByRole('button',{name:'01 橘猫 固定 · 5s',exact:true}).click();
 await expect(page.getByLabel('生成方式',{exact:true})).toHaveValue('auto');
 await expect(page.getByRole('button',{name:'生成此镜头',exact:true}).first()).toBeDisabled();
 const {token}=await (await page.request.get('/api/v1/session')).json();
 const upload=await page.request.post(`/api/v1/projects/${p.id}/assets`,{headers:{Authorization:'Bearer '+token},data:{assetId:'cat',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}});expect(upload.ok()).toBeTruthy();
 await page.reload();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await page.getByRole('button',{name:'01 橘猫 固定 · 5s',exact:true}).click();
 await expect(page.getByRole('button',{name:'生成此镜头',exact:true}).first()).toBeEnabled();
 await expect(page.getByAltText('猫参考图')).toBeVisible();
 await page.getByLabel('生成方式',{exact:true}).selectOption('first-frame');
 await expect(page.getByRole('button',{name:'生成此镜头',exact:true}).first()).toBeEnabled();
 await expect(page.getByLabel('可选镜头尾帧')).toBeDisabled();
});

test('asset generator accepts an uploaded reference, previews four views and adds a reviewed draft to library',async({page})=>{
 await page.route('**/api/v1/asset-studio',r=>r.fulfill({json:{ready:true,checkpoints:['sd_xl_base_1.0.safetensors'],recommended:'sd_xl_base_1.0.safetensors',errors:[],busy:false}}));
 let submitted:any=null,referencePath='',generated=false;
 await page.route('**/api/v1/projects/*/asset-generations',async r=>{if(r.request().method()==='POST'){submitted=r.request().postDataJSON();generated=true;await r.fulfill({json:draft()});}else await r.fulfill({json:generated?[draft()]:[]});});
 const draft=()=>({id:'generated-test',name:'小麦',description:'Orange cat',subjectType:'animal',status:'succeeded',message:'四视图草稿已生成',sheet:referencePath,referencePath,views:[0,1,2,3].map(i=>({name:'方向'+i,path:referencePath}))});
 const p=await editableProject(page);await page.getByRole('button',{name:'生成素材',exact:true}).click();
 await page.getByLabel('素材类型',{exact:true}).selectOption('animal');await page.getByLabel('素材名称',{exact:true}).fill('小麦');await page.getByLabel('素材外观描述',{exact:true}).fill('Orange cat, white paws');
 await page.getByLabel('上传素材生成参考图',{exact:true}).setInputFiles('desktop/icon.png');await expect(page.getByText('素材生成参考图已上传',{exact:true})).toBeVisible();
 const src=await page.getByAltText('素材生成参考图预览').getAttribute('src');referencePath=new URL(src!,'http://localhost').searchParams.get('path')!;
 await page.getByRole('button',{name:'生成四视图草稿',exact:true}).click();await expect(page.getByAltText('小麦四视图草稿')).toBeVisible();await page.getByAltText('小麦四视图草稿').click();await expect(page.getByRole('dialog',{name:'图片预览'})).toBeVisible();await page.getByRole('button',{name:'关闭预览 · 返回',exact:true}).click();await expect(page.getByRole('dialog',{name:'图片预览'})).toHaveCount(0);await page.getByAltText('小麦四视图草稿').click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'图片预览'})).toHaveCount(0);expect(submitted.referencePath).toBe(referencePath);expect(submitted.subjectType).toBe('animal');
 await page.route('**/api/v1/projects/*/asset-generations/generated-test/adopt',async r=>{const b=r.request().postDataJSON();const project=await (await page.request.get(`/api/v1/projects/${p.id}`)).json();await r.fulfill({json:{...project,version:b.version+1,plan:{...project.plan,assets:[...project.plan.assets,{id:'milo',name:'小麦',kind:'character',description:'Orange cat'}]},assets:[...project.assets,{assetId:'milo',path:referencePath}]}});});
 await expect(page.getByRole('button',{name:'加入素材库',exact:true})).toBeDisabled();await page.getByLabel('我已检查这组图片的主体、朝向和一致性').check();await page.getByRole('button',{name:'加入素材库',exact:true}).click();await expect(page.getByRole('heading',{name:'小麦',exact:true})).toBeVisible();
});
test('quick light/dark switch stays synchronized with settings and survives restart',async({page})=>{await page.goto('/');await page.getByLabel('界面明暗',{exact:true}).selectOption('paper');await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByLabel('软件界面风格',{exact:true})).toHaveValue('paper');await page.getByLabel('软件界面风格',{exact:true}).selectOption('midnight');await expect(page.getByLabel('界面明暗',{exact:true})).toHaveValue('midnight');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','midnight');});

test('image model download opens its own license confirmation without the H3 checkbox',async({page})=>{
 let request:any=null;await page.route('**/api/v1/models/download',async r=>{request=r.request().postDataJSON();await r.fulfill({json:{message:'queued'}});});await page.goto('/');await page.getByRole('button',{name:'模型中心',exact:true}).click();await expect(page.getByRole('button',{name:'下载图片模型',exact:true})).toBeEnabled();await page.getByRole('button',{name:'下载图片模型',exact:true}).click();await expect(page.getByRole('dialog',{name:'下载图片模型'})).toBeVisible();await page.getByRole('button',{name:'同意许可并开始下载',exact:true}).click();await expect(page.getByText('图片模型已加入下载队列',{exact:true})).toBeVisible();expect(request).toEqual({ids:['image-sdxl-base'],acceptLicenses:true});
});
test('header hides the extra label and new interface styles persist',async({page})=>{await page.goto('/');await expect(page.getByText('明暗',{exact:true})).toHaveCount(0);for(const theme of ['minimal','graphite','glass']){await page.getByLabel('界面明暗',{exact:true}).selectOption(theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);}});

test('hardware readout stays centered in the pinned top row while scrolling',async({page})=>{await page.goto('/');await page.getByLabel('界面明暗',{exact:true}).selectOption('paper');const header=page.locator('header.topbar');await expect(header.locator('.resource-monitor')).toBeVisible();await expect(page.locator('main .resource-monitor')).toHaveCount(0);expect(await header.evaluate(e=>getComputedStyle(e).display)).toBe('grid');await page.evaluate(()=>window.scrollTo(0,500));expect((await header.boundingBox())!.y).toBe(0);await page.setViewportSize({width:390,height:844});await expect(header.locator('.resource-monitor')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();});

test('custom local model import and library deletion have visible working controls',async({page})=>{const p=await editableProject(page);await page.getByRole('button',{name:'模型中心',exact:true}).click();await page.getByLabel('选择本地模型文件',{exact:true}).setInputFiles({name:'my-custom.safetensors',mimeType:'application/octet-stream',buffer:Buffer.from('test model bytes')});await page.getByRole('button',{name:'导入模型到数据盘',exact:true}).click();await expect(page.getByText('自定义模型导入完成，请重启 ComfyUI 并重新检测',{exact:true})).toBeVisible();await expect(page.getByText(/checkpoints \/ my-custom.safetensors/)).toBeVisible();await page.getByRole('button',{name:'素材库',exact:true}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除素材',exact:true}).click();await expect(page.getByText('素材已删除，镜头引用已解除',{exact:true})).toBeVisible();const saved=await(await page.request.get('/api/v1/projects/'+p.id)).json();expect(saved.plan.assets).toHaveLength(0);expect(saved.plan.shots[0].assetIds).toHaveLength(0);});
test('service detection displays waiting feedback instead of an inert click',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();let release:()=>void=()=>{};const waiting=new Promise<void>(r=>release=r);await page.route('**/api/v1/status?refresh=1',async r=>{await waiting;await r.fulfill({json:{ollama:{online:true,models:[]},comfy:{online:true},processes:[]}});});await page.getByRole('button',{name:'检测服务连接',exact:true}).click();await expect(page.getByText('正在检测已安装与外部服务，请等待连接结果；检测中不代表未安装。',{exact:true})).toBeVisible();release();await expect(page.getByText(/检测完成。Ollama：已连接；ComfyUI：已连接/)).toBeVisible();await expect(page.getByRole('button',{name:'停止托管服务',exact:true})).toBeVisible();});

test('initial startup shows animated checking rather than missing installation messages',async({page})=>{await page.route('**/api/v1/readiness*',r=>r.fulfill({json:{...missingPreparation,initializing:true}}));await page.goto('/');await expect(page.getByRole('heading',{name:'正在检测本机服务与模型，请等待',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'准备检查'}).locator('svg.spin').first()).toBeVisible();await expect(page.getByText('使用前还需准备',{exact:true})).toHaveCount(0);await expect(page.locator('.engine-row').getByText('正在检测',{exact:true})).toHaveCount(2);});
test('background checks preserve the resource panel and ready state omits sample advice',async({page})=>{let holdBackground=false,release:()=>void=()=>{};const wait=new Promise<void>(r=>release=r);await page.route('**/api/v1/readiness*',async r=>{if(holdBackground)await wait;await r.fulfill({json:{...missingPreparation,planningReady:true,videoReady:true,items:missingPreparation.items.map(i=>({...i,state:'ready'}))}});});await page.goto('/');await expect(page.getByRole('heading',{name:'已就绪，可以生成',exact:true})).toBeVisible();holdBackground=true;await page.waitForTimeout(12500);await expect(page.getByRole('heading',{name:'已就绪，可以生成',exact:true})).toBeVisible();await expect(page.getByText('正在检测本机服务与模型，请等待',{exact:true})).toHaveCount(0);await expect(page.getByText(/建议先生成 5 秒小样/)).toHaveCount(0);release();});

test('ComfyUI webpage opens only after pressing the explicit button',async({page})=>{await page.addInitScript(()=>{(window as any).comfyOpens=0;(window as any).nanaDesktop={openComfy:async()=>{(window as any).comfyOpens++;}};});await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();expect(await page.evaluate(()=>(window as any).comfyOpens)).toBe(0);await page.getByRole('button',{name:'打开 ComfyUI 网页',exact:true}).click();expect(await page.evaluate(()=>(window as any).comfyOpens)).toBe(1);});

test('versioned title, isolated author credit and standalone asset studio navigation',async({page})=>{await page.goto('/');await expect(page).toHaveTitle(/v0\.1\.22$/);await expect(page.getByText('Dakun Qin',{exact:true})).toHaveCount(0);await expect(page.getByText('Nana Director PRO · 开源版',{exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'素材库',exact:true}).click();await expect(page.getByRole('heading',{name:'生成四视图素材',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'生成素材',exact:true}).click();await expect(page.getByRole('heading',{name:'生成素材',exact:true})).toBeVisible();await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByText('Dakun Qin',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'关于',exact:true}).click();await expect(page.getByText('Dakun Qin',{exact:true})).toHaveCount(1);});
test('desktop header resource metrics stay on one line in the wider layout',async({page})=>{await page.setViewportSize({width:1760,height:1040});await page.route('**/api/v1/resources',r=>r.fulfill({json:{sampledAt:'2026-11-01',scope:'整机',cpuPercent:25,memoryUsedBytes:16000000000,memoryTotalBytes:32000000000,gpus:[0,1].map(index=>({index,name:'GPU',utilization:25,memoryUsedMB:4000,memoryTotalMB:16000,temperatureC:45})),gpuError:null}}));await page.goto('/');await expect(page.locator('header .resource-monitor summary')).toContainText('GPU 1');const rows=await page.locator('header .resource-monitor summary>span').evaluateAll(spans=>Array.from(new Set(spans.map(s=>Math.round(s.getBoundingClientRect().y)))));expect(rows).toHaveLength(1);});

test('workspace status follows the selected project name without wrapping',async({page})=>{await editableProject(page);await expect(page.locator('header .workspace-project-name')).toHaveText('项目：草稿保护测试');await expect(page.locator('header .workspace-project-name')).toHaveAttribute('title','草稿保护测试');});

test('ready information panel is limited to overview and settings while other pages keep a top icon',async({page})=>{await page.route('**/api/v1/readiness*',r=>r.fulfill({json:{...missingPreparation,planningReady:true,videoReady:true,items:missingPreparation.items.map(i=>({...i,state:'ready'}))}}));await page.goto('/');await expect(page.getByRole('region',{name:'准备检查'})).toBeVisible();for(const name of ['电影项目','生成素材','素材库','生成队列','模型中心']){await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('region',{name:'准备检查'})).toHaveCount(0);await expect(page.getByRole('button',{name:'资源已就绪',exact:true})).toBeVisible();}await page.getByRole('button',{name:'资源已就绪',exact:true}).click();await expect(page.getByRole('region',{name:'准备检查'})).toBeVisible();});

test('OpenAPI document closes back to settings and contact email is shown',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'关于',exact:true}).click();await expect(page.getByText('qindakun@yahoo.com',{exact:true})).toBeVisible();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面明暗',{exact:true}).selectOption('glass');const url=page.url();await page.getByRole('button',{name:'查看 OpenAPI 文档',exact:true}).click();await expect(page.getByRole('dialog',{name:'OpenAPI 文档',exact:true})).toBeVisible();await expect(page.locator('.document-preview')).toContainText('openapi');await expect(page.locator('body>.image-preview-backdrop')).toHaveCount(1);expect(page.url()).toBe(url);await page.getByRole('button',{name:'关闭文档 · 返回',exact:true}).click();await expect(page.getByRole('dialog',{name:'OpenAPI 文档',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'查看 OpenAPI 文档',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'OpenAPI 文档',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'让创作，从容开始。',exact:true})).toBeVisible();});
test('performance summary frame hugs its content without large empty space',async({page})=>{await page.setViewportSize({width:1920,height:1080});await page.route('**/api/v1/resources',r=>r.fulfill({json:{scope:'整机',cpuPercent:10,memoryUsedBytes:16000000000,memoryTotalBytes:32000000000,gpus:[],gpuError:null}}));await page.goto('/');await expect(page.getByText('性能',{exact:true})).toBeVisible();await expect(page.locator('.resource-monitor summary')).toContainText('16.0 GB');const widths=await page.locator('.resource-monitor').evaluate(el=>({frame:el.getBoundingClientRect().width,content:el.querySelector('summary')!.getBoundingClientRect().width}));expect(widths.frame-widths.content).toBeLessThan(30);expect(widths.frame).toBeLessThan(400);});

test('renaming current project preserves unsaved script and persists the new name',async({page})=>{const p=await editableProject(page);await page.getByLabel('剧本正文').fill('尚未保存的中文内容');await page.getByRole('button',{name:'重命名当前项目',exact:true}).click();await page.getByLabel('新的项目名称',{exact:true}).fill('修改后的电影');await page.getByRole('button',{name:'保存名称',exact:true}).click();await expect(page.getByText('项目名称已更新',{exact:true})).toBeVisible();await expect(page.locator('header .workspace-project-name')).toHaveText('项目：修改后的电影');await expect(page.getByLabel('剧本正文')).toHaveValue('尚未保存的中文内容');expect((await(await page.request.get('/api/v1/projects/'+p.id)).json()).script).toBe('原始剧本');await page.getByRole('button',{name:'保存剧本',exact:true}).click();await expect(page.getByText('剧本已保存',{exact:true})).toBeVisible();await page.reload();await expect(page.locator('header .workspace-project-name')).toHaveText('项目：修改后的电影');});
test('script and storyboard files preview before replacing and save imported content',async({page})=>{const p=await editableProject(page);await page.getByRole('button',{name:'导入剧本',exact:true}).click();await page.getByLabel('选择导入文件',{exact:true}).setInputFiles({name:'story.md',mimeType:'text/markdown',buffer:Buffer.from('新的中文剧本\n猫走进书店。')});await expect(page.getByRole('heading',{name:'导入预览',exact:true})).toBeVisible();expect((await(await page.request.get('/api/v1/projects/'+p.id)).json()).script).toBe('原始剧本');await page.getByLabel('我已检查内容，并确认替换对应剧本或分镜').check();await page.getByRole('button',{name:'确认导入并保存',exact:true}).click();await expect(page.getByText('导入完成，已保存到项目',{exact:true})).toBeVisible();await expect(page.getByLabel('剧本正文')).toHaveValue('新的中文剧本\n猫走进书店。');await page.getByRole('button',{name:'导入分镜',exact:true}).click();await page.getByLabel('选择导入文件',{exact:true}).setInputFiles({name:'shots.csv',mimeType:'text/csv',buffer:Buffer.from('title,scene,duration,camera,prompt,assets\n新分镜,书店,5,特写,猫望向窗外,cat')});await expect(page.getByRole('heading',{name:'导入预览',exact:true})).toBeVisible();await page.getByLabel('我已检查内容，并确认替换对应剧本或分镜').check();await page.getByRole('button',{name:'确认导入并保存',exact:true}).click();await expect(page.getByText('导入完成，已保存到项目',{exact:true})).toBeVisible();const saved=await(await page.request.get('/api/v1/projects/'+p.id)).json();expect(saved.plan.shots[0].title).toBe('新分镜');expect(saved.plan.shots[0].id).not.toBe('shot1');expect(saved.plan.shots[0].assetIds).toEqual(['cat']);});
test('system language and saved language selection localize UI without rewriting project content',async({page,browser})=>{const p=await editableProject(page);const english=await browser.newContext({locale:'en-US'});const enPage=await english.newPage();await enPage.goto('http://127.0.0.1:8799/');await expect(enPage.getByRole('button',{name:'Settings',exact:true})).toBeVisible();await english.close();await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByLabel('选择界面语言',{exact:true})).toHaveValue('system');await page.getByLabel('选择界面语言',{exact:true}).selectOption('en');await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeVisible();expect((await(await page.request.get('/api/v1/projects/'+p.id)).json()).script).toBe('原始剧本');await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByLabel('Interface language',{exact:true})).toHaveValue('en');await page.getByLabel('Interface language',{exact:true}).selectOption('zh-TW');await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByLabel('選擇介面語言',{exact:true}).selectOption('system');await expect(page.getByRole('button',{name:'设置',exact:true})).toBeVisible();});

test('Japanese, Korean and Spanish system locales load offline interface labels',async({browser})=>{for(const [locale,label,lang]of [['ja-JP','設定','ja'],['ko-KR','설정','ko'],['es-ES','Ajustes','es']]){const context=await browser.newContext({locale});const page=await context.newPage();const external:string[]=[];page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:8799/')&&!request.url().startsWith('data:'))external.push(request.url());});await page.goto('http://127.0.0.1:8799/');await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang',lang);expect(external).toHaveLength(0);await context.close();}});

test('scene editor scrolls internally while add scene stays outside the list',async({page})=>{await editableProject(page);await page.getByRole('button',{name:'项目设定',exact:true}).click();for(let i=0;i<9;i++)await page.getByRole('button',{name:'添加场景',exact:true}).click();const list=page.getByRole('region',{name:'场景列表',exact:true});await expect(list).toBeVisible();expect(await list.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);expect(await list.evaluate(el=>el.clientHeight)).toBeLessThanOrEqual(440);expect(await page.getByRole('button',{name:'添加场景',exact:true}).evaluate(el=>!el.closest('.scene-list'))).toBe(true);});

test('empty asset opens prefilled generation and pending feedback stays directly below generate',async({page})=>{
 await page.route('**/api/v1/asset-studio',r=>r.fulfill({json:{ready:true,checkpoints:['sd_xl_base_1.0.safetensors'],recommended:'sd_xl_base_1.0.safetensors',errors:[],busy:false}}));
 let submitted:any;const old={id:'old',name:'已入库猫',description:'cat',subjectType:'animal',status:'succeeded',message:'done',adoptedAt:'2026-11-01',adoptedAssetId:'cat'};
 await page.route('**/api/v1/projects/*/asset-generations',r=>{if(r.request().method()==='POST'){submitted=r.request().postDataJSON();return r.fulfill({json:{...submitted,id:'new',status:'submitted',message:'本机正在绘制四视图'}});}return r.fulfill({json:[old]});});
 await editableProject(page);await page.getByRole('button',{name:'素材库',exact:true}).click();await page.getByRole('button',{name:'生成四视图',exact:true}).first().click();await expect(page.getByLabel('素材名称',{exact:true})).toHaveValue('猫');await expect(page.getByLabel('入库位置',{exact:true})).toHaveValue('cat');await expect(page.getByLabel('素材生成参考图',{exact:true})).toHaveValue('');
 await expect(page.getByText('已入库猫 · 已入库',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:/查看已入库记录/}).click();await expect(page.getByText('已入库猫 · 已入库',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'生成四视图草稿',exact:true}).click();await expect.poll(()=>submitted?.targetAssetId).toBe('cat');expect(submitted.referenceAssetId).toBeUndefined();const feedback=page.getByRole('status',{name:'四视图生成进度',exact:true});await expect(feedback).toBeVisible();await expect(feedback.locator('.spin')).toHaveCount(1);expect(await feedback.evaluate(el=>el.previousElementSibling?.textContent)).toContain('正在生成四视图');
});

test('selected shot survives queue navigation and reload and task details expose workflow and elapsed time',async({page})=>{const p=await editableProject(page);const {token}=await(await page.request.get('/api/v1/session')).json();const project=await(await page.request.get('/api/v1/projects/'+p.id)).json();await page.request.patch('/api/v1/projects/'+p.id,{headers:{Authorization:'Bearer '+token},data:{version:project.version,plan:{...project.plan,shots:[...project.plan.shots,{...project.plan.shots[0],id:'shot2',title:'第二镜头'}]}}});await page.reload();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await page.getByRole('button',{name:'02 第二镜头 固定 · 5s',exact:true}).click();await page.getByRole('button',{name:/^生成队列/}).click();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await expect(page.locator('.shot-item.selected')).toContainText('第二镜头');await page.reload();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await expect(page.locator('.shot-item.selected')).toContainText('第二镜头');
await page.route('**/api/v1/jobs',r=>r.fulfill({json:[{id:'timed',projectId:p.id,shotId:'shot2',shot:{title:'第二镜头',duration:5},status:'running',startedAt:new Date(Date.now()-65000).toISOString(),createdAt:new Date().toISOString()}]}));await page.route('**/api/v1/jobs/timed/workflow',r=>r.fulfill({json:{actual:true,workflow:{'1':{class_type:'KSampler',inputs:{steps:4}}}}}));await page.reload();await page.getByRole('button',{name:/^生成队列/}).click();await expect(page.locator('.job-symbol .spin')).toHaveCount(1);await expect(page.locator('.job-elapsed')).toContainText('耗时');await page.getByRole('button',{name:'查看 ComfyUI 工作流',exact:true}).click();await expect(page.getByRole('dialog',{name:'ComfyUI 工作流'})).toBeVisible();await expect(page.getByText('KSampler',{exact:true})).toBeVisible();await page.screenshot({path:'docs/screenshots/queue-workflow.png'});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.resource-live-icon')).toBeVisible();await page.screenshot({path:'docs/screenshots/queue-status.png'});});

test('per-shot sound is saved and workflow is available beside generation without submitting',async({page})=>{await page.route('**/api/v1/resources',r=>r.fulfill({json:{sampledAt:new Date().toISOString(),scope:'本机资源',cpuPercent:15,memoryUsedBytes:8e9,memoryTotalBytes:32e9,gpus:[{index:0,name:'Test GPU',utilization:20,memoryUsedMB:1000,memoryTotalMB:8000,temperatureC:45}],gpuError:null}}));const p=await editableProject(page);await page.getByRole('button',{name:'01 橘猫 固定 · 5s',exact:true}).click();await expect(page.getByLabel('声音输出',{exact:true})).toHaveValue('native');await page.getByLabel('声音输出',{exact:true}).selectOption('native');await page.getByLabel('声音描述',{exact:true}).fill('普通话对白，轻微雨声');await page.getByRole('button',{name:'查看 ComfyUI 工作流',exact:true}).click();await expect(page.getByRole('dialog',{name:'ComfyUI 工作流'})).toBeVisible();await page.getByText('查看完整 JSON',{exact:true}).click();await expect(page.locator('.workflow-viewer pre')).toContainText('普通话对白，轻微雨声');await page.keyboard.press('Escape');await page.getByRole('button',{name:'保存剧本',exact:true}).click();await page.reload();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await page.getByRole('button',{name:'01 橘猫 固定 · 5s',exact:true}).click();await expect(page.getByLabel('声音输出',{exact:true})).toHaveValue('native');await expect(page.getByLabel('声音描述',{exact:true})).toHaveValue('普通话对白，轻微雨声');expect((await(await page.request.get('/api/v1/jobs')).json()).some((j:any)=>j.projectId===p.id)).toBe(false);await expect(page.locator('.metric-memory .metric-bar')).toHaveCount(1);await expect(page.locator('.metric-gpu .metric-bar').first()).toBeVisible();await expect(page.locator('.metric-vram .metric-bar').first()).toBeVisible();await page.getByLabel('声音输出',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/shot-sound-settings.png'});});

test('project video settings persist and workflow uses selected ratios and sampling while usage bars reflect proportions',async({page})=>{await page.route('**/api/v1/resources',r=>r.fulfill({json:{sampledAt:new Date().toISOString(),scope:'本机资源',cpuPercent:25,memoryUsedBytes:8e9,memoryTotalBytes:32e9,gpus:[{index:0,name:'Test GPU',utilization:50,memoryUsedMB:2000,memoryTotalMB:8000,temperatureC:45}],gpuError:null}}));const p=await editableProject(page);await page.getByRole('button',{name:'项目设定',exact:true}).click();await expect(page.getByLabel('采样步数',{exact:true})).toHaveValue('4');await expect(page.getByLabel('输出帧率',{exact:true})).toHaveValue('24');for(const ratio of ['4:3','3:4','3:2','2:3','21:9'])await page.getByLabel('画面比例',{exact:true}).selectOption(ratio);await page.getByLabel('生成分辨率',{exact:true}).selectOption('0.9');await page.getByLabel('生成分辨率',{exact:true}).selectOption('1.1');await page.getByLabel('采样器',{exact:true}).selectOption('heun');await page.getByLabel('采样步数',{exact:true}).fill('8');await page.getByLabel('输出帧率',{exact:true}).selectOption('30');await page.getByRole('button',{name:'保存剧本',exact:true}).click();await expect(page.getByText('剧本已保存',{exact:true})).toBeVisible();await page.reload();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await page.getByRole('button',{name:'项目设定',exact:true}).click();await expect(page.getByLabel('画面比例',{exact:true})).toHaveValue('21:9');await expect(page.getByLabel('采样步数',{exact:true})).toHaveValue('8');await expect(page.getByLabel('输出帧率',{exact:true})).toHaveValue('30');await page.getByRole('button',{name:'查看 ComfyUI 工作流',exact:true}).click();await page.getByText('查看完整 JSON',{exact:true}).click();await expect(page.locator('.workflow-viewer pre')).toContainText('21:9 (Ultrawide)');await expect(page.locator('.workflow-viewer pre')).toContainText('"steps": 8');await expect(page.locator('.workflow-viewer pre')).toContainText('"sampler_name": "heun"');await page.keyboard.press('Escape');await expect(page.locator('.metric-cpu .metric-bar')).toHaveAttribute('aria-valuenow','25');await expect(page.locator('.metric-memory .metric-bar')).toHaveAttribute('aria-valuenow','25');await expect(page.locator('.metric-gpu .metric-bar')).toHaveAttribute('aria-valuenow','50');await expect(page.locator('.metric-vram .metric-bar')).toHaveAttribute('aria-valuenow','25');await expect(page.locator('.metric-gpu .metric-bar-fill')).toHaveAttribute('style','height: 50%;');const saved=await(await page.request.get('/api/v1/projects/'+p.id)).json();expect(saved.fps).toBe(30);await page.screenshot({path:'docs/screenshots/project-video-settings.png',fullPage:true});});

test('sidebar queue activity follows running tasks and resource meters fill vertically',async({page})=>{let status='running';await page.route('**/api/v1/jobs',r=>r.fulfill({json:[{id:'nav-running',projectId:'test',shotId:'shot',shot:{title:'导航任务',duration:5},status,createdAt:new Date().toISOString(),startedAt:status==='running'?new Date().toISOString():undefined}]}));await page.goto('/');const nav=page.locator('.sidebar nav');await expect(nav.locator('.nav-running-icon.spin')).toHaveCount(1);await expect(nav.locator('.nav-count-running')).toHaveText('1');await expect(page.locator('.metric-memory .metric-bar')).toHaveAttribute('aria-orientation','vertical');expect(await page.locator('.metric-memory .metric-bar').evaluate(el=>el.getBoundingClientRect().height>el.getBoundingClientRect().width)).toBe(true);await page.screenshot({path:'docs/screenshots/queue-nav-activity.png'});status='queued';await page.reload();await expect(nav.locator('.nav-count')).toHaveText('1');await expect(nav.locator('.nav-running-icon')).toHaveCount(0);});

test('top queue clock sums current batch processing time and excludes historical batches',async({page})=>{const now=Date.now();await page.route('**/api/v1/jobs',r=>r.fulfill({json:[{id:'history',projectId:'p',requestKey:'old',shot:{title:'old',duration:5},shotId:'old',status:'succeeded',createdAt:new Date(now-1e6).toISOString(),startedAt:new Date(now-1e6).toISOString(),completedAt:new Date(now-9e5).toISOString()},{id:'one',projectId:'p',requestKey:'current',shot:{title:'one',duration:5},shotId:'one',status:'succeeded',createdAt:new Date(now-60000).toISOString(),startedAt:new Date(now-50000).toISOString(),completedAt:new Date(now-45000).toISOString()},{id:'two',projectId:'p',requestKey:'current',shot:{title:'two',duration:5},shotId:'two',status:'running',createdAt:new Date(now-60000).toISOString(),startedAt:new Date(now-20000).toISOString()}]}));await page.goto('/');const clock=page.getByRole('button',{name:'当前队列耗时',exact:true});await expect(clock).toContainText(/00:00:2[5-9]/);await expect(page.locator('.metric-memory .metric-taper')).toHaveCount(1);await clock.click();await expect(page.getByRole('heading',{name:'每一帧，都在路上。'})).toBeVisible();await page.screenshot({path:'docs/screenshots/queue-clock-taper.png'});});

test('queue navigation resets scroll and header uses leading diagonal right triangles with short queue label',async({page})=>{await page.route('**/api/v1/jobs',r=>r.fulfill({json:Array.from({length:35},(_,i)=>({id:'scroll-'+i,projectId:'mock',shotId:'s'+i,shot:{title:'任务 '+i,duration:5},status:'succeeded',createdAt:new Date().toISOString()}))}));await editableProject(page);await expect(page.getByRole('heading',{name:'镜头设定',exact:true})).toBeVisible();await page.evaluate(()=>window.scrollTo(0,1200));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);await page.getByRole('button',{name:'生成队列',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);const clock=page.getByRole('button',{name:'当前队列耗时',exact:true});await expect(clock.locator('span')).toHaveText('队列');const triangle=page.locator('.metric-memory .metric-taper');expect(await triangle.evaluate(el=>getComputedStyle(el).clipPath)).toMatch(/polygon\(100% 0/);await page.evaluate(()=>window.scrollTo(0,1300));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);await clock.click();await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);await page.screenshot({path:'docs/screenshots/queue-right-triangle.png'});});

test('monitor header shows live project generation settings and visual style',async({page})=>{await editableProject(page);await page.getByRole('button',{name:'项目设定',exact:true}).click();await page.getByLabel('画面比例',{exact:true}).selectOption('4:3');await page.getByLabel('生成分辨率',{exact:true}).selectOption('0.9');await page.getByLabel('采样器',{exact:true}).selectOption('heun');await page.getByLabel('采样步数',{exact:true}).fill('8');await page.getByLabel('输出帧率',{exact:true}).selectOption('30');await page.getByLabel('视觉风格',{exact:true}).fill('水彩电影');const info=page.getByRole('group',{name:'项目生成参数',exact:true});for(const text of ['4:3 / H3','0.9 MP','heun','8 步','30 fps','1 个场景','风格：水彩电影'])await expect(info).toContainText(text);await info.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/monitor-project-settings.png'});});

test('single-shot generation stays in workbench, scrolls to monitor and both buttons submit the selected tail',async({page})=>{await page.route('**/api/v1/readiness*',r=>r.fulfill({json:{...missingPreparation,planningReady:true,videoReady:true,items:missingPreparation.items.map(i=>({...i,state:'ready'}))}}));const p=await editableProject(page);let submitted:any=null,count=0;const source={id:'source-tail',projectId:p.id,shotId:'old',shot:{title:'已完成来源镜头',duration:5},status:'succeeded',createdAt:new Date().toISOString()};const accepted=()=>({id:'accepted-'+count,projectId:p.id,shotId:'shot1',shot:{title:'橘猫',duration:5},status:'queued',createdAt:new Date().toISOString()});await page.route('**/api/v1/jobs',r=>r.fulfill({json:count?[source,accepted()]:[source]}));await page.route('**/api/v1/projects/*/jobs',r=>{submitted=r.request().postDataJSON();count++;return r.fulfill({status:202,json:[accepted()]});});await page.reload();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await page.getByLabel('生成方式',{exact:true}).selectOption('text');await page.getByLabel('可选镜头尾帧',{exact:true}).check();await expect(page.getByLabel('尾帧来源',{exact:true})).toHaveValue('auto');await page.getByLabel('尾帧来源',{exact:true}).selectOption('source-tail');await expect(page.getByRole('button',{name:'生成此镜头',exact:true})).toHaveCount(2);await page.getByRole('button',{name:'生成此镜头',exact:true}).last().click();await expect.poll(()=>count).toBe(1);expect(submitted.tailSource).toBe('source-tail');await expect(page.locator('.workbench-heading')).toBeVisible();await expect(page.locator('.sidebar .nav-item.active')).toHaveText('导演工作台');await expect.poll(async()=>Math.round((await page.locator('.preview-panel').boundingBox())!.y)).toBeGreaterThanOrEqual(70);await expect.poll(async()=>Math.round((await page.locator('.preview-panel').boundingBox())!.y)).toBeLessThanOrEqual(110);await expect(page.locator('.monitor-task-feedback')).toContainText('等待生成');await page.locator('.shot-detail .panel-heading .generate-shot-button').click();await expect.poll(()=>count).toBe(2);await expect(page.locator('.sidebar .nav-item.active')).toHaveText('导演工作台');await page.screenshot({path:'docs/screenshots/workbench-selected-tail.png'});});

test('export stays in workbench with progress, download result and visible failure while prompt and sound defaults update',async({page})=>{await page.route('**/api/v1/readiness*',r=>r.fulfill({json:{...missingPreparation,planningReady:true,videoReady:true,exportReady:true,items:missingPreparation.items.map(i=>({...i,state:'ready'}))}}));const p=await editableProject(page);let count=0,phase='running';const op=()=>({id:'export-'+count,kind:'export',projectId:p.id,status:phase,progress:phase==='running'?40:100,message:phase==='failed'?'测试导出失败原因':phase==='completed'?'已完成':'正在处理镜头 1 / 1',result:phase==='completed'?{path:'projects/'+p.id+'/outputs/film.mp4',clips:1}:undefined,updatedAt:new Date().toISOString()});await page.route('**/api/v1/jobs',r=>r.fulfill({json:[{id:'done-export',projectId:p.id,shotId:'shot1',shot:{title:'橘猫',duration:5},status:'succeeded',output:'projects/'+p.id+'/outputs/clip.mp4',createdAt:new Date().toISOString()}]}));await page.route('**/api/v1/operations',r=>r.fulfill({json:count?[op()]:[]}));await page.route('**/api/v1/projects/*/export',r=>{count++;if(phase==='request-error')return r.fulfill({status:503,json:{error:'测试请求失败'} });return r.fulfill({status:202,json:{id:'export-'+count,status:'running'}});});await page.reload();await page.getByRole('button',{name:'导演工作台',exact:true}).click();await expect(page.getByLabel('声音输出',{exact:true})).toHaveValue('native');await expect(page.getByLabel('生成提示词',{exact:true})).toHaveValue('integrated_multimodal_description: 橘猫走过街道\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A');await page.getByRole('button',{name:'导出成片',exact:true}).click();const result=page.getByRole('region',{name:'成片导出结果',exact:true});await expect(result.getByRole('progressbar')).toHaveAttribute('value','40');await expect(page.locator('.sidebar .nav-item.active')).toHaveText('导演工作台');phase='completed';await expect(result.getByRole('link',{name:'下载成片',exact:true})).toBeInViewport({ratio:1});await expect(result).toContainText('包含 1 个镜头');await page.screenshot({path:'docs/screenshots/export-result.png'});phase='failed';await page.getByRole('button',{name:'导出成片',exact:true}).click();await expect(result).toContainText('成片导出失败');await expect(result).toContainText('测试导出失败原因');phase='cancelled';await page.getByRole('button',{name:'导出成片',exact:true}).click();await expect(result).toContainText('成片导出已取消');phase='request-error';await page.getByRole('button',{name:'导出成片',exact:true}).click();await expect(result).toContainText('测试请求失败');});

test('import actions sit in their headings and new shots can be dragged, saved and reopened',async({page})=>{
await editableProject(page);
await expect(page.locator('.script-panel .tabs').getByRole('button',{name:'导入剧本',exact:true})).toBeVisible();
await expect(page.locator('.shot-panel > .panel-heading').getByRole('button',{name:'导入分镜',exact:true})).toBeVisible();
await page.getByRole('button',{name:'添加手动镜头',exact:true}).click();
await page.getByLabel('镜头标题',{exact:true}).fill('新增分镜');
const rows=page.locator('.shot-item');
await rows.last().dragTo(rows.first(),{targetPosition:{x:20,y:5}});
await expect(rows.first()).toContainText('新增分镜');
await expect(page.getByLabel('镜头标题',{exact:true})).toHaveValue('新增分镜');
await page.getByLabel('生成提示词',{exact:true}).fill('新增分镜的画面');
await rows.first().focus();await page.keyboard.press('Alt+ArrowDown');
await expect(rows.last()).toContainText('新增分镜');
await rows.last().dragTo(rows.first(),{targetPosition:{x:20,y:5}});
await expect(rows.first()).toContainText('新增分镜');
await page.getByRole('button',{name:'保存剧本',exact:true}).click();
await expect(page.getByText('剧本已保存',{exact:true})).toBeVisible();
await page.reload();await page.getByRole('button',{name:'导演工作台',exact:true}).click();
await expect(page.locator('.shot-item').first()).toContainText('新增分镜');
await expect(page.locator('.shot-item').last()).toContainText('橘猫');
});

test('example project opens with historical jobs and is reused without duplicates',async({page})=>{await page.route('**/api/v1/jobs',r=>r.fulfill({json:[{id:'historical',projectId:'another',shotId:'old',shot:{title:'old'},status:'succeeded'}]}));await page.goto('/');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.getByRole('button',{name:'试试示例剧本',exact:true}).click();await expect(page.locator('.workbench-heading')).toBeVisible();const first=await page.evaluate(()=>localStorage.getItem('nana-project'));await page.getByRole('button',{name:'工作室总览',exact:true}).click();await page.getByRole('button',{name:'试试示例剧本',exact:true}).click();await expect(page.locator('.workbench-heading')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('nana-project'))).toBe(first);expect(errors).toEqual([]);});

test('about contains offline donation images and previews close back to the page',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByRole('heading',{name:'软件信息',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'关于',exact:true}).click();await expect(page.getByText('qindakun@yahoo.com',{exact:true})).toBeVisible();for(const name of ['PayPal','微信']){const img=page.getByRole('img',{name:name+' 捐赠二维码',exact:true});await expect(img).toBeVisible();expect(await img.evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth>0)).toBe(true);await page.getByRole('button',{name:'放大 '+name+' 捐赠二维码',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);}await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'docs/screenshots/about-donations.png',fullPage:true});});
