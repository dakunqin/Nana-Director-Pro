import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  statSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import path from "node:path";
export function binaryPath(value) {
  if (!value) throw new Error("当前平台缺少所需的本地工具");
  const unpacked = value.replace(
    "app.asar" + path.sep,
    "app.asar.unpacked" + path.sep,
  );
  return existsSync(unpacked) ? unpacked : value;
}
export function appendLog(file, chunk) {
  const limit = 4 * 1024 * 1024;
  let data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  if (data.length > limit) data = data.subarray(data.length - limit);
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file) && statSync(file).size + data.length > limit)
    renameSync(file, file + ".previous");
  appendFileSync(file, data);
}
export function runProcess(
  executable,
  args,
  { cwd, env, log, timeout = 30 * 60 * 1000 } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath(executable), args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: false,
    });
    let tail = "";
    const record = (chunk) => {
      tail = (tail + chunk.toString()).slice(-12000);
      if (log) appendLog(log, chunk);
    };
    child.stdout.on("data", record);
    child.stderr.on("data", record);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("进程执行超时"));
    }, timeout);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(tail)
        : reject(new Error(`进程退出 (${code})：${tail.slice(-1500)}`));
    });
  });
}
