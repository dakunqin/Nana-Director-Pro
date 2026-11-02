import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  renameSync,
  statfsSync,
  appendFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { AppError, safePath } from "./security.mjs";
import { runProcess, binaryPath, appendLog } from "./process.mjs";
import { Ollama } from "./ollama.mjs";
import { Comfy } from "./comfy.mjs";
import { buildWorkflow } from "./workflow.mjs";
const require = createRequire(import.meta.url),
  { path7za } = require("7zip-bin");
export const catalog = JSON.parse(
  readFileSync(
    new URL("../resources/catalog.json", import.meta.url),
    "utf8",
  ).replace(/^\uFEFF/, ""),
);
const exec = promisify(execFile);
export async function startManagedOnLaunch(store,environment){const settings=store.settings();if(store.get('environment','installed')&&(settings.managedComfy||settings.managedOllama))return environment.start();}
export async function activateRuntime(store, candidate, verify) {
  await verify(candidate);
  return store.put("environment", "installed", {
    ...candidate,
    runtimeHealthCheckedAt: new Date().toISOString(),
  });
}
async function freePort() {
  const server = net.createServer();
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
export class Environment {
  constructor(store, root, downloads) {
    this.store = store;
    this.root = root;
    this.downloads = downloads;
    this.processes = new Map();
    this.installing = false;
    this.logs = path.join(root, "logs");
    mkdirSync(this.logs, { recursive: true });
  }
  async hardware() {
    let gpus = [];
    try {
      const { stdout } = await exec(
        "nvidia-smi",
        [
          "--query-gpu=index,name,memory.total,driver_version",
          "--format=csv,noheader,nounits",
        ],
        { windowsHide: true, timeout: 5000 },
      );
      gpus = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [index, name, vram, driver] = line
            .split(",")
            .map((s) => s.trim());
          return {
            index: Number(index),
            name,
            vramMB: Number(vram),
            driver,
            backend: "cuda",
          };
        });
    } catch {}
    const disk = statfsSync(this.root),
      ramGB = Math.round(os.totalmem() / 1073741824),
      best = Math.max(0, ...gpus.map((g) => g.vramMB));
    return {
      platform: process.platform,
      arch: process.arch,
      ramGB,
      cpu: os.cpus()[0]?.model || "CPU",
      gpus,
      freeBytes: Number(disk.bavail) * Number(disk.bsize),
      recommendedModel:
        ramGB < 12
          ? "qwen3:4b"
          : ramGB < 28
            ? "qwen3:8b"
            : ramGB < 48
              ? "qwen3:14b"
              : "qwen3:32b",
      videoSupport:
        best >= 24576
          ? "H3 候选配置，仍需真实测试"
          : best
            ? "H3 低显存配置，资源需求取决于镜头设置"
            : "未检测到 NVIDIA；可编辑项目和运行本地导演，视频需兼容的 ComfyUI",
      validated: false,
    };
  }
  async status() {
    const s = this.store.settings();
    const [ollama, comfy] = await Promise.all([
      new Ollama(s.ollamaUrl).status(),
      new Comfy(s.comfyUrl, s.allowLan).status(),
    ]);
    return {
      ollama,
      comfy,
      managed: this.store.get("environment", "installed"),
      processes: [...this.processes.keys()],
      install: this.store.get("operations", "installation"),
    };
  }
  async extract(archive, destination) {
    const list = await runProcess(path7za, ["l", "-slt", archive], {
      timeout: 120000,
    });
    const entries = list.split("----------").slice(1).join("----------");
    for (const m of entries.matchAll(/^Path = (.+)$/gm)) {
      const entry = m[1].trim();
      if (
        path.win32.isAbsolute(entry) ||
        path.posix.isAbsolute(entry) ||
        entry.split(/[\\/]/).includes("..") ||
        entry.includes(":")
      )
        throw new AppError("压缩包含有不安全路径");
    }
    if (/^Symbolic Link = /m.test(entries) || /^Hard Link = /m.test(entries))
      throw new AppError("压缩包含有链接");
    mkdirSync(destination, { recursive: true });
    await runProcess(path7za, ["x", archive, `-o${destination}`, "-y"], {
      log: path.join(this.logs, "installation.log"),
    });
  }
  async install() {
    if (this.installing) throw new AppError("安装已在进行中", 409);
    if (process.platform !== "win32" || process.arch !== "x64")
      throw new AppError(
        "首版自动安装支持 Windows x64，其他平台请连接已有本地服务",
      );
    if (this.processes.size) throw new AppError("请先停止托管服务再安装或修复");
    this.installing = true;
    const update = (message, progress, status = "running") =>
      this.store.put("operations", "installation", {
        id: "installation",
        kind: "installation",
        status,
        message,
        progress,
        updatedAt: new Date().toISOString(),
      });
    try {
      const resources = catalog.resources.filter((r) =>
        ["runtime", "node"].includes(r.group),
      );
      update("正在下载独立运行环境", 5);
      for (let i = 0; i < resources.length; i++) {
        update(`下载 ${resources[i].name}`, 5 + i * 8);
        await this.downloads.download(resources[i]);
      }
      const version =
        "comfy-" +
        resources.find((r) => r.id === "comfy-runtime").revision +
        "_ollama-" +
        resources.find((r) => r.id === "ollama-runtime").revision;
      const base = path.join(
          this.root,
          "runtime",
          version + "-" + randomUUID(),
        ),
        stage = base;
      mkdirSync(stage, { recursive: true });
      update("解压 ComfyUI 与 Ollama", 50);
      const comfyDir = path.join(stage, "comfy"),
        ollamaDir = path.join(stage, "ollama");
      await this.extract(
        safePath(
          this.root,
          resources.find((r) => r.id === "comfy-runtime").path,
        ),
        comfyDir,
      );
      await this.extract(
        safePath(
          this.root,
          resources.find((r) => r.id === "ollama-runtime").path,
        ),
        ollamaDir,
      );
      const portable = path.join(comfyDir, "ComfyUI_windows_portable");
      const python = path.join(portable, "python_embeded", "python.exe"),
        comfy = path.join(portable, "ComfyUI");
      if (!existsSync(python) || !existsSync(path.join(comfy, "main.py")))
        throw new AppError("ComfyUI 发布包结构与预期不符");
      for (const resource of resources.filter((r) => r.group === "node")) {
        update(`安装节点 ${resource.name}`, 65);
        const temp = path.join(stage, resource.id);
        await this.extract(safePath(this.root, resource.path), temp);
        const folder = readdirSync(temp, { withFileTypes: true }).find((d) =>
          d.isDirectory(),
        )?.name;
        if (!folder) throw new AppError("节点包结构不完整");
        const target = path.join(comfy, "custom_nodes", resource.id);
        if (!existsSync(target)) renameSync(path.join(temp, folder), target);
        const requirements = path.join(target, "requirements.txt");
        if (existsSync(requirements))
          await runProcess(
            python,
            ["-s", "-m", "pip", "install", "-r", requirements],
            { cwd: comfy, log: path.join(this.logs, "installation.log") },
          );
      }
      update("检查环境并保存版本记录", 90);
      const freeze = await runProcess(python, ["-s", "-m", "pip", "freeze"]);
      writeFileSync(path.join(stage, "installed-requirements.txt"), freeze);
      const installed = {
        version,
        base,
        python: path.join(
          base,
          "comfy",
          "ComfyUI_windows_portable",
          "python_embeded",
          "python.exe",
        ),
        comfy: path.join(base, "comfy", "ComfyUI_windows_portable", "ComfyUI"),
        ollama: path.join(base, "ollama", "ollama.exe"),
        installedAt: new Date().toISOString(),
        validated: false,
      };
      update("正在独立端口验证服务启动和基础节点；旧环境保持不变", 95);
      await activateRuntime(this.store, installed, (candidate) =>
        this.validateCandidate(candidate),
      );
      this.store.saveSettings({
        managedComfy: true,
        managedOllama: true,
        comfyUrl: "http://127.0.0.1:8188",
        ollamaUrl: "http://127.0.0.1:11434",
      });
      update(
        "环境已安装，启动后仍需下载模型并完成真实出片测试",
        100,
        "completed",
      );
      return installed;
    } catch (e) {
      update(e.message, 0, "failed");
      throw e;
    } finally {
      this.installing = false;
    }
  }
  async validateCandidate(candidate) {
    const ollamaPort = await freePort(),
      comfyPort = await freePort(),
      children = [];
    let launchError;
    const start = (exe, args, cwd, env) => {
      const child = spawn(exe, args, {
        cwd,
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          OPENBLAS_NUM_THREADS: "1",
          OMP_NUM_THREADS: "1",
          ...env,
        },
      });
      child.stdout.on("data", (b) =>
        appendLog(path.join(this.logs, "installation.log"), b),
      );
      child.stderr.on("data", (b) =>
        appendLog(path.join(this.logs, "installation.log"), b),
      );
      child.on("error", (e) => (launchError = e));
      children.push(child);
    };
    const ollama = new Ollama(`http://127.0.0.1:${ollamaPort}`),
      comfy = new Comfy(`http://127.0.0.1:${comfyPort}`);
    const wait = async (client) => {
      for (let i = 0; i < 90; i++) {
        if (launchError) throw launchError;
        if (children.some((c) => c.exitCode !== null))
          throw new AppError("候选服务启动失败，请查看安装日志");
        if ((await client.status()).online) return;
        await delay(1500);
      }
      throw new AppError("候选服务健康检查超时，旧环境未替换");
    };
    try {
      start(candidate.ollama, ["serve"], path.dirname(candidate.ollama), {
        OLLAMA_HOST: `127.0.0.1:${ollamaPort}`,
        OLLAMA_MODELS: path.join(this.root, "models", "ollama"),
        OLLAMA_NO_CLOUD: "1",
        OLLAMA_VULKAN: "false",
        CUDA_VISIBLE_DEVICES: "-1",
      });
      await wait(ollama);
      start(
        candidate.python,
        [
          "-s",
          "main.py",
          "--cpu",
          "--disable-auto-launch",
          "--listen",
          "127.0.0.1",
          "--port",
          String(comfyPort),
        ],
        candidate.comfy,
        { CUDA_VISIBLE_DEVICES: "-1" },
      );
      await wait(comfy);
      const info = await comfy.info(),
        graph = buildWorkflow(
          { prompt: "资源检查", duration: 5 },
          { id: "health", aspectRatio: "16:9", megapixels: 0.5 },
        );
      const missing = [
        ...new Set(Object.values(graph).map((n) => n.class_type)),
      ].filter((name) => !info[name]);
      if (missing.length)
        throw new AppError("候选环境缺少基础节点：" + missing.join(", "));
    } finally {
      await Promise.all(
        children.map(
          (child) =>
            new Promise((resolve) => {
              if (child.exitCode !== null) {
                resolve();
                return;
              }
              child.once("exit", resolve);
              child.kill();
              setTimeout(resolve, 5000).unref();
            }),
        ),
      );
    }
  }
  launch(name, exe, args, cwd, env = {}) {
    if (this.processes.has(name)) return;
    const child = spawn(exe, args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: false,
    });
    const log = path.join(this.logs, name + ".log");
    const record = (b) => {
      try {
        appendLog(log, b);
      } catch {}
    };
    child.stdout.on("data", record);
    child.stderr.on("data", record);
    child.once("error", (e) => {
      record(Buffer.from(e.message));
      this.processes.delete(name);
    });
    child.once("exit", () => this.processes.delete(name));
    this.processes.set(name, child);
  }
  async start() {
    const installed = this.store.get("environment", "installed"),
      s = this.store.settings();
    if (!installed) throw new AppError("请先安装托管运行环境，或连接已有服务");
    const status = await this.status();
    const ffmpeg = binaryPath(require("ffmpeg-static"));
    if (s.managedOllama && !status.ollama.online) {
      this.launch(
        "ollama",
        installed.ollama,
        ["serve"],
        path.dirname(installed.ollama),
        {
          OLLAMA_HOST: "127.0.0.1:" + (new URL(s.ollamaUrl).port || "80"),
          OLLAMA_MODELS: path.join(this.root, "models", "ollama"),
          OLLAMA_NO_CLOUD: "1",
          OLLAMA_VULKAN: "false",
          OPENBLAS_NUM_THREADS: "1",
          OMP_NUM_THREADS: "1",
        },
      );
    }
    if (s.managedComfy && !status.comfy.online) {
      const config = path.join(this.root, "extra_model_paths.yaml");
      writeFileSync(
        config,
        JSON.stringify(
          {
            nana_pro: {
              base_path: path.join(this.root, "models"),
              checkpoints: "checkpoints",
              diffusion_models: "diffusion_models",
              text_encoders: "text_encoders",
              vae: "vae",
              loras: "loras",
              clip_vision:"clip_vision",controlnet:"controlnet",embeddings:"embeddings",audio_encoders:"audio_encoders",upscale_models:"upscale_models",
            },
          },
          null,
          2,
        ),
      );
      const args = [
        "-s",
        "main.py",
        "--windows-standalone-build",
        "--disable-auto-launch",
        "--listen",
        "127.0.0.1",
        "--port",
        new URL(s.comfyUrl).port || "80",
        "--extra-model-paths-config",
        config,
        "--cuda-device",
        String(s.gpuIndex),
      ];
      if (s.lowVram) args.push("--lowvram");
      this.launch("comfy", installed.python, args, installed.comfy, {
        PATH: path.dirname(ffmpeg) + path.delimiter + process.env.PATH,
        VHS_FORCE_FFMPEG_PATH: ffmpeg,
        OPENBLAS_NUM_THREADS: "1",
        OMP_NUM_THREADS: "1",
      });
    }
    return {
      message: "启动请求已发送，首次加载可能需要几分钟。请观察状态与日志。",
    };
  }
  async stop() {
    const owned=[...this.processes.entries()];
    await Promise.all(owned.map(([name,child])=>new Promise(resolve=>{
      if(child.exitCode!==null&&child.exitCode!==undefined){this.processes.delete(name);resolve();return;}
      const timer=setTimeout(()=>resolve(),5000);child.once('exit',()=>{clearTimeout(timer);this.processes.delete(name);resolve();});child.kill();
    })));
    const remaining=owned.filter(([name])=>this.processes.has(name)).map(([name])=>name);
    if(remaining.length)throw new AppError('服务停止仍在等待：'+remaining.join('、')+'。请稍后检查连接与日志');
    return {message:owned.length?'已停止本应用启动的服务：'+owned.map(([name])=>name).join('、'):'本应用没有正在托管的服务，无需停止'};
  }
  log(name) {
    if (!["comfy", "ollama", "installation"].includes(name))
      throw new AppError("日志名称无效");
    const file = path.join(this.logs, name + ".log");
    return existsSync(file)
      ? readFileSync(file, "utf8").slice(-24000)
      : "暂无日志";
  }
}
