import { defineConfig, devices } from "@playwright/test";

const port = process.env.TEST_PORT || 3007;
const serverPort = process.env.TEST_SERVER_PORT || 3008;
const reuseServer = process.env.TEST_REUSE_SERVER === "true";
const mockAgent = process.env.CI === "true" || process.env.AUTOMAKER_MOCK_AGENT === "true";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(reuseServer
    ? {}
    : {
        webServer: [
          // Backend server - runs with mock agent enabled in CI
          {
            command: `cd ../server && npm run dev`,
            url: `http://localhost:${serverPort}/api/health`,
            reuseExistingServer: true,
            timeout: 60000,
            env: {
              ...process.env,
              PORT: String(serverPort),
              // Enable mock agent in CI to avoid real API calls
              AUTOMAKER_MOCK_AGENT: mockAgent ? "true" : "false",
              // Allow access to test directories and common project paths
              ALLOWED_PROJECT_DIRS: "/Users,/home,/tmp,/var/folders",
            },
          },
          // Frontend Next.js server
          {
            command: `npx next dev -p ${port}`,
            url: `http://localhost:${port}`,
            reuseExistingServer: true,
            timeout: 120000,
            env: {
              ...process.env,
              NEXT_PUBLIC_SKIP_SETUP: "true",
            },
          },
        ],
      }),
});
