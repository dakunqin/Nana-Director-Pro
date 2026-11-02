import { readFileSync } from "node:fs";
import path from "node:path";
import { AppError, localServiceUrl } from "./security.mjs";
import { preflight } from "./workflow.mjs";

export class Comfy {
  constructor(url, allowLan = false) {
    this.url = localServiceUrl(url, allowLan);
  }
  async request(route, options = {}, timeout = 30000) {
    const r = await fetch(this.url + route, {
      ...options,
      signal: options.signal || AbortSignal.timeout(timeout),
    });
    if (!r.ok)
      throw new AppError(
        `ComfyUI ${r.status}：${(await r.text()).slice(0, 400)}`,
        502,
      );
    return r;
  }
  async status() {
    try {
      return {
        online: true,
        ...(await (await this.request("/system_stats", {}, 3000)).json()),
      };
    } catch (e) {
      return { online: false, error: e.message };
    }
  }
  async info(timeout=60000) {
    return (await this.request("/object_info", {}, timeout)).json();
  }
  async preflight(graph) {
    return preflight(graph, await this.info());
  }
  async submit(graph, clientId) {
    const r = await this.request("/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: clientId }),
    });
    const data = await r.json();
    if (!data.prompt_id || Object.keys(data.node_errors || {}).length)
      throw new AppError(
        `工作流提交失败：${JSON.stringify(data.node_errors || data).slice(0, 900)}`,
        422,
      );
    return data;
  }
  async history(id) {
    const d = await (
      await this.request("/history/" + encodeURIComponent(id))
    ).json();
    return d[id] || null;
  }
  async pending(id) {
    const d = await (await this.request("/queue")).json();
    return [...(d.queue_running || []), ...(d.queue_pending || [])].some(
      (entry) => entry[1] === id,
    );
  }
  async removePending(id) {
    await this.request("/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: [id] }),
    });
  }
  async upload(file) {
    const body = new FormData();
    body.set("image", new Blob([readFileSync(file)]), path.basename(file));
    body.set("overwrite", "false");
    body.set("type", "input");
    return (
      await this.request("/upload/image", { method: "POST", body }, 120000)
    ).json();
  }
  async download(output) {
    if (output.type !== "output")
      throw new AppError("仅归档 ComfyUI output 文件");
    const q = new URLSearchParams({
      filename: output.filename,
      subfolder: output.subfolder || "",
      type: "output",
    });
    return Buffer.from(
      await (await this.request("/view?" + q, {}, 600000)).arrayBuffer(),
    );
  }
  async free() {
    await this.request("/free", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
  }
}
