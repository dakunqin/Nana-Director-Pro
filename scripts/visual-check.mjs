import { chromium } from "@playwright/test";
import { createApp } from "../server/app.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = await createApp({
  root: path.join(root, "data", "visual-check"),
  port: 0,
  recover: false,
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    locale:"zh-CN",
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.goto(app.url);
  await page.getByRole("heading", { name: /让故事/ }).waitFor();
  mkdirSync(path.join(root, "docs", "screenshots"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "docs", "screenshots", "studio.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "试试示例剧本" }).click();
  await page.getByLabel("剧本正文").waitFor();
  await page.screenshot({
    path: path.join(root, "docs", "screenshots", "director.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "模型中心", exact: true }).click();
  await page.getByRole("heading", { name: "你的本地模型库" }).waitFor();
  await page.screenshot({
    path: path.join(root, "docs", "screenshots", "models.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("heading", { name: /让故事/ }).waitFor();
  await page.screenshot({
    path: path.join(root, "docs", "screenshots", "mobile.png"),
    fullPage: true,
  });
  const icon = await browser.newPage({ viewport: { width: 256, height: 256 } });
  await icon.setContent(
    readFileSync(path.join(root, "desktop", "icon.svg"), "utf8"),
  );
  await icon.addStyleTag({ content: "body{margin:0;background:transparent}" });
  await icon.screenshot({
    path: path.join(root, "desktop", "icon.png"),
    omitBackground: true,
  });
  console.log("Visual screenshots saved to docs/screenshots");
} finally {
  await browser.close();
  await app.close();
}
