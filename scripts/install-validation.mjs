import path from "node:path";
import { Store } from "../server/store.mjs";
import { DownloadManager } from "../server/downloads.mjs";
import { Environment } from "../server/environment.mjs";
const root = path.resolve("data/acceptance"),
  store = new Store(root),
  downloads = new DownloadManager(store, root),
  environment = new Environment(store, root, downloads);
const timer = setInterval(() => {
  const op = store.get("operations", "installation");
  console.log(op?.message || "准备安装");
  for (const d of downloads.list().filter((d) => d.status === "downloading"))
    console.log(d.name, Math.round(((d.completed || 0) / d.size) * 100) + "%");
}, 15000);
try {
  await environment.install();
  console.log("Installation PASS");
} finally {
  clearInterval(timer);
  store.close();
}
