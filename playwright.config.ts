import { defineConfig } from "@playwright/test";

const PORT = 3200;
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: `rm -f .data/e2e-store.json && npx next dev -p ${PORT}`,
    port: PORT,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { DEMO_STORE_PATH: ".data/e2e-store.json", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", ANTHROPIC_API_KEY: "" },
  },
});
