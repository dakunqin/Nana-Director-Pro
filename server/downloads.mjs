import {
  existsSync,
  mkdirSync,
  statSync,
  statfsSync,
  openSync,
  writeSync,
  closeSync,
  createReadStream,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { AppError, safePath } from "./security.mjs";

const allowedHosts = [
  "huggingface.co",
  "us.aws.cdn.hf.co",
  "cdn-lfs.huggingface.co",
  "cdn-lfs-us-1.hf.co",
  "cdn-lfs-eu-1.hf.co",
  "cas-bridge.xethub.hf.co",
  "transfer.xethub.hf.co",
  "github.com",
  "codeload.github.com",
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
];
export async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export class DownloadManager {
  constructor(store, root, { allowTestHttp = false } = {}) {
    this.store = store;
    this.root = root;
    this.allowTestHttp = allowTestHttp;
    this.active = new Map();
    this.freeSpace = (dir) => {
      const s = statfsSync(dir);
      return Number(s.bavail) * Number(s.bsize);
    };
    for (const d of store.list("downloads"))
      if (["downloading", "verifying"].includes(d.status))
        store.put("downloads", d.id, { ...d, status: "paused", speed: 0 });
  }
  list() {
    return this.store.list("downloads");
  }
  assertUrl(value) {
    const u = new URL(value);
    if (
      this.allowTestHttp &&
      u.protocol === "http:" &&
      u.hostname === "127.0.0.1"
    )
      return;
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !allowedHosts.includes(u.hostname)
    )
      throw new AppError("下载来源不在可信清单：" + u.hostname);
  }
  async request(url, options) {
    this.assertUrl(url);
    for (let i = 0; i < 8; i++) {
      const response = await fetch(url, { ...options, redirect: "manual" });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        url = new URL(response.headers.get("location"), url).href;
        this.assertUrl(url);
        await response.body?.cancel();
        continue;
      }
      return response;
    }
    throw new AppError("下载重定向次数过多");
  }
  pause(id) {
    this.active.get(id)?.controller.abort();
  }
  start(resource) {
    if (this.active.has(resource.id))
      return this.active.get(resource.id).promise;
    const controller = new AbortController();
    const promise = this.perform(resource, controller.signal).finally(() =>
      this.active.delete(resource.id),
    );
    this.active.set(resource.id, { controller, promise });
    return promise;
  }
  download(resource) {
    return this.start(resource);
  }
  async perform(resource, signal) {
    const { id, size, sha256 } = resource;
    if (
      !/^[\w-]+$/.test(id) ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      !/^[a-f0-9]{64}$/.test(sha256)
    )
      throw new AppError("资源缺少有效大小或 SHA256");
    this.assertUrl(resource.url);
    const dest = safePath(this.root, resource.path),
      part = dest + ".part";
    mkdirSync(path.dirname(dest), { recursive: true });
    let job = {
      ...this.store.get("downloads", id),
      ...resource,
      status: "downloading",
      error: null,
      speed: 0,
      updatedAt: new Date().toISOString(),
    };
    const save = (patch = {}) => {
      job = { ...job, ...patch, updatedAt: new Date().toISOString() };
      this.store.put("downloads", id, job);
    };
    try {
      if (existsSync(dest) && statSync(dest).size === size) {
        save({ status: "verifying", completed: size });
        if ((await hashFile(dest)) === sha256) {
          save({ status: "completed" });
          return dest;
        }
        throw new AppError("已有文件校验失败，请移走损坏文件后重试");
      }
      let offset = existsSync(part) ? statSync(part).size : 0;
      if (offset > size) {
        unlinkSync(part);
        offset = 0;
      }
      if (this.freeSpace(path.dirname(dest)) < size - offset + 1024 * 1024)
        throw new AppError("磁盘空间不足，请更换数据盘");
      if (offset < size) {
        const headers = offset
          ? {
              Range: `bytes=${offset}-`,
              ...(job.etag ? { "If-Range": job.etag } : {}),
            }
          : {};
        const response = await this.request(resource.url, {
          headers,
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(24 * 60 * 60 * 1000),
          ]),
        });
        if (!response.ok)
          throw new AppError(
            response.status === 401 || response.status === 403
              ? "下载需要在来源网站接受许可或授权"
              : `下载失败 HTTP ${response.status}`,
          );
        if (response.status === 206) {
          const range = response.headers.get("content-range");
          if (
            !range?.startsWith(`bytes ${offset}-`) ||
            Number(range.split("/")[1]) !== size
          )
            throw new AppError("服务器返回的续传范围不正确");
        } else offset = 0;
        save({ completed: offset, etag: response.headers.get("etag") || null });
        const fd = openSync(part, offset ? "a" : "w");
        let completed = offset,
          last = Date.now(),
          lastBytes = offset;
        try {
          for await (const chunk of response.body) {
            signal.throwIfAborted();
            completed += chunk.length;
            if (completed > size) throw new AppError("下载文件超出清单大小");
            writeSync(fd, chunk);
            if (Date.now() - last > 400) {
              const now = Date.now();
              save({
                completed,
                speed: ((completed - lastBytes) * 1000) / (now - last),
              });
              last = now;
              lastBytes = completed;
            }
          }
        } finally {
          closeSync(fd);
        }
      }
      signal.throwIfAborted();
      save({ status: "verifying", completed: statSync(part).size, speed: 0 });
      if (statSync(part).size !== size || (await hashFile(part)) !== sha256) {
        unlinkSync(part);
        throw new AppError("文件完整性校验失败，重试将重新下载");
      }
      signal.throwIfAborted();
      renameSync(part, dest);
      save({ status: "completed", completed: size });
      return dest;
    } catch (e) {
      save({
        status: signal.aborted ? "paused" : "failed",
        error: signal.aborted ? null : e.message,
        speed: 0,
      });
      throw e;
    }
  }
}
