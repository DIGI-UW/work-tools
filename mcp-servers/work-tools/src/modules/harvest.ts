/**
 * Harvest module — time tracking via Harvest V2 API.
 *
 * Two auth paths (crystal clear):
 *   1. PAT (env vars) — set HARVEST_ACCESS_TOKEN + HARVEST_ACCOUNT_ID. No browser needed.
 *   2. Browser capture — Playwright sniffs token from Harvest web app. 8h TTL.
 *
 * PAT is checked first. Browser capture is only used if env vars are missing.
 */
import { z } from "zod";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolModule } from "../types.js";
import { captureBearerToken } from "../browser-auth.js";

// ── Config ─────────────────────────────────────────────────

const API_BASE = "https://api.harvestapp.com/v2";
const TTL_MS = 8 * 60 * 60 * 1000;
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const TOKEN_FILE = `${HOME}/.harvest-mcp-token.json`;
const NOT_CONFIGURED = "Harvest not configured. Run warmup or set HARVEST_ACCESS_TOKEN + HARVEST_ACCOUNT_ID.";

// ── Auth state ─────────────────────────────────────────────

let cachedToken: string | null = null;
let cachedAccountId: string | null = null;
let tokenCapturedAt = 0;

/** Is PAT configured via env vars? */
function hasPAT(): boolean {
  return !!(process.env.HARVEST_ACCESS_TOKEN && process.env.HARVEST_ACCOUNT_ID);
}

function loadFromDisk(): boolean {
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    if (data.token && data.accountId && Date.now() - data.capturedAt < TTL_MS) {
      cachedToken = data.token;
      cachedAccountId = data.accountId;
      tokenCapturedAt = data.capturedAt;
      return true;
    }
  } catch { /* missing or invalid */ }
  return false;
}

function saveToDisk(token: string, accountId: string, at: number): void {
  writeFileSync(TOKEN_FILE, JSON.stringify({ token, accountId, capturedAt: at }), { mode: 0o600 });
}

function invalidateDisk(): void {
  try { unlinkSync(TOKEN_FILE); } catch { /* gone */ }
}

function isBrowserTokenValid(): boolean {
  if (cachedToken && cachedAccountId && Date.now() - tokenCapturedAt < TTL_MS) return true;
  return loadFromDisk();
}

function isConfigured(): boolean {
  return hasPAT() || isBrowserTokenValid();
}

function sessionTimeRemaining(): number {
  if (hasPAT()) return Infinity;
  if (!isBrowserTokenValid()) return 0;
  return Math.max(0, TTL_MS - (Date.now() - tokenCapturedAt));
}

// ── Auth ───────────────────────────────────────────────────

async function capture(
  existingContext?: import("playwright").BrowserContext,
): Promise<{ token: string; accountId: string }> {
  if (isBrowserTokenValid()) return { token: cachedToken!, accountId: cachedAccountId! };

  process.stderr.write("[harvest] Launching browser to capture token...\n");
  const result = await captureBearerToken({
    url: "https://app.harvestapp.com/time",
    matchUrl: "api.harvestapp.com",
    extraHeaders: ["Harvest-Account-Id"],
    existingContext,
  });

  cachedToken = result.token;
  cachedAccountId = result.extras["Harvest-Account-Id"] ?? "";
  tokenCapturedAt = Date.now();
  saveToDisk(result.token, cachedAccountId, tokenCapturedAt);
  process.stderr.write("[harvest] Token + account ID captured.\n");
  return { token: result.token, accountId: cachedAccountId };
}

/** Get auth headers — PAT first, then browser token. */
function getHeaders(): Record<string, string> {
  const token = process.env.HARVEST_ACCESS_TOKEN ?? cachedToken;
  const accountId = process.env.HARVEST_ACCOUNT_ID ?? cachedAccountId;
  if (!token || !accountId) throw new Error(NOT_CONFIGURED);
  return {
    Authorization: `Bearer ${token}`,
    "Harvest-Account-Id": accountId,
    "Content-Type": "application/json",
    "User-Agent": "WorkTools-MCP/1.0",
  };
}

// ── HTTP helpers ───────────────────────────────────────────

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) {
    if (res.status === 401) { cachedToken = null; invalidateDisk(); }
    throw new Error(`Harvest API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Harvest API ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "PATCH", headers: getHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Harvest API ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: getHeaders() });
  if (!res.ok) throw new Error(`Harvest API ${res.status}: ${await res.text().catch(() => "")}`);
}

// ── Types ──────────────────────────────────────────────────

interface TimeEntry {
  id: number; spent_date: string; hours: number; notes: string | null; is_running: boolean;
  project: { id: number; name: string; code: string };
  task: { id: number; name: string };
  user: { id: number; name: string };
}

interface ProjectAssignment {
  id: number; is_active: boolean;
  project: { id: number; name: string; code: string };
  client: { id: number; name: string } | null;
  task_assignments: Array<{ id: number; task: { id: number; name: string }; is_active: boolean; billable: boolean }>;
}

// ── API functions ──────────────────────────────────────────

async function listProjects() {
  const data = await apiGet<{ project_assignments: ProjectAssignment[] }>("/users/me/project_assignments");
  return data.project_assignments.filter((a) => a.is_active).map((a) => ({
    id: a.project.id, name: a.project.name, code: a.project.code, is_active: a.is_active, client: a.client,
  }));
}

async function listTasksForProject(projectId: number) {
  const data = await apiGet<{ project_assignments: ProjectAssignment[] }>("/users/me/project_assignments");
  const pa = data.project_assignments.find((a) => a.project.id === projectId);
  if (!pa) return [];
  return pa.task_assignments.filter((ta) => ta.is_active).map((ta) => ({
    id: ta.id, task_id: ta.task.id, task_name: ta.task.name, billable: ta.billable,
  }));
}

async function listTimeEntries(opts: { from?: string; to?: string; project_id?: number; per_page?: number }) {
  const params: Record<string, string> = {};
  if (opts.from) params.from = opts.from;
  if (opts.to) params.to = opts.to;
  if (opts.project_id) params.project_id = String(opts.project_id);
  if (opts.per_page) params.per_page = String(opts.per_page);
  return apiGet<{ time_entries: TimeEntry[]; total_entries: number }>("/time_entries", params);
}

// Harvest API ignores `hours` for Member-role accounts. We always send started_time/ended_time —
// either explicit (caller-supplied, preferred) or synthesized from hours starting at 8:00am (fallback).
function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function synthesizeTimes(hours: number): { started_time: string; ended_time: string } {
  const wholeH = Math.floor(hours);
  const mins = Math.round((hours - wholeH) * 60);
  const endH = 8 + wholeH;
  return {
    started_time: "8:00am",
    ended_time: `${endH > 12 ? endH - 12 : endH}:${String(mins).padStart(2, "0")}${endH >= 12 ? "pm" : "am"}`,
  };
}

function applyTimes(
  body: Record<string, unknown>,
  input: { hours?: number; started_time?: string; ended_time?: string },
): void {
  const hasStart = input.started_time != null;
  const hasEnd = input.ended_time != null;
  if (hasStart !== hasEnd) {
    throw new Error("started_time and ended_time must be provided together (HH:MM 24-hour format).");
  }
  if (hasStart && hasEnd) {
    body.started_time = to12Hour(input.started_time!);
    body.ended_time = to12Hour(input.ended_time!);
    return;
  }
  if (input.hours != null) {
    Object.assign(body, synthesizeTimes(input.hours));
  }
}

async function createTimeEntry(input: {
  project_id: number; task_id: number; spent_date: string;
  hours?: number; notes?: string; started_time?: string; ended_time?: string;
}) {
  const body: Record<string, unknown> = {
    project_id: input.project_id, task_id: input.task_id, spent_date: input.spent_date,
  };
  if (input.notes) body.notes = input.notes;
  applyTimes(body, input);
  return apiPost<TimeEntry>("/time_entries", body);
}

async function updateTimeEntry(entryId: number, input: {
  hours?: number; notes?: string; started_time?: string; ended_time?: string;
  project_id?: number; task_id?: number; spent_date?: string;
}) {
  const body: Record<string, unknown> = {};
  if (input.project_id != null) body.project_id = input.project_id;
  if (input.task_id != null) body.task_id = input.task_id;
  if (input.spent_date != null) body.spent_date = input.spent_date;
  if (input.notes != null) body.notes = input.notes;
  applyTimes(body, input);
  return apiPatch<TimeEntry>(`/time_entries/${entryId}`, body);
}

async function deleteTimeEntry(entryId: number) {
  return apiDelete(`/time_entries/${entryId}`);
}

async function getWeeklySummary(weekOf: string) {
  const date = new Date(weekOf);
  const day = date.getUTCDay();
  const monday = new Date(date); monday.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const result = await listTimeEntries({ from: fmt(monday), to: fmt(sunday), per_page: 100 });
  const map = new Map<string, { project_name: string; task_name: string; total_hours: number; entry_count: number }>();
  for (const e of result.time_entries) {
    const key = `${e.project.id}:${e.task.id}`;
    const ex = map.get(key);
    if (ex) { ex.total_hours += e.hours; ex.entry_count += 1; }
    else map.set(key, { project_name: e.project.name, task_name: e.task.name, total_hours: e.hours, entry_count: 1 });
  }
  return {
    week_start: fmt(monday), week_end: fmt(sunday),
    total_hours: result.time_entries.reduce((s, e) => s + e.hours, 0),
    entries: Array.from(map.values()),
  };
}

// ── ToolModule ─────────────────────────────────────────────

export const harvest: ToolModule = {
  name: "harvest",

  async status() {
    if (hasPAT()) return "Harvest: connected via PAT (env vars)";
    const rem = sessionTimeRemaining();
    if (rem > 0) return `Harvest: browser session (${Math.floor(rem / 60000)}m remaining)`;
    return "Harvest: not configured";
  },

  async warmup() {
    if (hasPAT()) return "Harvest: OK (PAT configured)";
    await capture();
    const mins = Math.floor(sessionTimeRemaining() / 60000);
    return `Harvest: OK (${mins}m remaining)`;
  },

  register(server: McpServer) {
    const guard = () => {
      if (!isConfigured()) throw new Error(NOT_CONFIGURED);
    };

    server.tool("harvest_status", "Check Harvest connection status", {}, async () => {
      const method = hasPAT() ? "env_vars (PAT)" : isBrowserTokenValid() ? "browser_session" : "none";
      const mins = hasPAT() ? null : Math.floor(sessionTimeRemaining() / 60000);
      return { content: [{ type: "text", text: JSON.stringify({
        connected: isConfigured(), auth_method: method, minutes_remaining: mins,
        message: await harvest.status(),
      }, null, 2) }] };
    });

    server.tool("harvest_refresh", "Refresh Harvest session token (opens browser briefly)", {}, async () => {
      try {
        await capture();
        return { content: [{ type: "text", text: `Harvest token refreshed. ${Math.floor(sessionTimeRemaining() / 60000)}m remaining.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Refresh failed: ${(err as Error).message}` }], isError: true };
      }
    });

    server.tool("harvest_list_projects", "List Harvest projects assigned to you", {}, async () => {
      guard();
      return { content: [{ type: "text", text: JSON.stringify(await listProjects(), null, 2) }] };
    });

    server.tool("harvest_list_tasks", "List tasks for a Harvest project", {
      project_id: z.number().int().positive().describe("Harvest project ID"),
    }, async ({ project_id }) => {
      guard();
      return { content: [{ type: "text", text: JSON.stringify(await listTasksForProject(project_id), null, 2) }] };
    });

    server.tool("harvest_list_time_entries", "List Harvest time entries by date range", {
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date (YYYY-MM-DD)"),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date (YYYY-MM-DD)"),
      project_id: z.number().int().positive().optional().describe("Filter by project ID"),
    }, async ({ from, to, project_id }) => {
      guard();
      return { content: [{ type: "text", text: JSON.stringify(await listTimeEntries({ from, to, project_id, per_page: 100 }), null, 2) }] };
    });

    const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d$/;

    server.tool("harvest_create_time_entry", "Create a Harvest time entry. Provide either hours (placed at 8am) or started_time+ended_time (HH:MM 24h) for exact placement.", {
      project_id: z.number().int().positive().describe("Harvest project ID"),
      task_id: z.number().int().positive().describe("Harvest task ID"),
      spent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date (YYYY-MM-DD)"),
      hours: z.number().positive().max(24).optional().describe("Hours worked. Ignored if started_time/ended_time provided."),
      notes: z.string().max(255).optional().describe("Notes"),
      started_time: z.string().regex(timeRegex).optional().describe("Start time (HH:MM 24-hour, e.g. '14:00'). Must be paired with ended_time."),
      ended_time: z.string().regex(timeRegex).optional().describe("End time (HH:MM 24-hour, e.g. '16:30'). Must be paired with started_time."),
    }, async ({ project_id, task_id, spent_date, hours, notes, started_time, ended_time }) => {
      guard();
      if (hours == null && (started_time == null || ended_time == null)) {
        throw new Error("Provide either `hours` or both `started_time` and `ended_time`.");
      }
      return { content: [{ type: "text", text: JSON.stringify(await createTimeEntry({ project_id, task_id, spent_date, hours, notes, started_time, ended_time }), null, 2) }] };
    });

    server.tool("harvest_update_time_entry", "Update an existing Harvest time entry. Any field can be changed; provide started_time+ended_time together to shift the entry's time-of-day.", {
      entry_id: z.number().int().positive().describe("Time entry ID"),
      hours: z.number().positive().max(24).optional().describe("Updated hours. Ignored if started_time/ended_time provided."),
      notes: z.string().max(255).optional().describe("Updated notes"),
      started_time: z.string().regex(timeRegex).optional().describe("Start time (HH:MM 24-hour). Must be paired with ended_time."),
      ended_time: z.string().regex(timeRegex).optional().describe("End time (HH:MM 24-hour). Must be paired with started_time."),
      project_id: z.number().int().positive().optional().describe("Move entry to a different project"),
      task_id: z.number().int().positive().optional().describe("Move entry to a different task"),
      spent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Move entry to a different date (YYYY-MM-DD)"),
    }, async ({ entry_id, hours, notes, started_time, ended_time, project_id, task_id, spent_date }) => {
      guard();
      return { content: [{ type: "text", text: JSON.stringify(await updateTimeEntry(entry_id, { hours, notes, started_time, ended_time, project_id, task_id, spent_date }), null, 2) }] };
    });

    server.tool("harvest_delete_time_entry", "Delete a Harvest time entry", {
      entry_id: z.number().int().positive().describe("Time entry ID"),
    }, async ({ entry_id }) => {
      guard();
      await deleteTimeEntry(entry_id);
      return { content: [{ type: "text", text: `Time entry ${entry_id} deleted.` }] };
    });

    server.tool("harvest_weekly_summary", "Get hours summary for the week containing a date", {
      week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Any date in the target week (YYYY-MM-DD, default: today)"),
    }, async ({ week_of }) => {
      guard();
      return { content: [{ type: "text", text: JSON.stringify(await getWeeklySummary(week_of ?? new Date().toISOString().slice(0, 10)), null, 2) }] };
    });
  },
};
