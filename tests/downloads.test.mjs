import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Store } from "../server/store.mjs";
import { DownloadManager } from "../server/downloads.mjs";
const bytes = Buffer.from("real downloadable model fixture");
const hash = createHash("sha256").update(bytes).digest("hex");
test("official Hugging Face CDN redirect is allowed but lookalike hosts remain blocked", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "nana-host-")),
    store = new Store(root);
  t.after(() => store.close());
  const manager = new DownloadManager(store, root);
  assert.doesNotThrow(() =>
    manager.assertUrl("https://us.aws.cdn.hf.co/xet-bridge-us/test"),
  );
  assert.throws(() =>
    manager.assertUrl("https://us.aws.cdn.hf.co.evil.example/file"),
  );
  assert.throws(() => manager.assertUrl("http://us.aws.cdn.hf.co/file"));
});
async function fixture(t, ignoreRange = false) {
  const ranges = [];
  const server = createServer((req, res) => {
    ranges.push(req.headers.range);
    const start = ignoreRange
      ? 0
      : Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] || 0);
    res.writeHead(start ? 206 : 200, {
      "content-length": bytes.length - start,
      ...(start
        ? {
            "content-range": `bytes ${start}-${bytes.length - 1}/${bytes.length}`,
          }
        : {}),
    });
    res.end(bytes.subarray(start));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const root = mkdtempSync(path.join(tmpdir(), "nana-dl-")),
    store = new Store(root);
  t.after(() => store.close());
  const manager = new DownloadManager(store, root, { allowTestHttp: true });
  const resource = {
    id: "model",
    url: `http://127.0.0.1:${server.address().port}/model`,
    path: "models/test.bin",
    size: bytes.length,
    sha256: hash,
  };
  return { root, store, manager, resource, ranges };
}
test("downloads resume a partial file and verify bytes before installation", async (t) => {
  const f = await fixture(t);
  mkdirSync(path.join(f.root, "models"));
  writeFileSync(
    path.join(f.root, "models/test.bin.part"),
    bytes.subarray(0, 7),
  );
  await f.manager.download(f.resource);
  assert.equal(f.ranges[0], "bytes=7-");
  assert.deepEqual(readFileSync(path.join(f.root, "models/test.bin")), bytes);
  assert.equal(f.store.get("downloads", "model").status, "completed");
});
test("server ignoring Range restarts instead of appending corrupt data", async (t) => {
  const f = await fixture(t, true);
  mkdirSync(path.join(f.root, "models"));
  writeFileSync(
    path.join(f.root, "models/test.bin.part"),
    bytes.subarray(0, 7),
  );
  await f.manager.download(f.resource);
  assert.deepEqual(readFileSync(path.join(f.root, "models/test.bin")), bytes);
});
test("wrong hash never registers a model as complete", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.manager.download({ ...f.resource, sha256: "a".repeat(64) }),
    /校验/,
  );
  assert.equal(f.store.get("downloads", "model").status, "failed");
});
test("restart interrupts active downloads and restores resumable state", async (t) => {
  const f = await fixture(t);
  f.store.put("downloads", "model", { ...f.resource, status: "downloading" });
  new DownloadManager(f.store, f.root, { allowTestHttp: true });
  assert.equal(f.store.get("downloads", "model").status, "paused");
});
test("disk space preflight blocks the download without making a request", async (t) => {
  const f = await fixture(t);
  f.manager.freeSpace = () => 1;
  await assert.rejects(f.manager.download(f.resource), /空间/);
  assert.equal(f.ranges.length, 0);
});
