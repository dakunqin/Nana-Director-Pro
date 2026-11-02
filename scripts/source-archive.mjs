import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runProcess } from "../server/process.mjs";
const require = createRequire(import.meta.url),
  { path7za } = require("7zip-bin");
// Only index-listed project files are shipped: never models, environments, databases or credentials.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
if (!files.length)
  throw new Error("Stage source files before building source archive");
mkdirSync("release", { recursive: true });
writeFileSync("release/source-files.txt", files.join("\n"));
const target = path.resolve("release/Nana-Director-Pro-0.1.22-source.zip");
await runProcess(path7za, ["a", "-tzip", "-mmt=1", "-mx=1", target, "@release/source-files.txt"]);
console.log(target);
