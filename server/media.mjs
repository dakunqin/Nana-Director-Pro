import {FPS_OPTIONS,exportDimensions} from './video-settings.mjs';
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError, safePath } from "./security.mjs";
import { runProcess } from "./process.mjs";
const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static"),
  { path7za } = require("7zip-bin");
export function exportFilename(name){let text=String(name||'project').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.mp4$/i,'').replace(/[. ]+$/g,'').trim();if(!text)text='project';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(text))text='_'+text;while(Buffer.byteLength(text,'utf8')>180)text=Array.from(text).slice(0,-1).join('');return text+'.mp4';}
export class Media {
  constructor(root) {
    this.root = root;
  }
  async convertFrameRate(video,fps){
    if(!FPS_OPTIONS.includes(fps))throw new AppError('输出帧率无效');if(fps===24)return;
    const temp=video+'.fps-'+randomUUID()+'.mp4';
    try{await runProcess(ffmpeg,['-y','-filter_threads','1','-threads','2','-i',video,'-map','0:v:0','-map','0:a?','-vf','fps='+fps,'-c:v','libx264','-threads','2','-preset','fast','-crf','19','-c:a','copy','-movflags','+faststart',temp],{timeout:600000});renameSync(temp,video);}finally{rmSync(temp,{force:true});}
  }
  async tail(video) {
    const file = video + ".tail.png";
    await runProcess(
      ffmpeg,
      [
        "-filter_threads",
        "1",
        "-threads",
        "2",
        "-y",
        "-sseof",
        "-0.5",
        "-i",
        video,
        "-vf",
        "reverse",
        "-frames:v",
        "1",
        "-threads",
        "1",
        file,
      ],
      { timeout: 120000 },
    );
    return file;
  }
  async export(project, jobs, { partial = false, onProgress = ()=>{} } = {}) {
    const selected = (project.plan?.shots || []).map((shot) =>
      jobs
        .filter(
          (j) =>
            j.projectId === project.id &&
            j.shotId === shot.id &&
            j.status === "succeeded" &&
            j.output,
        )
        .at(-1),
    );
    if (!selected.some(Boolean)) throw new AppError("没有可导出的视频片段");
    if (selected.some((j) => !j) && !partial)
      throw new AppError("缺少已完成的镜头，请先生成或选择仅导出已完成片段");
    const id = randomUUID(),
      dir = safePath(this.root, `projects/${project.id}/outputs/export-${id}`);
    mkdirSync(dir, { recursive: true });
    const clips = [],total=selected.filter(Boolean).length;
    onProgress({progress:3,message:"正在准备成片导出"});
    const [width,height]=exportDimensions(project.aspectRatio);
    const fps=project.fps??24;if(!FPS_OPTIONS.includes(fps))throw new AppError('输出帧率无效');
    for (const job of selected.filter(Boolean)) {
      onProgress({progress:Math.round(5+clips.length/total*80),message:`正在处理镜头 ${clips.length+1} / ${total}`});
      const input = safePath(this.root, job.output);
      if (!existsSync(input)) throw new AppError("成片文件缺失");
      const output = path.join(dir, `clip-${clips.length}.mp4`);
      const base = [
        "-filter_threads",
        "1",
        "-filter_complex_threads",
        "1",
        "-threads",
        "2",
        "-y",
        "-i",
        input,
      ];
      // Normalize both silent and audio-bearing sources to identical video/audio streams.
      let hasAudio = true;
      try {
        await runProcess(
          ffmpeg,
          [
            "-v",
            "error",
            "-i",
            input,
            "-map",
            "0:a:0",
            "-t",
            "0.01",
            "-f",
            "null",
            "-",
          ],
          { timeout: 30000 },
        );
      } catch {
        hasAudio = false;
      }
      if (!hasAudio)
        base.push(
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
        );
      await runProcess(ffmpeg, [
        ...base,
        "-map",
        "0:v:0",
        "-map",
        hasAudio ? "0:a:0" : "1:a:0",
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        "-r",
        String(fps),
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-shortest",
        "-movflags",
        "+faststart",
        output,
      ]);
      clips.push(output);
      onProgress({progress:Math.round(5+clips.length/total*80),message:`已处理镜头 ${clips.length} / ${total}`});
    }
    onProgress({progress:90,message:"正在合并镜头并保存成片"});
    const list = path.join(dir, "concat.txt");
    writeFileSync(
      list,
      clips.map((p) => `file '${path.basename(p)}'`).join("\n"),
    );
    const dest = path.join(dir, exportFilename(project.name));
    await runProcess(
      ffmpeg,
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        list,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        dest,
      ],
      { cwd: dir },
    );
    onProgress({progress:100,message:"成片已导出，可下载"});
    return {
      path: path.relative(this.root, dest).split(path.sep).join("/"),
      partial,
      clips: clips.length,
    };
  }
  async backup(project) {
    const dir = safePath(this.root, `projects/${project.id}`);
    writeFileSync(
      path.join(dir, "project.json"),
      JSON.stringify(project, null, 2),
    );
    const dest = safePath(this.root, `backups/${project.id}-${Date.now()}.zip`);
    mkdirSync(path.dirname(dest), { recursive: true });
    await runProcess(path7za, ["a", "-tzip", "-mmt=1", dest, "."], {
      cwd: dir,
    });
    return { path: path.relative(this.root, dest).split(path.sep).join("/") };
  }
}
