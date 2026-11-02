import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
import { safePath, localServiceUrl } from "../server/security.mjs";

test("projects persist and stale writes cannot overwrite a newer script", () => {
  const root = mkdtempSync(path.join(tmpdir(), "nana-store-"));
  let db = new Store(root);
  const p = db.createProject({
    name: "测试电影",
    script: "清晨，猫走过街道。",
  });
  const next = db.updateProject(p.id, { script: "夜晚的街道。" }, p.version);
  assert.equal(next.version, 2);
  assert.throws(
    () => db.updateProject(p.id, { script: "过期" }, p.version),
    /版本/,
  );
  db.close();
  db = new Store(root);
  assert.equal(db.getProject(p.id).script, "夜晚的街道。");
  db.close();
});
test("file access rejects traversal and sibling-prefix escapes", () => {
  const root = path.resolve("data");
  assert.throws(() => safePath(root, "../data-other/secret"));
  assert.throws(() => safePath(root, path.resolve("secret")));
  assert.equal(safePath(root, "projects/a"), path.join(root, "projects/a"));
});
test("local model services reject cloud endpoints, credentials and non-HTTP schemes", () => {
  for (const url of [
    "https://ollama.com",
    "file:///etc/passwd",
    "http://user:pass@localhost:11434",
    "http://127.0.0.1.evil.com",
  ]) {
    assert.throws(() => localServiceUrl(url));
  }
  assert.equal(
    localServiceUrl("http://127.0.0.1:11434"),
    "http://127.0.0.1:11434",
  );
});

test('extended video settings persist and reject invalid sampler steps and frame rates',()=>{const db=new Store(mkdtempSync(path.join(tmpdir(),'nana-video-settings-')));try{const p=db.createProject({name:'配置'});assert.equal(p.steps,4);assert.equal(p.fps,24);for(const aspectRatio of ['4:3','3:4','3:2','2:3','21:9']){const old=db.getProject(p.id),next=db.updateProject(p.id,{aspectRatio,megapixels:.9,sampler:'heun',steps:8,fps:30},old.version);assert.equal(next.aspectRatio,aspectRatio);assert.equal(next.fps,30);}const old=db.getProject(p.id);assert.equal(db.updateProject(p.id,{megapixels:1.1},old.version).megapixels,1.1);for(const patch of [{steps:0},{steps:2.5},{fps:0},{fps:29},{sampler:'unknown'}])assert.throws(()=>db.updateProject(p.id,patch,db.getProject(p.id).version));}finally{db.close();}});

test('portable splash is an actual 24-bit BMP supported by the launcher',async()=>{const {readFileSync}=await import('node:fs');const bytes=readFileSync(new URL('../desktop/splash.bmp',import.meta.url));assert.equal(bytes.toString('ascii',0,2),'BM');assert.equal(bytes.readUInt16LE(28),24);assert.equal(bytes.readInt32LE(18),600);assert.equal(bytes.readInt32LE(22),400);});
