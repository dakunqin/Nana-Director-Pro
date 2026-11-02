import path from "node:path";
import { Store } from "../server/store.mjs";
import { Environment, activateRuntime } from "../server/environment.mjs";
import {Comfy} from '../server/comfy.mjs';
import {buildWorkflow,preflight} from '../server/workflow.mjs';
import {writeFileSync} from 'node:fs';
const root = path.resolve("data/acceptance"),
  store = new Store(root),
  environment = new Environment(store, root, null);
const originalInfo=Comfy.prototype.info;
Comfy.prototype.info=async function(){const info=await originalInfo.call(this);const graph=buildWorkflow({prompt:'工作流结构检查',duration:5},{id:'structure',aspectRatio:'16:9',megapixels:0.5});const check=preflight(graph,info);writeFileSync(path.join(root,'workflow-preflight.json'),JSON.stringify(check,null,2));return info;};
try {
  const installed = store.get("environment", "installed");
  if (!installed) throw new Error("Missing installed runtime");
  await activateRuntime(store, installed, (c) =>
    environment.validateCandidate(c),
  );
  console.log(
    "Candidate health validation (Ollama + ComfyUI + required nodes): PASS",
  );
} finally {
  store.close();
}
