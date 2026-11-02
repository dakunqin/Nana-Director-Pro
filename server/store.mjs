import {normalizeProjectPrompts} from './prompt-template.mjs';
import {videoSettings} from './video-settings.mjs';
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "./security.mjs";

export const defaultSettings = {
  uiLanguage:"system",
  comfyUrl: "http://127.0.0.1:8188",
  ollamaUrl: "http://127.0.0.1:11434",
  model: "qwen3:8b",
  allowLan: false,
  managedComfy: false,
  managedOllama: false,
  gpuIndex: 0,
  lowVram: true,
  directorDevice: "auto",
  agentEnabled: false,
  agentToken: "",
  agentScopes: ["read"],
  firstRun: true,
};
export class Store {
  constructor(root) {
    this.root = path.resolve(root);
    mkdirSync(this.root, { recursive: true });
    this.db = new DatabaseSync(path.join(this.root, "studio.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id))",
    );
  }
  get(kind, id) {
    const row = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? JSON.parse(row.data) : null;
  }
  put(kind, id, value) {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(kind, id, JSON.stringify(value));
    return value;
  }
  list(kind) {
    return this.db
      .prepare("SELECT data FROM records WHERE kind=?")
      .all(kind)
      .map((r) => JSON.parse(r.data));
  }
  remove(kind, id) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  settings() {
    return { ...defaultSettings, ...this.get("settings", "main") };
  }
  saveSettings(value) {
    return this.put("settings", "main", { ...this.settings(), ...value });
  }
  createProject({ name, script = "" }) {
    if (typeof name !== "string" || !name.trim() || name.length > 120)
      throw new AppError("请输入 1–120 字的项目名称");
    if (typeof script !== "string" || script.length > 200000)
      throw new AppError("剧本长度超出限制");
    const id = randomUUID(),
      now = new Date().toISOString();
    const p = {
      id,
      name: name.trim(),
      script,
      version: 1,
      style: "电影级写实，细腻自然光，连贯的视觉叙事",
      aspectRatio: "16:9",
      megapixels: 0.5,
      sampler: "dual_clock_euler",
      steps: 4,
      fps: 24,
      plan: null,
      assets: [],
      createdAt: now,
      updatedAt: now,
    };
    mkdirSync(path.join(this.root, "projects", id, "assets"), {
      recursive: true,
    });
    mkdirSync(path.join(this.root, "projects", id, "outputs"), {
      recursive: true,
    });
    return this.put("projects", id, p);
  }
  exampleProject({name,script}) {
    const marker=this.get('preferences','example-project');
    let project=marker&&this.get('projects',marker.projectId);
    const legacy=this.listProjects().filter(p=>p.name===name||p.name==='窗边的相遇 · 示例剧本');
    const jobs=this.list('jobs');
    const used=p=>!!p.plan||p.assets?.length||jobs.some(j=>j.projectId===p.id);
    if(!project)project=legacy.sort((a,b)=>Number(!!used(b))-Number(!!used(a))||a.createdAt.localeCompare(b.createdAt))[0]||this.createProject({name,script});
    this.put('preferences','example-project',{projectId:project.id});
    for(const duplicate of legacy)if(duplicate.id!==project.id&&!used(duplicate)&&duplicate.name===project.name&&duplicate.script===project.script)this.remove('projects',duplicate.id);
    return this.getProject(project.id);
  }
  getProject(id) {
    const p = this.get("projects", id);
    if (!p) throw new AppError("项目不存在", 404);
    return normalizeProjectPrompts(p);
  }
  listProjects() {
    return this.list("projects").map(normalizeProjectPrompts).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  updateProject(id, patch, version) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.getProject(id);
      if (old.version !== version)
        throw new AppError("项目版本已变化，请刷新后重试", 409);
      const allowed = [
        "name",
        "script",
        "style",
        "aspectRatio",
        "megapixels",
        "sampler",
        "steps",
        "fps",
        "plan",
        "assets",
      ];
      const updates = Object.fromEntries(
        Object.entries(patch).filter(([key]) => allowed.includes(key)),
      );
      if (
        updates.name !== undefined &&
        (typeof updates.name !== "string" ||
          !updates.name.trim() ||
          updates.name.length > 120)
      )
        throw new AppError("项目名称无效");
      if (
        updates.script !== undefined &&
        (typeof updates.script !== "string" || updates.script.length > 200000)
      )
        throw new AppError("剧本长度超出限制");
      videoSettings({...old,...updates});
      const value = {
        ...old,
        ...updates,
        id,
        version: old.version + 1,
        updatedAt: new Date().toISOString(),
      };
      value.plan=normalizeProjectPrompts(value).plan;
      this.put("projects", id, value);
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
