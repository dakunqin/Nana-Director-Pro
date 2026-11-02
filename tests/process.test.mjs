import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendLog } from "../server/process.mjs";
test("service logs rotate and remain bounded instead of filling the data drive", () => {
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), "nana-log-")),
    "service.log",
  );
  appendLog(file, Buffer.alloc(3 * 1024 * 1024, 65));
  appendLog(file, Buffer.alloc(3 * 1024 * 1024, 66));
  assert.ok(existsSync(file + ".previous"));
  assert.ok(statSync(file).size <= 4 * 1024 * 1024);
  appendLog(file, Buffer.alloc(8 * 1024 * 1024, 67));
  assert.ok(statSync(file).size <= 4 * 1024 * 1024);
});
