import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

/**
 * E2E: Fleet Monitor — Connect bot, verify dashboard, check bot detail.
 *
 * Uses the Mock Gateway (scripts/mock-gateway.ts) to simulate an OpenClaw bot.
 * No real bot infrastructure required.
 *
 * Prerequisites:
 *   - Server running on http://localhost:PORT
 *   - At least one company/fleet created (use onboarding.spec.ts first)
 */

const MOCK_GATEWAY_PORT = 28789; // Use high port to avoid conflicts
const MOCK_BOT_NAME = "小龍蝦";
const MOCK_BOT_EMOJI = "🦞";

let mockGateway: ChildProcess | null = null;

/**
 * Wait for a TCP port to become reachable.
 */
async function waitForPort(
  port: number,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Port not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Port ${port} did not become available within ${timeoutMs}ms`);
}

test.describe("Fleet Monitor", () => {
  test.beforeAll(async () => {
    // Start Mock Gateway
    mockGateway = spawn(
      "npx",
      [
        "tsx",
        "scripts/mock-gateway.ts",
        "--port",
        String(MOCK_GATEWAY_PORT),
        "--name",
        MOCK_BOT_NAME,
        "--emoji",
        MOCK_BOT_EMOJI,
      ],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        detached: false,
      },
    );

    mockGateway.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[mock-gateway] ${msg}`);
    });

    await waitForPort(MOCK_GATEWAY_PORT);
  });

  test.afterAll(async () => {
    if (mockGateway) {
      mockGateway.kill("SIGTERM");
      // Give it a moment to clean up
      await new Promise((r) => setTimeout(r, 500));
      mockGateway = null;
    }
  });

  test("fleet monitor page loads", async ({ page }) => {
    await page.goto("/fleet-monitor");
    // Should see the Fleet Monitor heading or empty state
    await expect(
      page.getByText("Fleet Monitor").or(page.getByText("Connect"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("connect bot wizard — full flow", async ({ page }) => {
    await page.goto("/fleet-monitor/connect");

    // Step 1: Enter Gateway URL
    const urlInput = page.locator(
      'input[placeholder*="Gateway"], input[placeholder*="gateway"], input[placeholder*="URL"], input[placeholder*="url"]'
    );
    await expect(urlInput).toBeVisible({ timeout: 10_000 });
    await urlInput.fill(`http://127.0.0.1:${MOCK_GATEWAY_PORT}`);

    // Click Next or Test Connection (depends on UI)
    const nextOrTest = page
      .getByRole("button", { name: /next|test|connect/i })
      .first();
    await nextOrTest.click();

    // Step 2: Enter token
    const tokenInput = page.locator(
      'input[placeholder*="Token"], input[placeholder*="token"], input[type="password"]'
    );
    if (await tokenInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tokenInput.fill("test-token-e2e");

      const testBtn = page
        .getByRole("button", { name: /test|connect/i })
        .first();
      await testBtn.click();

      // Should see success indicator
      await expect(
        page.getByText(/connected|success|found/i)
      ).toBeVisible({ timeout: 10_000 });
    }

    // Step 3: Confirm bot profile — look for bot emoji or name
    const confirmBtn = page.getByRole("button", {
      name: /add|confirm|join|fleet/i,
    });
    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  });

  test("dashboard shows connected bot", async ({ page }) => {
    await page.goto("/fleet-monitor");
    // After connecting, the bot should appear
    // Look for the bot emoji or name or "Online" state
    await expect(
      page
        .getByText(MOCK_BOT_EMOJI)
        .or(page.getByText(MOCK_BOT_NAME))
        .or(page.getByText(/online/i))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("sidebar shows fleet pulse", async ({ page }) => {
    await page.goto("/fleet-monitor");
    // Sidebar should have Fleet Monitor nav item
    await expect(
      page.getByRole("link", { name: /fleet/i }).or(
        page.getByText(/Fleet Monitor/i)
      )
    ).toBeVisible({ timeout: 10_000 });
  });
});
