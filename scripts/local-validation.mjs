import { writeFileSync, mkdirSync } from "node:fs";
import { planProject } from "../server/planner.mjs";
import { Ollama } from "../server/ollama.mjs";
const model = process.argv[2] || "qwen3:14b";
const engine = new Ollama("http://127.0.0.1:11434");
const status = await engine.status();
if (!status.online || !status.models.some((m) => m.name === model))
  throw new Error("需要已安装的本地 " + model + " 模型");
const started = Date.now();
const plan = await planProject(
  {
    script:
      "第一场：清晨的旧书店。一只橘猫跳上窗台，安静地望向街道。第二场：书店门口。一个穿浅蓝色外套的女孩推门走入，轻声说：“早上好。”猫回头看她。",
    style: "电影级写实，柔和自然光，宁静温暖",
    plan: null,
  },
  { model, ollamaUrl: engine.url },
  { engine, onProgress: (p) => console.log(p.message) },
);
mkdirSync("data/validation", { recursive: true });
writeFileSync("data/validation/local-plan.json", JSON.stringify(plan, null, 2));
console.log(
  JSON.stringify({
    model,
    seconds: (Date.now() - started) / 1000,
    scenes: plan.scenes.length,
    shots: plan.shots.length,
    assets: plan.assets.length,
  }),
);
