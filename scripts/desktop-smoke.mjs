import { _electron as electron, expect } from "@playwright/test";
import { mkdirSync, existsSync, mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const app = await electron.launch({
  ...(process.argv[2]
    ? { executablePath: path.resolve(process.argv[2]), args: [] }
    : { args: ["."] }),
  env: {
    ...process.env,
    NANA_SMOKE_SPLASH:'1',
    NANA_SMOKE_ROOT: mkdtempSync(path.join(os.tmpdir(), "nana-desktop-")),
  },
});
try {
  const startup = await app.firstWindow();
  await startup.locator('.line').waitFor();
  console.log('Visible animated startup window: PASS');
  await expect.poll(()=>app.windows().some(p=>p.url().startsWith('http://127.0.0.1:')),{timeout:30000}).toBe(true);
  const page=app.windows().find(p=>p.url().startsWith('http://127.0.0.1:'));
  await page
    .locator(".hero")
    .waitFor({ timeout: 30000 });
  const version=await app.evaluate(({app})=>app.getVersion());
  if(!(await page.title()).includes("v"+version))throw new Error("Desktop title is missing package version");
  const isolated = await page.evaluate(
    () => typeof window.require === "undefined" && !!window.nanaDesktop,
  );
  if (!isolated) throw new Error("Renderer isolation or preload failed");
  await page.evaluate(async()=>{const {token}=await(await fetch('/api/v1/session')).json();await fetch('/api/v1/projects',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({name:'Historical project'})});});
  await page.route('**/api/v1/jobs',r=>r.fulfill({json:[{id:'historical',projectId:'old',shotId:'old',shot:{title:'old'},status:'succeeded'}]}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'试试示例剧本',exact:true}).click();await expect(page.locator('.workbench-heading')).toBeVisible();
  await page.getByRole('button',{name:'工作室总览',exact:true}).click();await page.getByRole('button',{name:'试试示例剧本',exact:true}).click();await expect(page.locator('.workbench-heading')).toBeVisible();
  if(errors.length)throw new Error(errors.join('\n'));
  await page.getByRole('button',{name:'关于',exact:true}).click();
  await expect(page.locator('.donation-qr img')).toHaveCount(2);for(const image of await page.locator('.donation-qr img').all())await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  console.log('Packaged example with history and About donation images: PASS');
  const appPath=await app.evaluate(({app})=>app.getAppPath());
  const tools = await (async () => {
    const localRequire = createRequire(path.join(appPath,'package.json'));
    const { runProcess } = await import(pathToFileURL(path.join(appPath,'server/process.mjs')).href);
    const ffmpeg = await runProcess(
      localRequire("ffmpeg-static"),
      ["-version"],
      { timeout: 30000 },
    );
    const zip = await runProcess(localRequire("7zip-bin").path7za, ["i"], {
      timeout: 30000,
    });
    const {Media}=await import(pathToFileURL(path.join(appPath,'server/media.mjs')).href);
    const temp=mkdtempSync(path.join(os.tmpdir(),'nana-packed-media-')),dir=path.join(temp,'projects','smoke','outputs');mkdirSync(dir,{recursive:true});
    const source=path.join(dir,'clip.mp4');await runProcess(localRequire('ffmpeg-static'),['-y','-filter_threads','1','-f','lavfi','-i','color=c=blue:s=64x48:d=0.25','-c:v','libx264','-pix_fmt','yuv420p',source]);
    const media=new Media(temp),frame=await media.tail(source),project={id:'smoke',aspectRatio:'4:3',fps:24,plan:{shots:[{id:'s'}]}},exported=await media.export(project,[{projectId:'smoke',shotId:'s',status:'succeeded',output:'projects/smoke/outputs/clip.mp4'}]),backup=await media.backup(project);
    if(!existsSync(frame)||!existsSync(path.join(temp,exported.path))||!existsSync(path.join(temp,backup.path)))throw new Error('Packaged media/archive processing failed');
    return ffmpeg.includes("ffmpeg version") && zip.includes("7-Zip");
  })();
  if (!tools) throw new Error("Bundled media/archive tools did not run");
  console.log("Electron window + local server + sandboxed preload: PASS");
  console.log("Bundled FFmpeg + 7-Zip + actual export, last frame and backup: PASS");
  await page.evaluate(async()=>{const {token}=await(await fetch('/api/v1/session')).json();const response=await fetch('/api/v1/ui-preferences',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({language:'zh-TW'})});if(!response.ok)throw new Error('Failed to switch packaged language');});
  await page.reload();await page.locator('html[lang="zh-TW"]').waitFor();await page.getByRole('button',{name:'設定',exact:true}).click();console.log('Bundled offline Traditional Chinese converter: PASS');
} finally {
  await app.close();
}
