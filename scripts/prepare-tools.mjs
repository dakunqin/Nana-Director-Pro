import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runProcess } from "../server/process.mjs";
const require = createRequire(import.meta.url);
const electronRoot = path.dirname(require.resolve("electron/package.json"));
if (
  !existsSync(
    path.join(
      electronRoot,
      "dist",
      process.platform === "win32"
        ? "electron.exe"
        : process.platform === "darwin"
          ? "Electron.app/Contents/MacOS/Electron"
          : "electron",
    ),
  )
)
  await runProcess(process.execPath, [path.join(electronRoot, "install.js")], {
    timeout: 600000,
  });
let ffmpeg;
try {
  ffmpeg = require("ffmpeg-static");
} catch {}
if (!ffmpeg || !existsSync(ffmpeg)) {
  const dir = path.dirname(require.resolve("ffmpeg-static/package.json"));
  await runProcess(process.execPath, [path.join(dir, "install.js")], {
    cwd: dir,
    timeout: 600000,
  });
}
console.log("Desktop and media tools are ready.");
