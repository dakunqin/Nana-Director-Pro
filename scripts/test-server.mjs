import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";
const app = await createApp({
  root: mkdtempSync(path.join(tmpdir(), "nana-ui-")),
  port: 8799,
  recover: false,
});
console.log(app.url);
for (const name of ["SIGINT", "SIGTERM"])
  process.once(name, async () => {
    await app.close();
    process.exit(0);
  });
