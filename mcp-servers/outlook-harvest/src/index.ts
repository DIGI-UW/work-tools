#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env.local from repo root (three levels up from dist/index.js → mcp-servers/outlook-harvest/dist/)
// Supports cowork/scheduled tasks where MCP -e env vars may not propagate
const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dirname, "../../../.env.local");
try {
  const lines = readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?(\w+)\s*=\s*"?([^"]*)"?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
  process.stderr.write(`[work-tools] Loaded env from ${envFile}\n`);
} catch {
  // No .env.local — try home-dir fallback
}

// Fallback: ~/.work-tools.env (works if repo moves, scheduled tasks, any context)
const homeEnvFile = resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".work-tools.env");
try {
  const lines = readFileSync(homeEnvFile, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?(\w+)\s*=\s*"?([^"]*)"?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
  process.stderr.write(`[work-tools] Loaded env from ${homeEnvFile}\n`);
} catch {
  // No ~/.work-tools.env — that's fine
}

// Outlook
import {
  captureToken,
  getSessionTimeRemaining,
  listEmails,
  readEmail,
  searchEmails,
  listEvents as listOutlookEvents,
  searchEvents as searchOutlookEvents,
} from "./outlook-api.js";

// Harvest
import {
  isHarvestConfigured,
  getHarvestSessionTimeRemaining,
  captureHarvestToken,
  listProjects,
  listTasksForProject,
  listTimeEntries,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getWeeklySummary,
} from "./harvest-api.js";

const server = new McpServer({
  name: "work-tools",
  version: "1.0.0",
});

const NOT_CONFIGURED = "Harvest not configured. Run warmup (browser auth) or set HARVEST_ACCESS_TOKEN + HARVEST_ACCOUNT_ID env vars.";

// ============================================================
// WARMUP
// ============================================================

server.tool(
  "warmup",
  "Capture auth tokens for Outlook + Harvest (opens browser briefly). Call this before using other tools if sessions are expired.",
  {},
  async () => {
    const results: string[] = [];

    // Outlook
    try {
      await captureToken();
      const mins = Math.floor(getSessionTimeRemaining() / 60000);
      results.push(`Outlook: OK (${mins}m remaining)`);
    } catch (err) {
      results.push(`Outlook: FAILED — ${(err as Error).message}`);
    }

    // Harvest (skip if using PAT)
    const hasEnv = !!(process.env.HARVEST_ACCESS_TOKEN && process.env.HARVEST_ACCOUNT_ID);
    if (hasEnv) {
      results.push("Harvest: OK (PAT configured)");
    } else {
      try {
        await captureHarvestToken();
        const mins = Math.floor(getHarvestSessionTimeRemaining() / 60000);
        results.push(`Harvest: OK (${mins}m remaining)`);
      } catch (err) {
        results.push(`Harvest: FAILED — ${(err as Error).message}`);
      }
    }

    const allOk = results.every((r) => r.includes("OK"));
    return {
      content: [{ type: "text", text: results.join("\n") }],
      isError: !allOk,
    };
  },
);

// ============================================================
// OUTLOOK TOOLS
// ============================================================

server.tool(
  "outlook_status",
  "Check Outlook session status",
  {},
  async () => {
    const remaining = getSessionTimeRemaining();
    const minutes = Math.floor(remaining / 60000);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          connected: remaining > 0,
          minutes_remaining: minutes,
          message: remaining > 0
            ? `Outlook active (${minutes}m remaining)`
            : "No session. Run: cd tools/work-mcp && npm run warmup",
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "outlook_refresh",
  "Refresh the Outlook token (opens browser briefly)",
  {},
  async () => {
    try {
      await captureToken();
      return { content: [{ type: "text", text: `Token refreshed. ${Math.floor(getSessionTimeRemaining() / 60000)}m remaining.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Refresh failed: ${(err as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  "outlook_list_emails",
  "List recent Outlook emails",
  {
    folder: z.string().optional().describe("Mail folder (default: inbox)"),
    limit: z.number().int().min(1).max(100).optional().describe("Max emails (1-100, default: 20)"),
  },
  async ({ folder, limit }) => {
    const emails = await listEmails(folder ?? "inbox", limit ?? 20);
    const formatted = emails.map((e) => ({
      id: e.Id,
      subject: e.Subject,
      from: `${e.From.EmailAddress.Name} <${e.From.EmailAddress.Address}>`,
      date: e.ReceivedDateTime,
      preview: e.BodyPreview,
      read: e.IsRead,
    }));
    return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
  },
);

server.tool(
  "outlook_read_email",
  "Read full email content by ID",
  { id: z.string().describe("Email ID") },
  async ({ id }) => {
    const email = await readEmail(id);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          subject: email.Subject,
          from: `${email.From.EmailAddress.Name} <${email.From.EmailAddress.Address}>`,
          to: email.ToRecipients?.map((r) => `${r.EmailAddress.Name} <${r.EmailAddress.Address}>`) ?? [],
          cc: email.CcRecipients?.map((r) => `${r.EmailAddress.Name} <${r.EmailAddress.Address}>`) ?? [],
          date: email.ReceivedDateTime,
          body: email.Body.Content,
          bodyType: email.Body.ContentType,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "outlook_search_emails",
  "Search Outlook emails by keyword",
  {
    query: z.string().describe("Search query"),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (1-50, default: 20)"),
  },
  async ({ query, limit }) => {
    const emails = await searchEmails(query, limit ?? 20);
    const formatted = emails.map((e) => ({
      id: e.Id,
      subject: e.Subject,
      from: `${e.From.EmailAddress.Name} <${e.From.EmailAddress.Address}>`,
      date: e.ReceivedDateTime,
      preview: e.BodyPreview,
    }));
    return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
  },
);

server.tool(
  "outlook_list_events",
  "List Outlook calendar events for a date range (default: next 7 days)",
  {
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().describe("Start date (YYYY-MM-DD)"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().describe("End date (YYYY-MM-DD)"),
    include_cancelled: z.boolean().optional().describe("Include cancelled events"),
  },
  async ({ start_date, end_date, include_cancelled }) => {
    const events = await listOutlookEvents(start_date, end_date);
    const filtered = include_cancelled ? events : events.filter((e) => !e.IsCancelled);
    const formatted = filtered.map((e) => ({
      id: e.Id,
      subject: e.Subject,
      start: e.Start.DateTime,
      end: e.End.DateTime,
      timezone: e.Start.TimeZone,
      location: e.Location?.DisplayName || null,
      organizer: e.Organizer?.EmailAddress?.Address,
      allDay: e.IsAllDay,
    }));
    return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
  },
);

server.tool(
  "outlook_search_events",
  "Search Outlook calendar events (subject, location, organizer)",
  { query: z.string().describe("Search query") },
  async ({ query }) => {
    const events = await searchOutlookEvents(query);
    const formatted = events.map((e) => ({
      id: e.Id,
      subject: e.Subject,
      start: e.Start.DateTime,
      end: e.End.DateTime,
      location: e.Location?.DisplayName || null,
      organizer: e.Organizer?.EmailAddress?.Address,
    }));
    return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
  },
);

// ============================================================
// HARVEST TOOLS
// ============================================================

server.tool(
  "harvest_status",
  "Check Harvest connection status",
  {},
  async () => {
    const hasEnv = !!(process.env.HARVEST_ACCESS_TOKEN && process.env.HARVEST_ACCOUNT_ID);
    const sessionRemaining = getHarvestSessionTimeRemaining();
    const minutes = Math.floor(sessionRemaining / 60000);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          connected: isHarvestConfigured(),
          auth_method: hasEnv ? "env_vars (PAT)" : sessionRemaining > 0 ? "browser_session" : "none",
          minutes_remaining: hasEnv ? null : minutes,
          message: hasEnv
            ? "Harvest connected via Personal Access Token"
            : sessionRemaining > 0
              ? `Harvest active via browser session (${minutes}m remaining)`
              : "Not connected. Run warmup or set HARVEST_ACCESS_TOKEN + HARVEST_ACCOUNT_ID.",
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "harvest_refresh",
  "Refresh Harvest session token (opens browser briefly)",
  {},
  async () => {
    try {
      await captureHarvestToken();
      const mins = Math.floor(getHarvestSessionTimeRemaining() / 60000);
      return { content: [{ type: "text", text: `Harvest token refreshed. ${mins}m remaining.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Refresh failed: ${(err as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  "harvest_list_projects",
  "List Harvest projects assigned to you",
  {},
  async () => {
    if (!isHarvestConfigured()) return { content: [{ type: "text", text: NOT_CONFIGURED }], isError: true };
    const projects = await listProjects();
    return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
  },
);

server.tool(
  "harvest_list_tasks",
  "List tasks for a Harvest project",
  { project_id: z.number().int().positive().describe("Harvest project ID") },
  async ({ project_id }) => {
    if (!isHarvestConfigured()) return { content: [{ type: "text", text: NOT_CONFIGURED }], isError: true };
    const tasks = await listTasksForProject(project_id);
    return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
  },
);

server.tool(
  "harvest_list_time_entries",
  "List Harvest time entries by date range",
  {
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date (YYYY-MM-DD)"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date (YYYY-MM-DD)"),
    project_id: z.number().int().positive().optional().describe("Filter by project ID"),
  },
  async ({ from, to, project_id }) => {
    if (!isHarvestConfigured()) return { content: [{ type: "text", text: NOT_CONFIGURED }], isError: true };
    const result = await listTimeEntries({ from, to, project_id, per_page: 100 });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "harvest_create_time_entry",
  "Create a Harvest time entry (hours logged, no timer)",
  {
    project_id: z.number().int().positive().describe("Harvest project ID"),
    task_id: z.number().int().positive().describe("Harvest task ID"),
    spent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date (YYYY-MM-DD)"),
    hours: z.number().positive().max(24).describe("Hours worked"),
    notes: z.string().max(255).optional().describe("Notes"),
  },
  async ({ project_id, task_id, spent_date, hours, notes }) => {
    if (!isHarvestConfigured()) return { content: [{ type: "text", text: NOT_CONFIGURED }], isError: true };
    const entry = await createTimeEntry({ project_id, task_id, spent_date, hours, notes });
    return { content: [{ type: "text", text: JSON.stringify(entry, null, 2) }] };
  },
);

server.tool(
  "harvest_update_time_entry",
  "Update an existing Harvest time entry",
  {
    entry_id: z.number().int().positive().describe("Time entry ID"),
    hours: z.number().positive().max(24).optional().describe("Updated hours"),
    notes: z.string().max(255).optional().describe("Updated notes"),
  },
  async ({ entry_id, hours, notes }) => {
    if (!isHarvestConfigured()) return { content: [{ type: "text", text: NOT_CONFIGURED }], isError: true };
    const entry = await updateTimeEntry(entry_id, { hours, notes });
    return { content: [{ type: "text", text: JSON.stringify(entry, null, 2) }] };
  },
);

server.tool(
  "harvest_delete_time_entry",
  "Delete a Harvest time entry",
  { entry_id: z.number().int().positive().describe("Time entry ID") },
  async ({ entry_id }) => {
    if (!isHarvestConfigured()) return { content: [{ type: "text", text: NOT_CONFIGURED }], isError: true };
    await deleteTimeEntry(entry_id);
    return { content: [{ type: "text", text: `Time entry ${entry_id} deleted.` }] };
  },
);

server.tool(
  "harvest_weekly_summary",
  "Get hours summary for the week containing a date",
  {
    week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Any date in the target week (YYYY-MM-DD, default: today)"),
  },
  async ({ week_of }) => {
    if (!isHarvestConfigured()) return { content: [{ type: "text", text: NOT_CONFIGURED }], isError: true };
    const summary = await getWeeklySummary(week_of ?? new Date().toISOString().slice(0, 10));
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  },
);

// ============================================================
// LIFECYCLE
// ============================================================

// Outlook status — server stays alive and auto-refreshes headlessly via SSO cookies
const outlookRemaining = getSessionTimeRemaining();
if (outlookRemaining > 0) {
  process.stderr.write(`[work-tools] Outlook: active (${Math.floor(outlookRemaining / 60000)}m remaining, auto-refresh enabled)\n`);
} else {
  process.stderr.write("[work-tools] Outlook: no cached token (will auto-refresh on first request)\n");
}

// Harvest status
const hasHarvestEnv = !!(process.env.HARVEST_ACCESS_TOKEN && process.env.HARVEST_ACCOUNT_ID);
const harvestRemaining = getHarvestSessionTimeRemaining();
if (hasHarvestEnv) {
  process.stderr.write("[work-tools] Harvest: connected via PAT (env vars)\n");
} else if (harvestRemaining > 0) {
  process.stderr.write(`[work-tools] Harvest: browser session (${Math.floor(harvestRemaining / 60000)}m remaining)\n`);
} else {
  process.stderr.write("[work-tools] Harvest: not configured (run warmup or set env vars)\n");
}

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[work-tools] Server ready. Tools: outlook_* + harvest_*\n");
