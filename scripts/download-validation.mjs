import path from "node:path";
import { Store } from "../server/store.mjs";
import { DownloadManager } from "../server/downloads.mjs";
import { catalog } from "../server/environment.mjs";
const root = path.resolve("data/acceptance"),
  store = new Store(root),
  manager = new DownloadManager(store, root);
const resource = catalog.resources.find(
  (r) => r.id === (process.argv[2] || "h3-2"),
);
if (!resource) throw new Error("Unknown resource");
const timer = setInterval(() => {
  const d = store.get("downloads", resource.id);
  if (d)
    console.log(
      d.status,
      Math.floor(((d.completed || 0) / d.size) * 100) + "%",
    );
}, 10000);
try {
  const file = await manager.download(resource);
  console.log(
    JSON.stringify({
      download: "PASS",
      id: resource.id,
      size: resource.size,
      sha256: resource.sha256,
      file,
    }),
  );
} finally {
  clearInterval(timer);
  store.close();
}
