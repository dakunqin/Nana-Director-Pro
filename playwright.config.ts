import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "ui.spec.ts",
  use: { locale:"zh-CN", baseURL: "http://127.0.0.1:8799", headless: true },
  webServer: {
    command: "node scripts/test-server.mjs",
    url: "http://127.0.0.1:8799/api/v1/health",
    reuseExistingServer: false,
  },
  workers: 1,
});
