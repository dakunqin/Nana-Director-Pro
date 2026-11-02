import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Media } from "../server/media.mjs";
import { runProcess } from "../server/process.mjs";
const require = createRequire(import.meta.url),
  ffmpeg = require("ffmpeg-static");
test("real FFmpeg export normalizes silent clips, adds audio and produces a playable MP4", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "nana-ffmpeg-")),
    dir = path.join(root, "projects", "test", "outputs");
  mkdirSync(dir, { recursive: true });
  const media = new Media(root);
  for (const [name, size] of [
    ["a", "320x180"],
    ["b", "240x240"],
  ])
    await runProcess(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=green:s=${size}:d=0.3`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      path.join(dir, name + ".mp4"),
    ]);
  const project = {
    id: "test",
    aspectRatio: "16:9",
    plan: { shots: [{ id: "s1" }, { id: "s2" }] },
  };
  const jobs = [
    {
      projectId: "test",
      shotId: "s1",
      status: "succeeded",
      output: "projects/test/outputs/a.mp4",
    },
    {
      projectId: "test",
      shotId: "s2",
      status: "succeeded",
      output: "projects/test/outputs/b.mp4",
    },
  ];
  const result = await media.export(project, jobs);
  const dest = path.join(root, result.path);
  assert.equal(result.clips, 2);
  assert.ok(statSync(dest).size > 1000);
  await runProcess(ffmpeg, [
    "-v",
    "error",
    "-i",
    dest,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-f",
    "null",
    "-",
  ]);
  assert.ok(existsSync(await media.tail(dest)));
  assert.ok(existsSync(path.join(root, (await media.backup(project)).path)));
});

test('frame-rate conversion preserves duration and audio, and export keeps extended aspect and fps',async()=>{const root=mkdtempSync(path.join(tmpdir(),'nana-fps-')),dir=path.join(root,'projects','p','outputs');mkdirSync(dir,{recursive:true});const file=path.join(dir,'clip.mp4'),media=new Media(root);await runProcess(ffmpeg,['-y','-f','lavfi','-i','color=c=blue:s=320x240:r=24:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac','-shortest',file]);await media.convertFrameRate(file,30);const converted=await runProcess(ffmpeg,['-i',file,'-f','null','-']);assert.match(converted,/30 fps/);assert.match(converted,/Audio:/);assert.match(converted,/Duration: 00:00:01/);const result=await media.export({id:'p',aspectRatio:'4:3',fps:30,plan:{shots:[{id:'s'}]}},[{projectId:'p',shotId:'s',status:'succeeded',output:'projects/p/outputs/clip.mp4'}]);const info=await runProcess(ffmpeg,['-i',path.join(root,result.path),'-f','null','-']);assert.match(info,/1024x768/);assert.match(info,/30 fps/);});

test('tail extraction uses the actual final decoded frame',async()=>{const root=mkdtempSync(path.join(tmpdir(),'nana-lastframe-')),file=path.join(root,'short.mp4'),expected=path.join(root,'expected.png');await runProcess(ffmpeg,['-y','-filter_threads','1','-f','lavfi','-i','testsrc=size=32x32:rate=24:duration=0.25','-c:v','libx264','-pix_fmt','yuv420p',file]);await runProcess(ffmpeg,['-y','-filter_threads','1','-i',file,'-vf','select=eq(n\\,5)','-frames:v','1',expected]);const actual=await new Media(root).tail(file);const {readFileSync}=await import('node:fs');assert.deepEqual(readFileSync(actual),readFileSync(expected));});

test('export reports real processing stages before returning the file',async()=>{const root=mkdtempSync(path.join(tmpdir(),'nana-export-progress-')),dir=path.join(root,'projects','p','outputs');mkdirSync(dir,{recursive:true});await runProcess(ffmpeg,['-y','-filter_threads','1','-f','lavfi','-i','color=s=64x48:d=0.2','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'s.mp4')]);const updates=[];const result=await new Media(root).export({id:'p',name:'中文成片',aspectRatio:'16:9',plan:{shots:[{id:'s'}]}},[{projectId:'p',shotId:'s',status:'succeeded',output:'projects/p/outputs/s.mp4'}],{onProgress:p=>updates.push(p)});assert.ok(updates.some(p=>p.progress>0&&p.progress<100));assert.ok(updates.some(p=>/镜头.*1/.test(p.message)));assert.equal(path.basename(result.path),'中文成片.mp4');assert.equal(updates.at(-1).progress,100);assert.ok(existsSync(path.join(root,result.path)));});

test('project export filenames preserve Chinese and sanitize unsafe or reserved names',async()=>{const {exportFilename}=await import('../server/media.mjs');assert.equal(exportFilename('我的电影'),'我的电影.mp4');assert.equal(exportFilename('我的电影.mp4'),'我的电影.mp4');assert.equal(exportFilename('a/b:c*?'),'a_b_c__.mp4');assert.equal(exportFilename('CON'),'_CON.mp4');assert.ok(Buffer.byteLength(exportFilename('猫'.repeat(120)))<255);});
