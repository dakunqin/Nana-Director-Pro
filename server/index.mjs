import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";
const root =
  process.env.NANA_DATA_DIR ||
  path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "data");
const app = await createApp({
  root,
  port: Number(process.env.NANA_PORT || 8797),
});
console.log(`Nana Director PRO: ${app.url}`);
for (const event of ["SIGINT", "SIGTERM"])
  process.once(event, async () => {
    await app.close();
    process.exit(0);
  });
