import path from "node:path";
import { lstatSync, existsSync } from "node:fs";

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function safePath(root, relative) {
  if (
    typeof relative !== "string" ||
    path.isAbsolute(relative) ||
    relative.includes("\0")
  )
    throw new AppError("文件路径不合法");
  const base = path.resolve(root),
    target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep))
    throw new AppError("文件路径超出允许目录", 403);
  let current = base;
  for (const segment of path
    .relative(base, target)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new AppError("不允许通过链接访问文件", 403);
  }
  return target;
}
export function localServiceUrl(value, allowLan = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("服务地址格式不正确");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const privateLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
    url.hostname,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (!local && !(allowLan && privateLan)) ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new AppError("仅允许本地服务；局域网 ComfyUI 需单独启用");
  }
  return url.origin;
}
export function checkRequest(req, token, origin) {
  const host = req.headers.host;
  if (
    !["127.0.0.1", "localhost", "[::1]"].some(
      (h) => host === new URL(origin).host.replace("127.0.0.1", h),
    )
  )
    throw new AppError("主机地址无效", 403);
  if (
    req.headers.origin &&
    req.headers.origin !== origin &&
    req.headers.origin !== origin.replace("127.0.0.1", "localhost")
  )
    throw new AppError("拒绝跨域访问", 403);
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new AppError("拒绝跨站访问", 403);
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.authorization !== `Bearer ${token}`
  )
    throw new AppError("需要本地会话令牌", 401);
}
export async function readJson(req, limit = 2 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new AppError("请求过大", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw new AppError("JSON 格式错误");
  }
}
