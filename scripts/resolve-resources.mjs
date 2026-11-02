import { catalog } from "../server/environment.mjs";
let failed = false;
for (const r of catalog.resources) {
  try {
    if (
      !/^[a-f0-9]{64}$/.test(r.sha256) ||
      !Number.isSafeInteger(r.size) ||
      !r.revision
    )
      throw new Error("清单字段缺失");
    const response = await fetch(r.url, {
      method: "HEAD",
      signal: AbortSignal.timeout(30000),
    });
    console.log(r.id, response.status, r.revision);
    if (!response.ok) failed = true;
  } catch (e) {
    console.error(r.id, e.message);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
