import { defineConfig } from "@playwright/test";

const testHost = "127.0.0.1";
const testPort = 3100;
const testDatabase = "contact_webrtc_lab_playwright";

process.env.PGDATABASE_E2E ??= testDatabase;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    baseURL: `http://${testHost}:${testPort}`,
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    command: "node scripts/start-e2e-server.ts",
    url: `http://${testHost}:${testPort}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: testHost,
      PORT: String(testPort),
      PGDATABASE: process.env.PGDATABASE_E2E ?? testDatabase,
      PGHOST: process.env.PGHOST ?? testHost,
      PGPORT: process.env.PGPORT ?? "5432",
      PGUSER: process.env.PGUSER ?? "postgres",
      PGPASSWORD: process.env.PGPASSWORD ?? "",
      PGADMINDATABASE: process.env.PGADMINDATABASE ?? "postgres",
    },
  },
});
