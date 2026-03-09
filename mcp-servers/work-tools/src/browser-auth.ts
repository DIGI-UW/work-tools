/**
 * Shared Playwright token capture.
 *
 * Both Outlook and Harvest auth work the same way:
 * 1. Launch Chrome with a persistent profile (preserves SSO cookies)
 * 2. Navigate to the service URL
 * 3. Sniff Bearer token from outgoing API requests
 *
 * This extracts that shared pattern. Playwright is dynamically imported
 * so it's only loaded when browser auth is actually needed.
 */

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const PROFILE_DIR = process.env.WORK_MCP_PROFILE ?? `${HOME}/.work-mcp-profile`;

export interface CaptureResult {
  token: string;
  /** Extra headers captured (e.g. Harvest-Account-Id) */
  extras: Record<string, string>;
}

export interface CaptureOptions {
  /** URL to navigate to (triggers the auth flow) */
  url: string;
  /** Which request URLs to watch for Bearer tokens */
  matchUrl: string;
  /** Extra headers to capture from matching requests */
  extraHeaders?: string[];
  /** Timeout in ms (default: 5 min) */
  timeout?: number;
  /** Run headless (for auto-refresh) */
  headless?: boolean;
  /** Reuse an existing browser context (warmup shares one Chrome window) */
  existingContext?: import("playwright").BrowserContext;
}

export async function captureBearerToken(
  opts: CaptureOptions,
): Promise<CaptureResult> {
  const { chromium } = await import("playwright");

  const ownContext = !opts.existingContext;
  const context =
    opts.existingContext ??
    (await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: opts.headless ?? false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    }));

  try {
    const page = await context.newPage();

    // Set up listener BEFORE navigating — but don't await yet
    const tokenPromise = new Promise<CaptureResult>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Token capture timed out after ${(opts.timeout ?? 300_000) / 1000}s`)),
        opts.timeout ?? 300_000,
      );

      page.on("request", (req) => {
        const url = req.url();
        const headers = req.headers();
        const auth = headers["authorization"];

        if (auth?.startsWith("Bearer ") && url.includes(opts.matchUrl)) {
          clearTimeout(timer);
          const extras: Record<string, string> = {};
          for (const h of opts.extraHeaders ?? []) {
            if (headers[h.toLowerCase()]) extras[h] = headers[h.toLowerCase()];
          }
          resolve({ token: auth.slice(7), extras });
        }
      });
    });

    // Navigate — this triggers the requests the listener is watching for
    await page.goto(opts.url);
    return await tokenPromise;
  } finally {
    if (ownContext) await context.close();
  }
}
