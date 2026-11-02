import { spawn } from "node:child_process";
const node = process.execPath;
const run = (args) =>
  spawn(node, args, { stdio: "inherit", windowsHide: true });
const build = run(["node_modules/vite/bin/vite.js", "build"]);
build.once("exit", (code) => {
  if (code) {
    process.exitCode = code;
    return;
  }
  const watcher = run(["node_modules/vite/bin/vite.js", "build", "--watch"]);
  const server = run(["--watch", "server/index.mjs"]);
  for (const event of ["SIGINT", "SIGTERM"])
    process.once(event, () => {
      watcher.kill();
      server.kill();
    });
});
