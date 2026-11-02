import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Ollama } from "../server/ollama.mjs";
test("GPU out of memory retries on CPU without using a cloud service", async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const value = JSON.parse(body);
    requests.push(value);
    res.setHeader("Content-Type", "application/json");
    if (value.options.num_gpu !== 0) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "cudaMalloc failed: out of memory" }));
    } else res.end(JSON.stringify({ message: { content: '{"ok":true}' } }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const client = new Ollama("http://127.0.0.1:" + server.address().port);
  assert.equal(
    await client.chat(
      "qwen3:8b",
      [{ role: "user", content: "剧本" }],
      {},
      null,
    ),
    ' {"ok":true}'.trim(),
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.num_gpu, 0);
});
