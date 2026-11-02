import {formatPrompt,visualDescription} from './prompt-template.mjs';
import {ASPECTS,videoSettings} from './video-settings.mjs';
// Adapted from Nana_Animation_auto standard workflow, MIT, commit 9c022d3.
// Copyright (c) 2026 Indimor / 娜乌斯嘉. See vendor/nana/LICENSE.
import { AppError } from "./security.mjs";
const node = (class_type, inputs) => ({ class_type, inputs });
export function buildWorkflow(
  shot,
  project,
  imageNames = [],
  firstAsFrame = false,
  referenceLabels = [],
) {
  if (
    !visualDescription(shot.prompt) ||
    !Number.isInteger(shot.duration) ||
    shot.duration < 2 ||
    shot.duration > 15
  )
    throw new AppError("镜头提示词或时长无效");
  if(shot.soundMode!==undefined&&!['silent','native'].includes(shot.soundMode))throw new AppError('声音输出设置无效');
  if(shot.soundPrompt!==undefined&&(typeof shot.soundPrompt!=='string'||shot.soundPrompt.length>2000))throw new AppError('声音描述无效或过长');
  if (imageNames.length > 9) throw new AppError("最多使用 9 张参考图");
  const config=videoSettings(project);
  const type = imageNames.length
    ? firstAsFrame
      ? imageNames.length === 1
        ? "I2VA"
        : "Hybrid"
      : "Ref2VA"
    : "T2VA";
  const bindings = imageNames.map((_,i)=>{
    const label=referenceLabels[i]||'参考图片';
    return firstAsFrame&&i===0 ? `First frame / 首帧：${label}。从此画面开始运动，保持主体外观。` : `<Picture ${firstAsFrame?i:i+1}>: ${label}。保持此参考主体的身份、外观、服装与特征，不创建替代人物。`;
  }).join('\n');
  let formatted=formatPrompt(shot.prompt);
  if(shot.soundMode!=='silent'&&shot.soundPrompt?.trim())formatted=formatted.replace(/^overall_soundscape:[ \t]*([^\r\n]*)/im,(_,existing)=>'overall_soundscape: '+(existing.trim()&&existing.trim()!=='N/A'?existing.trim()+'; ':'')+shot.soundPrompt.trim());
  const directions=(bindings?'\nVisual references / 图片对应关系:\n'+bindings:'')+(shot.camera?.trim()?'\nCamera direction / 镜头语言: '+shot.camera.trim():'');
  const boundary=formatted.search(/\r?\n[ \t]*(?:overall_soundscape|non_diegetic_music)[ \t]*:/i);
  const prompt=(directions&&boundary>=0?formatted.slice(0,boundary)+directions+formatted.slice(boundary):formatted+directions).replace(/@?图片?\s*([1-9])/g,'<Picture $1>');
  const conditioning = {
    prompt: ["36", 0],
    width: ["16", 0],
    height: ["16", 1],
    length: ["15", 1],
    task_type: type,
    audio_mode: "native",
    audio_denoise_strength: 1,
    add_source_as_reference: false,
    prompt_primary_audio_ordinal: 0,
    strict_prompt_tags: true,
    ref_image_size: "match",
    reference_video_policy: "official_2_to_15s",
    clip: ["3", 0],
    video_vae: ["4", 0],
    audio_vae: ["5", 0],
  };
  const graph = {
    1: node("UNETLoader", {
      unet_name: "minimax_h3_fl2va_int8_convrot.safetensors",
      weight_dtype: "default",
    }),
    2: node("LoraLoaderBypassModelOnly", {
      lora_name:
        "minimax_h3_fl2v_turbo_4step_v0.1_comfyui_alpha8-T8-convert.safetensors",
      strength_model: 1,
      model: ["1", 0],
    }),
    3: node("CLIPLoader", {
      clip_name: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      type: "minimax",
      device: "default",
    }),
    4: node("VAELoader", { vae_name: "minimax_h3_video_vae_fp16.safetensors" }),
    5: node("VAELoader", { vae_name: "minimax_h3_audio_vae_fp32.safetensors" }),
    6: node("MiniMaxH3AudioConditioningT8", conditioning),
    7: node("MiniMaxH3DualClockSamplerT8", {
      steps: config.steps,
      ...(config.sampler!=="dual_clock_euler"?{sampler_name:config.sampler}:{}),
      shift_video: 12,
      shift_audio: 3,
      model: ["2", 0],
      av_latent: ["6", 1],
    }),
    8: node("BasicGuider", { model: ["7", 0], conditioning: ["6", 0] }),
    9: node("RandomNoise", {
      noise_seed: Number.isSafeInteger(shot.seed) ? shot.seed : 123456789,
    }),
    10: node("SamplerCustomAdvanced", {
      noise: ["9", 0],
      guider: ["8", 0],
      sampler: ["7", 1],
      sigmas: ["7", 2],
      latent_image: ["6", 1],
    }),
    11: node("MiniMaxH3AVDecodeT8", {
      av_latent: ["10", 0],
      video_vae: ["4", 0],
      audio_vae: ["5", 0],
    }),
    12: node("VHS_VideoCombine", {
      frame_rate: 24,
      loop_count: 0,
      filename_prefix: `NanaPro/${project.id}`,
      format: "video/h264-mp4",
      pix_fmt: "yuv420p",
      crf: 19,
      save_metadata: true,
      trim_to_audio: false,
      pingpong: false,
      save_output: true,
      images: ["11", 0],
      ...(shot.soundMode !== "silent" ? {audio: ["11", 1]} : {}),
    }),
    14: node("PrimitiveFloat", { value: shot.duration }),
    15: node("ComfyMathExpression", {
      expression:
        "max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17",
      "values.a": ["14", 0],
    }),
    16: node("ResolutionSelector", {
      aspect_ratio: ASPECTS[config.aspectRatio],
      megapixels: config.megapixels,
      multiple: 32,
    }),
    36: node("CR Prompt Text", { prompt }),
  };
  imageNames.forEach((name, index) => {
    const id = String(41 + index);
    graph[id] = node("LoadImage", { image: name });
    if (firstAsFrame && index === 0) conditioning.first_frame = [id, 0];
    else
      conditioning[`ref_images.ref_image_${firstAsFrame ? index - 1 : index}`] =
        [id, 0];
  });
  return graph;
}
export function preflight(graph, objectInfo) {
  const errors = [];
  for (const n of Object.values(graph)) {
    const info = objectInfo[n.class_type];
    if (!info) {
      errors.push(`缺少节点 ${n.class_type}`);
      continue;
    }
    const definitions = { ...info.input?.required, ...info.input?.optional };
    for (const [key, value] of Object.entries(n.inputs)) {
      const choices = definitions[key]?.[0];
      if (
        Array.isArray(choices) &&
        !Array.isArray(value) &&
        !choices.includes(value)
      )
        errors.push(`${n.class_type}.${key} 不支持 ${value}`);
    }
    for (const [key, definition] of Object.entries(info.input?.required || {})) {
      if(definition?.[0]==='COMFY_AUTOGROW_V3') {
        const template=definition[1]?.template||{};
        const names=Object.keys(n.inputs).filter(input=>input.startsWith(key+'.')).map(input=>input.slice(key.length+1));
        if(names.length>=(template.min??1)&&names.every(name=>!Array.isArray(template.names)||template.names.includes(name)))continue;
      }
      if (
        !Object.hasOwn(n.inputs, key) &&
        !definition?.[1]?.default &&
        definition?.[1]?.default !== 0 &&
        definition?.[1]?.default !== false
      )
        errors.push(`${n.class_type} 缺少输入 ${key}`);
    }
  }
  return { ready: !errors.length, errors: [...new Set(errors)] };
}
