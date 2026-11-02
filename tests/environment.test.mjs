import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Store } from "../server/store.mjs";
import { Environment, activateRuntime, startManagedOnLaunch } from "../server/environment.mjs";
test('daily launch starts only installed services explicitly managed by the app',async t=>{const root=mkdtempSync(path.join(os.tmpdir(),'nana-auto-')),store=new Store(root);t.after(()=>store.close());let calls=0;const environment={start:async()=>{calls++;}};await startManagedOnLaunch(store,environment);assert.equal(calls,0);store.put('environment','installed',{version:'ready'});await startManagedOnLaunch(store,environment);assert.equal(calls,0);store.saveSettings({managedComfy:true});await startManagedOnLaunch(store,environment);assert.equal(calls,1);});
test("failed candidate health check leaves working runtime and record untouched", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nana-env-")),
    store = new Store(root);
  t.after(() => store.close());
  const old = { base: path.join(root, "old"), version: "old" };
  mkdirSync(old.base);
  store.put("environment", "installed", old);
  const next = { base: path.join(root, "candidate"), version: "new" };
  mkdirSync(next.base);
  await assert.rejects(
    activateRuntime(store, next, async () => {
      throw new Error("missing H3 node");
    }),
    /missing H3/,
  );
  assert.equal(store.get("environment", "installed").version, "old");
  assert.ok(existsSync(old.base));
  await activateRuntime(store, next, async () => {});
  assert.equal(store.get("environment", "installed").version, "new");
  assert.ok(existsSync(old.base));
});
test("managed launch honors saved local ports instead of hardcoded defaults", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nana-launch-")),
    store = new Store(root);
  t.after(() => store.close());
  store.put("environment", "installed", {
    ollama: "ollama.exe",
    python: "python.exe",
    comfy: root,
  });
  store.saveSettings({
    managedOllama: true,
    managedComfy: true,
    ollamaUrl: "http://127.0.0.1:11435",
    comfyUrl: "http://127.0.0.1:18188",
  });
  const environment = new Environment(store, root, null);
  environment.status = async () => ({
    ollama: { online: false },
    comfy: { online: false },
  });
  const launches = [];
  environment.launch = (...args) => launches.push(args);
  await environment.start();
  assert.ok(launches[1][2].includes("--disable-auto-launch"));
  assert.equal(launches[0][4].OLLAMA_HOST, "127.0.0.1:11435");
  assert.equal(launches[1][2][launches[1][2].indexOf("--port") + 1], "18188");
});
