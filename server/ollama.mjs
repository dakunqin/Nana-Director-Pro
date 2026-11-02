import { AppError, localServiceUrl } from "./security.mjs";

export const DIRECTOR_MODELS = [
  {
    id: "qwen3:0.6b",
    name: "Qwen3 · 0.6B",
    description: "兼容性测试用，复杂剧本建议使用更大模型",
    ramGB: 3,
  },
  {
    id: "qwen3:1.7b",
    name: "Qwen3 · 1.7B",
    description: "超轻量本地规划，适合简单短剧本",
    ramGB: 4,
  },
  {
    id: "qwen3:4b",
    name: "Qwen3 · 4B",
    description: "轻量入门，适合 CPU 或较低显存",
    ramGB: 8,
  },
  {
    id: "qwen3:8b",
    name: "Qwen3 · 8B",
    description: "推荐，规划质量与资源占用平衡",
    ramGB: 16,
  },
  {
    id: "qwen3:14b",
    name: "Qwen3 · 14B",
    description: "复杂剧本，建议充足内存与显存",
    ramGB: 32,
  },
  {
    id: "qwen3:32b",
    name: "Qwen3 · 32B",
    description: "高资源设备，长文本规划",
    ramGB: 48,
  },
];
export class Ollama {
  constructor(url) {
    this.url = localServiceUrl(url);
  }
  assertLocal(model) {
    if (/cloud/i.test(model)) throw new AppError("禁止使用云端模型");
    if(typeof model!=="string"||model.includes("://")||!/^[-\w][\w./:@-]{0,160}$/.test(model))throw new AppError("请输入有效的本地 Ollama 模型标签");
  }
  async request(route, body, signal, timeout = 600000) {
    const response = await fetch(this.url + route, {
      method: body ? "POST" : "GET",
      body: body ? JSON.stringify(body) : undefined,
      headers: { "Content-Type": "application/json" },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
    });
    if (!response.ok)
      throw new AppError(
        `本地导演服务 ${response.status}：${(await response.text()).slice(0, 300)}`,
        502,
      );
    return response;
  }
  async status() {
    try {
      const r = await this.request("/api/tags", null, null, 3000);
      const data = await r.json();
      return { online: true, models: data.models || [] };
    } catch (e) {
      return { online: false, models: [], error: e.message };
    }
  }
  async chat(model, messages, schema, signal, { device = "auto" } = {}) {
    this.assertLocal(model);
    const payload = {
      model,
      messages,
      format: schema,
      stream: false,
      think: false,
      keep_alive: "2m",
      options: {
        temperature: 0.35,
        num_ctx: ["qwen3:0.6b", "qwen3:1.7b"].includes(model) ? 4096 : 8192,
        ...(device === "cpu" ? { num_gpu: 0 } : {}),
      },
    };
    let response;
    try {
      response = await this.request("/api/chat", payload, signal);
    } catch (e) {
      if (
        device === "cpu" ||
        !/(out.of.memory|cudaMalloc|unable to allocate)/i.test(e.message)
      )
        throw e;
      this.lastFallback = "cpu";
      response = await this.request(
        "/api/chat",
        { ...payload, options: { ...payload.options, num_gpu: 0 } },
        signal,
      );
    }
    const data = await response.json();
    if (data.error) throw new AppError(data.error, 502);
    if (data.message?.content === undefined)
      throw new AppError("本地模型未返回内容", 502);
    return data.message.content;
  }
  async unload(model) {
    this.assertLocal(model);
    await this.request("/api/generate", { model, keep_alive: 0 }, null, 30000);
  }
  async pull(model, onProgress, signal) {
    this.assertLocal(model);
    const response = await this.request(
      "/api/pull",
      { model, stream: true },
      signal,
      24 * 60 * 60 * 1000,
    );
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += new TextDecoder().decode(chunk);
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        const data = JSON.parse(line);
        if (data.error) throw new AppError(data.error, 502);
        onProgress(data);
      }
    }
    if (buffer.trim()) {
      const data = JSON.parse(buffer);
      if (data.error) throw new AppError(data.error, 502);
      onProgress(data);
    }
  }
}
