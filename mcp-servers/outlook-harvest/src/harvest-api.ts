/**
 * Standalone Harvest V2 API client.
 * Auth: env vars HARVEST_ACCESS_TOKEN + HARVEST_ACCOUNT_ID (easiest),
 * or browser-captured session token via warmup (no developer setup needed).
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "fs";

const HARVEST_API_BASE = "https://api.harvestapp.com/v2";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // Harvest sessions last ~8h

const HOME_DIR = process.env.HOME ?? process.env.USERPROFILE;
if (!HOME_DIR) throw new Error("[harvest] Cannot determine home directory.");

const TOKEN_FILE = `${HOME_DIR}/.harvest-mcp-token.json`;
const PROFILE_DIR =
  process.env.WORK_MCP_PROFILE ?? `${HOME_DIR}/.work-mcp-profile`;

let cachedToken: string | null = null;
let cachedAccountId: string | null = null;
let tokenCapturedAt = 0;

/** Load token from disk (written by warmup). */
function loadTokenFromDisk(): boolean {
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    if (data.token && data.accountId && Date.now() - data.capturedAt < SESSION_TTL_MS) {
      cachedToken = data.token;
      cachedAccountId = data.accountId;
      tokenCapturedAt = data.capturedAt;
      return true;
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return false;
}

function saveTokenToDisk(token: string, accountId: string, capturedAt: number): void {
  writeFileSync(TOKEN_FILE, JSON.stringify({ token, accountId, capturedAt }), {
    mode: 0o600,
  });
}

function invalidateTokenOnDisk(): void {
  try { unlinkSync(TOKEN_FILE); } catch { /* already gone */ }
}

function isTokenValid(): boolean {
  if (cachedToken && cachedAccountId && Date.now() - tokenCapturedAt < SESSION_TTL_MS) return true;
  return loadTokenFromDisk();
}

/**
 * Launch Chrome, navigate to Harvest, capture the auth token + account ID
 * from API network traffic. Uses shared persistent browser profile.
 */
export async function captureHarvestToken(
  existingContext?: import("playwright").BrowserContext,
): Promise<{ token: string; accountId: string }> {
  if (isTokenValid()) return { token: cachedToken!, accountId: cachedAccountId! };

  process.stderr.write("[harvest] Launching browser to capture token...\n");

  // Use provided context (shared with Outlook) or launch own
  const ownContext = !existingContext;
  const context =
    existingContext ??
    (await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    }));

  try {
    const page = await context.newPage();

    process.stderr.write(
      "[harvest] Browser opened. Sign in to Harvest if prompted.\n",
    );

    const tokenPromise = new Promise<{ token: string; accountId: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              "Harvest token capture timed out after 90s. Sign into Harvest in the browser.",
            ),
          );
        }, 90_000);

        page.on("request", (req) => {
          const url = req.url();
          const headers = req.headers();
          const auth = headers["authorization"];
          const accountId = headers["harvest-account-id"];

          if (
            auth?.startsWith("Bearer ") &&
            accountId &&
            url.includes("api.harvestapp.com")
          ) {
            clearTimeout(timeout);
            resolve({ token: auth.split("Bearer ")[1], accountId });
          }
        });
      },
    );

    await page.goto("https://app.harvestapp.com/time");
    const result = await tokenPromise;

    cachedToken = result.token;
    cachedAccountId = result.accountId;
    tokenCapturedAt = Date.now();
    saveTokenToDisk(result.token, result.accountId, tokenCapturedAt);
    process.stderr.write("[harvest] Token + account ID captured and saved.\n");
    return result;
  } finally {
    if (ownContext) await context.close();
  }
}

function getHeaders(): Record<string, string> {
  // Prefer captured token, fall back to env vars
  const token = cachedToken ?? process.env.HARVEST_ACCESS_TOKEN;
  const accountId = cachedAccountId ?? process.env.HARVEST_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error(
      "Harvest not configured. Run warmup or set HARVEST_ACCESS_TOKEN + HARVEST_ACCOUNT_ID.",
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Harvest-Account-Id": accountId,
    "Content-Type": "application/json",
    "User-Agent": "WorkTools-MCP/1.0",
  };
}

export function isHarvestConfigured(): boolean {
  return isTokenValid() || !!(process.env.HARVEST_ACCESS_TOKEN && process.env.HARVEST_ACCOUNT_ID);
}

export function getHarvestSessionTimeRemaining(): number {
  if (!isTokenValid()) return 0;
  return Math.max(0, SESSION_TTL_MS - (Date.now() - tokenCapturedAt));
}

async function harvestGet<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${HARVEST_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) { cachedToken = null; invalidateTokenOnDisk(); }
    throw new Error(`Harvest API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function harvestPost<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${HARVEST_API_BASE}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Harvest API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function harvestPatch<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${HARVEST_API_BASE}${path}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Harvest API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function harvestDelete(path: string): Promise<void> {
  const res = await fetch(`${HARVEST_API_BASE}${path}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Harvest API ${res.status}: ${text}`);
  }
}

// --- Types ---

export interface HarvestProject {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  client: { id: number; name: string } | null;
}

export interface HarvestTimeEntry {
  id: number;
  spent_date: string;
  hours: number;
  notes: string | null;
  is_running: boolean;
  project: { id: number; name: string; code: string };
  task: { id: number; name: string };
  user: { id: number; name: string };
}

interface ProjectAssignment {
  id: number;
  is_active: boolean;
  project: { id: number; name: string; code: string };
  client: { id: number; name: string } | null;
  task_assignments: Array<{
    id: number;
    task: { id: number; name: string };
    is_active: boolean;
    billable: boolean;
  }>;
}

// --- Public API ---

export async function listProjects(): Promise<HarvestProject[]> {
  const data = await harvestGet<{ project_assignments: ProjectAssignment[] }>(
    "/users/me/project_assignments",
  );
  return data.project_assignments
    .filter((a) => a.is_active)
    .map((a) => ({
      id: a.project.id,
      name: a.project.name,
      code: a.project.code,
      is_active: a.is_active,
      client: a.client,
    }));
}

export async function listTasksForProject(
  projectId: number,
): Promise<Array<{ id: number; task_id: number; task_name: string; billable: boolean }>> {
  const data = await harvestGet<{ project_assignments: ProjectAssignment[] }>(
    "/users/me/project_assignments",
  );
  const pa = data.project_assignments.find((a) => a.project.id === projectId);
  if (!pa) return [];
  return pa.task_assignments
    .filter((ta) => ta.is_active)
    .map((ta) => ({
      id: ta.id,
      task_id: ta.task.id,
      task_name: ta.task.name,
      billable: ta.billable,
    }));
}

export async function listTimeEntries(opts: {
  from?: string;
  to?: string;
  project_id?: number;
  page?: number;
  per_page?: number;
}): Promise<{ time_entries: HarvestTimeEntry[]; total_entries: number }> {
  const params: Record<string, string> = {};
  if (opts.from) params.from = opts.from;
  if (opts.to) params.to = opts.to;
  if (opts.project_id) params.project_id = String(opts.project_id);
  if (opts.page) params.page = String(opts.page);
  if (opts.per_page) params.per_page = String(opts.per_page);

  const data = await harvestGet<{
    time_entries: HarvestTimeEntry[];
    total_entries: number;
  }>("/time_entries", params);
  return data;
}

export async function getTimeEntry(entryId: number): Promise<HarvestTimeEntry> {
  return harvestGet<HarvestTimeEntry>(`/time_entries/${entryId}`);
}

/**
 * Create a time entry. Uses started_time/ended_time to set hours because
 * the Harvest API ignores the `hours` param for Member-role accounts.
 */
export async function createTimeEntry(input: {
  project_id: number;
  task_id: number;
  spent_date: string;
  hours?: number;
  notes?: string;
}): Promise<HarvestTimeEntry> {
  const body: Record<string, unknown> = {
    project_id: input.project_id,
    task_id: input.task_id,
    spent_date: input.spent_date,
  };
  if (input.notes) body.notes = input.notes;

  if (input.hours != null) {
    const wholeHours = Math.floor(input.hours);
    const minutes = Math.round((input.hours - wholeHours) * 60);
    const endHour = 8 + wholeHours;
    const endMin = minutes;
    body.started_time = "8:00am";
    const endH = endHour > 12 ? endHour - 12 : endHour;
    const ampm = endHour >= 12 ? "pm" : "am";
    body.ended_time = `${endH}:${String(endMin).padStart(2, "0")}${ampm}`;
  }

  return harvestPost<HarvestTimeEntry>("/time_entries", body);
}

export async function updateTimeEntry(
  entryId: number,
  input: { hours?: number; notes?: string; project_id?: number; task_id?: number },
): Promise<HarvestTimeEntry> {
  return harvestPatch<HarvestTimeEntry>(`/time_entries/${entryId}`, input);
}

export async function deleteTimeEntry(entryId: number): Promise<void> {
  return harvestDelete(`/time_entries/${entryId}`);
}

export async function getWeeklySummary(weekOf: string): Promise<{
  week_start: string;
  week_end: string;
  total_hours: number;
  entries: Array<{
    project_name: string;
    task_name: string;
    total_hours: number;
    entry_count: number;
  }>;
}> {
  const date = new Date(weekOf);
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const from = fmt(monday);
  const to = fmt(sunday);

  const result = await listTimeEntries({ from, to, per_page: 100 });
  const map = new Map<string, { project_name: string; task_name: string; total_hours: number; entry_count: number }>();

  for (const e of result.time_entries) {
    const key = `${e.project.id}:${e.task.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.total_hours += e.hours;
      existing.entry_count += 1;
    } else {
      map.set(key, {
        project_name: e.project.name,
        task_name: e.task.name,
        total_hours: e.hours,
        entry_count: 1,
      });
    }
  }

  return {
    week_start: from,
    week_end: to,
    total_hours: result.time_entries.reduce((sum, e) => sum + e.hours, 0),
    entries: Array.from(map.values()),
  };
}
