import {formatPrompt,visualDescription} from './prompt-template.mjs';
import { AppError } from "./security.mjs";
import { Ollama } from "./ollama.mjs";

const text = { type: "string" };
const identifier = { type: "string", pattern: "^[a-zA-Z0-9_-]{1,80}$" };
export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "assets", "scenes", "shots"],
  properties: {
    summary: text,
    assets: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "kind", "description"],
        properties: {
          id: identifier,
          name: text,
          kind: { enum: ["character", "location", "prop"] },
          description: text,
        },
      },
    },
    scenes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "title", "description"],
        properties: { id: identifier, title: text, description: text },
      },
    },
    shots: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "id",
          "sceneId",
          "title",
          "prompt",
          "duration",
          "assetIds",
          "camera",
        ],
        properties: {
          id: identifier,
          sceneId: identifier,
          title: text,
          prompt: text,
          duration: { type: "integer", minimum: 2, maximum: 15 },
          assetIds: { type: "array", items: identifier },
          camera: text,
          locked: { type: "boolean" },
          soundMode: {enum:["silent","native"]},
          soundPrompt: {type:"string",maxLength:2000},
        },
      },
    },
  },
};
export function validatePlan(value, {allowAssetDraft=false} = {}) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.scenes) ||
    !Array.isArray(value.shots) ||
    ((!allowAssetDraft || !value.assets.length || value.shots.length>0) && (!value.scenes.length || !value.shots.length)) ||
    value.shots.length > 500
  )
    throw new AppError("规划必须包含 summary、assets、scenes 和非空 shots");
  for (const list of [value.assets, value.scenes, value.shots]) {
    const ids = new Set();
    for (const item of list) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !/^[\w-]{1,80}$/.test(item.id) ||
        ids.has(item.id)
      )
        throw new AppError("规划 ID 不合法或重复");
      ids.add(item.id);
    }
  }
  for (const a of value.assets)
    if (
      typeof a.name !== "string" ||
      !a.name.trim() ||
      typeof a.description !== "string" ||
      !["character", "location", "prop"].includes(a.kind)
    )
      throw new AppError("资产信息不完整");
  for (const s of value.scenes)
    if (typeof s.title !== "string" || typeof s.description !== "string")
      throw new AppError("场景信息不完整");
  const assetIds = new Set(value.assets.map((a) => a.id)),
    sceneIds = new Set(value.scenes.map((s) => s.id));
  for (const s of value.shots) {
    if (
      !sceneIds.has(s.sceneId) ||
      typeof s.title !== "string" ||
      typeof s.camera !== "string" ||
      typeof s.prompt !== "string" ||
      !visualDescription(s.prompt) ||
      s.prompt.length > 14000 ||
      !Number.isInteger(s.duration) ||
      s.duration < 2 ||
      s.duration > 15 ||
      !Array.isArray(s.assetIds) ||
      s.assetIds.some((id) => !assetIds.has(id)) ||
      (s.locked !== undefined && typeof s.locked !== "boolean") ||
      (s.soundMode !== undefined && !["silent","native"].includes(s.soundMode)) ||
      (s.soundPrompt !== undefined && (typeof s.soundPrompt !== "string" || s.soundPrompt.length > 2000))
    )
      throw new AppError("镜头包含无效场景、提示词、时长或资产引用");
  }
  return structuredClone(value);
}
export function splitScript(script, maxLength = 4500) {
  const chunks = [];
  let rest = script;
  while (rest.length > maxLength) {
    let end = rest.lastIndexOf("\n", maxLength);
    if (end < maxLength / 2) end = maxLength;
    else end++;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) chunks.push(rest);
  return chunks;
}
export async function planProject(
  project,
  settings,
  {
    engine = new Ollama(settings.ollamaUrl),
    signal,
    onProgress = () => {},
  } = {},
) {
  if (!project.script?.trim()) throw new AppError("请先保存剧本");
  const chunks = splitScript(project.script);
  const plans = [];
  try {
    for (let i = 0; i < chunks.length; i++) {
      onProgress({
        stage: "planning",
        current: i + 1,
        total: chunks.length,
        message: `正在规划第 ${i + 1}/${chunks.length} 段剧本`,
      });
      const messages = [
        {
          role: "system",
          content:
            "你是本地电影导演。只返回符合提供 JSON Schema 的 JSON，不返回解释。忠实覆盖剧本，禁止编造剧情。每个 shot 是可直接生成的一段 2–15 秒视频，包含景别、运动、动作、光线、声音与对白。ID 用英文数字下划线。人物外观与场景保持一致，assetIds 必须引用 assets 中存在的 ID。中文回答。",
        },
        {
          role: "user",
          content: JSON.stringify({
            style: project.style,
            context: plans
              .map((p) => ({ summary: p.summary, assets: p.assets }))
              .slice(-3),
            part: i + 1,
            total: chunks.length,
            script: chunks[i],
          }),
        },
      ];
      let result, lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        signal?.throwIfAborted();
        const raw = await engine.chat(
          settings.model,
          messages,
          PLAN_SCHEMA,
          signal,
          { device: settings.directorDevice || "auto" },
        );
        try {
          result = validatePlan(
            JSON.parse(
              raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
            ),
          );
          break;
        } catch (e) {
          lastError = e;
          messages.push(
            { role: "assistant", content: raw.slice(0, 24000) },
            {
              role: "user",
              content: `请修复 JSON：${e.message}。必须返回完整合法规划。`,
            },
          );
        }
      }
      if (!result)
        throw new AppError(
          `规划失败：${lastError.message}。请调整剧本或更换本地模型。`,
          422,
        );
      // Locking is an explicit human edit, never a model-owned approval state.
      result.shots.forEach((shot) => {shot.locked=false;shot.soundMode="native";shot.prompt=formatPrompt(shot.prompt);});
      if (chunks.length > 1) {
        const prefix = `p${i + 1}_`;
        result.assets.forEach((a) => (a.id = prefix + a.id));
        result.scenes.forEach((s) => (s.id = prefix + s.id));
        result.shots.forEach((s) => {
          s.id = prefix + s.id;
          s.sceneId = prefix + s.sceneId;
          s.assetIds = s.assetIds.map((id) => prefix + id);
        });
      }
      plans.push(result);
    }
    const merged = {
      summary: plans.map((p) => p.summary).join("\n"),
      assets: plans.flatMap((p) => p.assets),
      scenes: plans.flatMap((p) => p.scenes),
      shots: plans.flatMap((p) => p.shots),
    };
    for (const locked of project.plan?.shots?.filter((s) => s.locked) || []) {
      const index = merged.shots.findIndex((s) => s.id === locked.id);
      if (index >= 0) merged.shots[index] = structuredClone(locked);
      else merged.shots.push(structuredClone(locked));
      if (!merged.scenes.some((s) => s.id === locked.sceneId)) {
        const scene = project.plan.scenes.find((s) => s.id === locked.sceneId);
        if (scene) merged.scenes.push(structuredClone(scene));
      }
      for (const id of locked.assetIds) {
        if (!merged.assets.some((a) => a.id === id)) {
          const asset = project.plan.assets.find((a) => a.id === id);
          if (asset) merged.assets.push(structuredClone(asset));
        }
      }
    }
    return validatePlan(merged);
  } finally {
    // A failed unload must be visible: starting the video model concurrently could exhaust VRAM.
    await engine.unload(settings.model);
  }
}
