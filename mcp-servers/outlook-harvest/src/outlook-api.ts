import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "fs";

const OUTLOOK_API_BASE = "https://outlook.office365.com/api/v2.0/me";
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

const HOME_DIR = process.env.HOME ?? process.env.USERPROFILE;
if (!HOME_DIR) {
  throw new Error(
    "[outlook-mcp] Cannot determine home directory. Set HOME or USERPROFILE.",
  );
}

const TOKEN_FILE = `${HOME_DIR}/.outlook-mcp-token.json`;
const PROFILE_DIR =
  process.env.WORK_MCP_PROFILE ?? `${HOME_DIR}/.work-mcp-profile`;

let cachedToken: string | null = null;
let tokenCapturedAt = 0;

/** Load token from disk (written by `warmup` command). */
function loadTokenFromDisk(): boolean {
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    if (data.token && Date.now() - data.capturedAt < SESSION_TTL_MS) {
      cachedToken = data.token;
      tokenCapturedAt = data.capturedAt;
      return true;
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return false;
}

function saveTokenToDisk(token: string, capturedAt: number): void {
  writeFileSync(TOKEN_FILE, JSON.stringify({ token, capturedAt }), {
    mode: 0o600,
  });
}

function invalidateTokenOnDisk(): void {
  try {
    unlinkSync(TOKEN_FILE);
  } catch {
    // Already gone
  }
}

function isTokenValid(): boolean {
  if (cachedToken && Date.now() - tokenCapturedAt < SESSION_TTL_MS) return true;
  return loadTokenFromDisk();
}

/**
 * Launch Chrome, navigate to Outlook web, capture the auth token
 * from network traffic. Saves token to disk for the MCP server to read.
 * Accepts optional existing browser context (shared with Harvest warmup).
 *
 * @param existingContext — reuse a browser context (e.g. warmup shares one Chrome window)
 * @param opts.headless — launch headless Chrome for silent auto-refresh (default: false)
 */
export async function captureToken(
  existingContext?: import("playwright").BrowserContext,
  opts?: { headless?: boolean },
): Promise<string> {
  if (isTokenValid()) return cachedToken!;

  const headless = opts?.headless ?? false;
  process.stderr.write(
    `[outlook] ${headless ? "Auto-refreshing" : "Launching browser to capture"} token...\n`,
  );

  const ownContext = !existingContext;
  const context =
    existingContext ??
    (await chromium.launchPersistentContext(PROFILE_DIR, {
      headless,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    }));

  try {
    const page = await context.newPage();

    process.stderr.write(
      "[outlook] Sign in to Outlook if prompted (first time only).\n",
    );

    const tokenPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            "Token capture timed out after 90s. Sign into Outlook in the browser window.",
          ),
        );
      }, 90_000);

      page.on("request", (req) => {
        const auth = req.headers()["authorization"];
        if (
          auth?.startsWith("Bearer ") &&
          req.url().includes("outlook.office365.com")
        ) {
          clearTimeout(timeout);
          resolve(auth.split("Bearer ")[1]);
        }
      });
    });

    await page.goto("https://outlook.office365.com/mail/");
    const token = await tokenPromise;

    cachedToken = token;
    tokenCapturedAt = Date.now();
    saveTokenToDisk(token, tokenCapturedAt);
    process.stderr.write("[outlook] Token captured and saved.\n");
    return token;
  } finally {
    if (ownContext) await context.close();
  }
}

/** Get a valid token — from memory, disk, or headless auto-refresh. */
export async function getToken(): Promise<string> {
  if (isTokenValid()) return cachedToken!;

  // Auto-refresh headlessly using persistent browser profile SSO cookies
  try {
    return await captureToken(undefined, { headless: true });
  } catch (err) {
    throw new Error(
      `Outlook auto-refresh failed: ${(err as Error).message}. Run \`outlook_refresh\` to sign in manually.`,
    );
  }
}

export function getSessionTimeRemaining(): number {
  if (!isTokenValid()) return 0;
  return Math.max(0, SESSION_TTL_MS - (Date.now() - tokenCapturedAt));
}

function escapeODataSearch(query: string): string {
  return query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function outlookFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const token = await getToken();
  const url = new URL(`${OUTLOOK_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      cachedToken = null;
      invalidateTokenOnDisk();
      // Try one headless auto-refresh before giving up
      try {
        await captureToken(undefined, { headless: true });
      } catch {
        throw new Error(
          "Outlook token expired and auto-refresh failed. Run `outlook_refresh` to sign in manually.",
        );
      }
      // Retry the original request with the fresh token
      const retryRes = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${cachedToken}`,
          Accept: "application/json",
        },
      });
      if (!retryRes.ok) {
        const retryText = await retryRes.text();
        throw new Error(`Outlook API ${retryRes.status} after refresh: ${retryText}`);
      }
      return retryRes.json() as Promise<T>;
    }
    throw new Error(`Outlook API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// --- Types ---

export interface OutlookEmail {
  Id: string;
  Subject: string;
  From: { EmailAddress: { Name: string; Address: string } };
  ReceivedDateTime: string;
  BodyPreview: string;
  IsRead: boolean;
}

export interface OutlookEmailFull extends OutlookEmail {
  Body: { ContentType: string; Content: string };
  ToRecipients: Array<{ EmailAddress: { Name: string; Address: string } }>;
  CcRecipients: Array<{ EmailAddress: { Name: string; Address: string } }>;
}

export interface OutlookEvent {
  Id: string;
  Subject: string;
  Start: { DateTime: string; TimeZone: string };
  End: { DateTime: string; TimeZone: string };
  Location?: { DisplayName: string };
  Organizer?: { EmailAddress: { Name: string; Address: string } };
  IsAllDay: boolean;
  IsCancelled: boolean;
}

// --- Public API ---

export async function listEmails(
  folder = "inbox",
  limit = 20,
): Promise<OutlookEmail[]> {
  const data = await outlookFetch<{ value: OutlookEmail[] }>(
    `/mailfolders/${encodeURIComponent(folder)}/messages`,
    {
      $top: String(limit),
      $select: "Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead",
      $orderby: "ReceivedDateTime desc",
    },
  );
  return data.value;
}

export async function readEmail(id: string): Promise<OutlookEmailFull> {
  return outlookFetch<OutlookEmailFull>(
    `/messages/${encodeURIComponent(id)}`,
    {
      $select:
        "Id,Subject,From,ReceivedDateTime,Body,ToRecipients,CcRecipients,IsRead",
    },
  );
}

export async function searchEmails(
  query: string,
  limit = 20,
): Promise<OutlookEmail[]> {
  const data = await outlookFetch<{ value: OutlookEmail[] }>("/messages", {
    $top: String(limit),
    $search: `"${escapeODataSearch(query)}"`,
    $select: "Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead",
    $orderby: "ReceivedDateTime desc",
  });
  return data.value;
}

export async function listEvents(
  startDate?: string,
  endDate?: string,
): Promise<OutlookEvent[]> {
  const start = startDate ? new Date(startDate) : new Date();
  if (isNaN(start.getTime())) throw new Error(`Invalid start date: ${startDate}`);
  const end = endDate
    ? new Date(endDate)
    : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (isNaN(end.getTime())) throw new Error(`Invalid end date: ${endDate}`);

  const data = await outlookFetch<{ value: OutlookEvent[] }>("/calendarview", {
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $top: "200",
    $select: "Id,Subject,Start,End,Location,Organizer,IsAllDay,IsCancelled",
    $orderby: "Start/DateTime",
  });
  return data.value;
}

export async function searchEvents(query: string): Promise<OutlookEvent[]> {
  const now = new Date();
  const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const data = await outlookFetch<{ value: OutlookEvent[] }>("/calendarview", {
    startDateTime: now.toISOString(),
    endDateTime: end.toISOString(),
    $top: "200",
    $select: "Id,Subject,Start,End,Location,Organizer,IsAllDay,IsCancelled",
    $orderby: "Start/DateTime",
  });
  const q = query.toLowerCase();
  return data.value.filter(
    (e) =>
      e.Subject?.toLowerCase().includes(q) ||
      e.Location?.DisplayName?.toLowerCase().includes(q) ||
      e.Organizer?.EmailAddress?.Address?.toLowerCase().includes(q),
  );
}
