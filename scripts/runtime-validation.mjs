import path from "node:path";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, createWriteStream } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../server/store.mjs";
import { Ollama } from "../server/ollama.mjs";
import { Comfy } from "../server/comfy.mjs";
import { buildWorkflow } from "../server/workflow.mjs";
import { planProject } from "../server/planner.mjs";
const root = path.resolve("data/acceptance"),
  store = new Store(root),
  installed = store.get("environment", "installed");
if (!installed) throw new Error("Run install-validation first");
const log = createWriteStream(
  path.join(root, "logs", "runtime-validation.log"),
);
const processes = [];
function launch(exe, args, cwd, env) {
  const p = spawn(exe, args, {
    cwd,
    windowsHide: true,
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
      OLLAMA_VULKAN: "false",
      ...env,
    },
  });
  p.stdout.pipe(log, { end: false });
  p.stderr.pipe(log, { end: false });
  processes.push(p);
  return p;
}
const ollama = new Ollama("http://127.0.0.1:11435"),
  comfy = new Comfy("http://127.0.0.1:18188");
async function wait(client) {
  for (let i = 0; i < 90; i++) {
    if (processes.some((p) => p.exitCode !== null))
      throw new Error("Runtime process exited; inspect runtime-validation.log");
    if ((await client.status()).online) return;
    await delay(2000);
  }
  throw new Error("Runtime did not become healthy");
}
try {
  if (!process.argv.includes("--comfy-only")) {
    const raw = [];
    const originalChat = ollama.chat.bind(ollama);
    ollama.chat = async (...args) => {
      const result = await originalChat(...args);
      raw.push(result);
      writeFileSync(
        path.join(root, "raw-planning.json"),
        JSON.stringify(raw, null, 2),
      );
      return result;
    };
    launch(installed.ollama, ["serve"], path.dirname(installed.ollama), {
      OLLAMA_HOST: "127.0.0.1:11435",
      OLLAMA_MODELS: path.join(root, "models", "ollama"),
      OLLAMA_NO_CLOUD: "1",
      CUDA_VISIBLE_DEVICES: "-1",
    });
    await wait(ollama);
    console.log("Managed Ollama health: PASS");
  }
  if (!process.argv.includes("--director-only")) {
    const comfyProcess = launch(
      installed.python,
      ["-s", "main.py", "--cpu", "--listen", "127.0.0.1", "--port", "18188"],
      installed.comfy,
      { CUDA_VISIBLE_DEVICES: "-1" },
    );
    await wait(comfy);
    console.log("Managed ComfyUI health: PASS");
    const info = await comfy.info();
    const graph = buildWorkflow(
      { prompt: "橘猫在街上走过。", duration: 5 },
      { id: "validation", aspectRatio: "16:9", megapixels: 0.5 },
    );
    const missing = [
      ...new Set(Object.values(graph).map((n) => n.class_type)),
    ].filter((name) => !info[name]);
    console.log("Missing required node classes:", JSON.stringify(missing));
    writeFileSync(
      path.join(root, "node-validation.json"),
      JSON.stringify({ count: Object.keys(info).length, missing }, null, 2),
    );
    comfyProcess.kill();
    await delay(1500);
    processes.splice(processes.indexOf(comfyProcess), 1);
  }
  if (!process.argv.includes("--comfy-only")) {
    const model =
      process.argv.find((s) => s.startsWith("qwen3:")) || "qwen3:4b";
    let last = 0;
    await ollama.pull(model, (p) => {
      if (Date.now() - last > 15000) {
        console.log(
          "Local model:",
          p.status,
          p.total ? Math.round(((p.completed || 0) / p.total) * 100) + "%" : "",
        );
        last = Date.now();
      }
    });
    const started = Date.now();
    const plan = await planProject(
      {
        script:
          "清晨的旧书店，一只橘猫跳上窗台。穿浅蓝外套的女孩推门走进来，轻声说早上好，猫回头看她。",
        style: "温暖宁静的写实电影，柔和自然光",
        plan: null,
      },
      { model, ollamaUrl: ollama.url, directorDevice: "cpu" },
      { engine: ollama, onProgress: (p) => console.log(p.message) },
    );
    writeFileSync(
      path.join(root, "local-plan.json"),
      JSON.stringify(plan, null, 2),
    );
    console.log(
      JSON.stringify({
        localPlanning: "PASS",
        model,
        seconds: (Date.now() - started) / 1000,
        shots: plan.shots.length,
        scenes: plan.scenes.length,
        assets: plan.assets.length,
      }),
    );
  }
} finally {
  for (const p of processes) p.kill();
  log.end();
  store.close();
}
