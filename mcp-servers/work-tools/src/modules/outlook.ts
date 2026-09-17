/**
 * Outlook module — email + calendar via Office 365 REST API.
 *
 * Auth: Playwright browser capture (sniffs Bearer token from SSO).
 * Auto-refreshes headlessly using persistent Chrome profile cookies.
 * Token TTL: 15 minutes. Disk cache: ~/.outlook-mcp-token.json.
 */
import { z } from "zod";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolModule } from "../types.js";
import { captureBearerToken } from "../browser-auth.js";

// ── Config ─────────────────────────────────────────────────

const API_BASE = "https://outlook.office365.com/api/v2.0/me";
const TTL_MS = 15 * 60 * 1000;
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const TOKEN_FILE = `${HOME}/.outlook-mcp-token.json`;

// ── Token state ────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenCapturedAt = 0;

function loadFromDisk(): boolean {
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    if (data.token && Date.now() - data.capturedAt < TTL_MS) {
      cachedToken = data.token;
      tokenCapturedAt = data.capturedAt;
      return true;
    }
  } catch { /* missing or invalid */ }
  return false;
}

function saveToDisk(token: string, at: number): void {
  writeFileSync(TOKEN_FILE, JSON.stringify({ token, capturedAt: at }), { mode: 0o600 });
}

function invalidateDisk(): void {
  try { unlinkSync(TOKEN_FILE); } catch { /* gone */ }
}

function isValid(): boolean {
  if (cachedToken && Date.now() - tokenCapturedAt < TTL_MS) return true;
  return loadFromDisk();
}

// ── Auth ───────────────────────────────────────────────────

async function capture(
  existingContext?: import("playwright").BrowserContext,
  headless = false,
): Promise<string> {
  if (isValid()) return cachedToken!;

  process.stderr.write(`[outlook] ${headless ? "Auto-refreshing" : "Capturing"} token...\n`);
  const result = await captureBearerToken({
    url: "https://outlook.office365.com/mail/",
    matchUrl: "outlook.office365.com",
    headless,
    existingContext,
  });

  cachedToken = result.token;
  tokenCapturedAt = Date.now();
  saveToDisk(result.token, tokenCapturedAt);
  process.stderr.write("[outlook] Token captured.\n");
  return result.token;
}

/** Get valid token — from cache, disk, or headless auto-refresh. */
async function getToken(): Promise<string> {
  if (isValid()) return cachedToken!;
  try {
    return await capture(undefined, true);
  } catch (err) {
    throw new Error(`Outlook auto-refresh failed: ${(err as Error).message}. Run outlook_refresh.`);
  }
}

function timeRemaining(): number {
  if (!isValid()) return 0;
  return Math.max(0, TTL_MS - (Date.now() - tokenCapturedAt));
}

// ── HTTP helper ────────────────────────────────────────────

function escapeOData(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Timezone Microsoft Graph should return date-time fields in.
 *
 *  Priority:
 *    1. $OUTLOOK_TIMEZONE  — explicit IANA name (e.g. "America/Los_Angeles")
 *    2. Auto-detected from the host (Intl.DateTimeFormat — works on every modern Node)
 *    3. "UTC" as a defensive last resort
 *
 *  Sent as `Prefer: outlook.timezone="<zone>"` on every Graph call. Affects calendar
 *  event start/end values and email received/sent timestamps; if the header is absent,
 *  Graph defaults to UTC, which silently misaligns downstream timesheets and digests
 *  for any non-UTC user. Microsoft Graph has accepted IANA names since 2019.
 */
function getOutlookTimezone(): string {
  const override = (process.env.OUTLOOK_TIMEZONE ?? "").trim();
  if (override) return override;
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) return detected;
  } catch { /* fall through */ }
  return "UTC";
}

function baseHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    Prefer: `outlook.timezone="${getOutlookTimezone()}"`,
  };
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getToken();
  const url = new URL(`${API_BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res = await fetch(url.toString(), { headers: baseHeaders(token) });

  if (res.status === 401) {
    cachedToken = null;
    invalidateDisk();
    try { await capture(undefined, true); } catch {
      throw new Error("Outlook token expired and auto-refresh failed. Run outlook_refresh.");
    }
    res = await fetch(url.toString(), { headers: baseHeaders(cachedToken!) });
    if (!res.ok) throw new Error(`Outlook API ${res.status} after refresh: ${await res.text()}`);
    return res.json() as Promise<T>;
  }
  if (!res.ok) throw new Error(`Outlook API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────

interface Recipient { EmailAddress: { Name: string; Address: string } }
interface Email {
  Id: string; Subject: string; ReceivedDateTime: string; BodyPreview: string; IsRead: boolean;
  /** Absent on drafts — Outlook only populates a sender once a message has actually been sent. */
  From?: Recipient;
}
interface MessageBody { ContentType: string; Content: string }
interface EmailFull extends Email {
  Body: MessageBody;
  ToRecipients: Recipient[];
  CcRecipients: Recipient[];
}
interface Event {
  Id: string; Subject: string; IsAllDay: boolean; IsCancelled: boolean;
  Start: { DateTime: string; TimeZone: string }; End: { DateTime: string; TimeZone: string };
  Location?: { DisplayName: string }; Organizer?: { EmailAddress: { Name: string; Address: string } };
}
interface CreatedDraft {
  id: string;
  webLink?: string;
}
/** The slice of a message the draft write tools read before touching it. */
interface DraftState {
  Id: string; Subject: string; IsDraft: boolean; WebLink?: string; Body?: MessageBody;
}
interface DraftChanges {
  subject?: string; body?: string; bodyType?: "HTML" | "Text"; to?: string[]; cc?: string[]; prependComment?: string;
}

// ── API functions ──────────────────────────────────────────

async function listEmails(folder = "inbox", limit = 20, skip = 0, fromDate?: string, toDate?: string): Promise<Email[]> {
  const params: Record<string, string> = {
    $top: String(limit),
    $select: "Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead",
    $orderby: "ReceivedDateTime desc",
  };
  if (skip > 0) params.$skip = String(skip);
  // Build $filter for date range if provided
  const filters: string[] = [];
  if (fromDate) filters.push(`ReceivedDateTime ge ${fromDate}T00:00:00Z`);
  if (toDate) filters.push(`ReceivedDateTime lt ${toDate}T23:59:59Z`);
  if (filters.length) params.$filter = filters.join(" and ");

  const data = await apiFetch<{ value: Email[] }>(
    `/mailfolders/${encodeURIComponent(folder)}/messages`,
    params,
  );
  return data.value;
}

async function readEmail(id: string): Promise<EmailFull> {
  return apiFetch<EmailFull>(`/messages/${encodeURIComponent(id)}`, {
    $select: "Id,Subject,From,ReceivedDateTime,Body,ToRecipients,CcRecipients,IsRead",
  });
}

async function searchEmails(query: string, limit = 20): Promise<Email[]> {
  // $orderby is NOT allowed with $search on Graph API (returns 400 SearchWithOrderBy).
  // Graph search returns relevance-ranked results by default.
  const data = await apiFetch<{ value: Email[] }>("/messages", {
    $top: String(limit), $search: `"${escapeOData(query)}"`,
    $select: "Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead",
  });
  return data.value;
}

async function listEvents(start?: string, end?: string): Promise<Event[]> {
  const s = start ? new Date(start) : new Date();
  if (isNaN(s.getTime())) throw new Error(`Invalid start date: ${start}`);
  const e = end ? new Date(end) : new Date(s.getTime() + 7 * 86400000);
  if (isNaN(e.getTime())) throw new Error(`Invalid end date: ${end}`);
  const data = await apiFetch<{ value: Event[] }>("/calendarview", {
    startDateTime: s.toISOString(), endDateTime: e.toISOString(),
    $top: "200", $select: "Id,Subject,Start,End,Location,Organizer,IsAllDay,IsCancelled", $orderby: "Start/DateTime",
  });
  return data.value;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toRecipients(addresses: string[]) {
  return addresses.map((addr) => ({ EmailAddress: { Address: addr } }));
}

function formatRecipient(r: Recipient): string {
  return `${r.EmailAddress.Name} <${r.EmailAddress.Address}>`;
}

/**
 * Inserts `comment` above an existing body, keeping its content type. HTML bodies get an escaped
 * paragraph with newlines rendered as <br>; Text bodies get a blank-line separator. Shared by the
 * reply-draft and update-draft paths so both produce identical markup.
 */
function prependToBody(existing: MessageBody | undefined, comment: string): MessageBody {
  const bodyType = existing?.ContentType === "Text" ? "Text" : "HTML";
  const current = existing?.Content ?? "";
  const prefix = bodyType === "HTML"
    ? `<p>${escapeHtml(comment).replace(/\n/g, "<br>")}</p>`
    : `${comment}\n\n`;
  return { ContentType: bodyType, Content: prefix + current };
}

/**
 * POST/PATCH/DELETE helper. apiFetch is GET-only, so write calls need their own method,
 * Content-Type, and response handling: DELETE answers 204 No Content, which res.json() would
 * reject, so an empty response resolves to undefined instead of being parsed.
 */
async function apiWrite<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  const doFetch = (t: string) => fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined
      ? baseHeaders(t)
      : { ...baseHeaders(t), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let res = await doFetch(token);
  if (res.status === 401) {
    cachedToken = null;
    invalidateDisk();
    try { await capture(undefined, true); } catch {
      throw new Error("Outlook token expired and auto-refresh failed. Run outlook_refresh.");
    }
    res = await doFetch(cachedToken!);
  }
  if (!res.ok) throw new Error(`Outlook API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Creates a brand-new draft in the Drafts folder. Never sends. */
async function createDraft(
  to: string[],
  subject: string,
  body: string,
  bodyType: "HTML" | "Text",
  cc: string[],
): Promise<CreatedDraft> {
  const payload = {
    Subject: subject,
    Body: { ContentType: bodyType, Content: body },
    ToRecipients: toRecipients(to),
    CcRecipients: toRecipients(cc),
  };
  const data = await apiWrite<EmailFull & { WebLink?: string }>("/messages", "POST", payload);
  return { id: data.Id, webLink: data.WebLink };
}

/**
 * Creates a draft reply (or reply-all) via Outlook's createreply/createreplyall action, which
 * pre-populates recipients, subject ("RE: ..."), and the quoted thread. We then PATCH the body
 * to prepend the caller's text ahead of that quote — the action itself accepts no comment param.
 * Never sends.
 */
async function createReplyDraft(
  id: string,
  comment: string,
  replyAll: boolean,
): Promise<CreatedDraft> {
  const action = replyAll ? "createreplyall" : "createreply";
  const draft = await apiWrite<EmailFull & { WebLink?: string }>(
    `/messages/${encodeURIComponent(id)}/${action}`,
    "POST",
    {},
  );

  const patched = await apiWrite<EmailFull & { WebLink?: string }>(
    `/messages/${encodeURIComponent(draft.Id)}`,
    "PATCH",
    { Body: prependToBody(draft.Body, comment) },
  );
  return { id: draft.Id, webLink: patched.WebLink ?? draft.WebLink };
}

/**
 * Reads a message and refuses unless Outlook marks it IsDraft, so the draft write tools can never
 * modify or delete a received or sent email. Body is only requested when the caller needs it.
 */
async function requireDraft(id: string, verb: string, withBody: boolean): Promise<DraftState> {
  const msg = await apiFetch<DraftState>(`/messages/${encodeURIComponent(id)}`, {
    $select: withBody ? "Id,Subject,IsDraft,WebLink,Body" : "Id,Subject,IsDraft,WebLink",
  });
  if (!msg.IsDraft) {
    throw new Error(`Refusing to ${verb} message ${id}: it is not a draft (subject: "${msg.Subject}"). Only drafts can be changed.`);
  }
  return msg;
}

/**
 * PATCHes an existing draft with only the fields the caller passed. Works on any draft, including
 * replies from createReplyDraft. `body` replaces the whole body (quoted thread included), while
 * `prependComment` reads the current body and inserts text above it, so revising the top of a
 * reply does not require re-sending the quote. Never sends.
 */
async function updateDraft(id: string, changes: DraftChanges): Promise<CreatedDraft> {
  const { subject, body, bodyType, to, cc, prependComment } = changes;
  if (body !== undefined && prependComment !== undefined) {
    throw new Error("Pass either body (replace the whole body) or prepend_comment (insert above the existing body), not both.");
  }
  if (bodyType !== undefined && body === undefined) {
    throw new Error("body_type is only used together with body.");
  }
  if ([subject, body, to, cc, prependComment].every((v) => v === undefined)) {
    throw new Error("No changes specified. Pass at least one of subject, body, to, cc, or prepend_comment.");
  }

  const draft = await requireDraft(id, "update", prependComment !== undefined);

  const payload: Record<string, unknown> = {};
  if (subject !== undefined) payload.Subject = subject;
  if (to !== undefined) payload.ToRecipients = toRecipients(to);
  if (cc !== undefined) payload.CcRecipients = toRecipients(cc);
  if (body !== undefined) payload.Body = { ContentType: bodyType ?? "HTML", Content: body };
  if (prependComment !== undefined) payload.Body = prependToBody(draft.Body, prependComment);

  const patched = await apiWrite<DraftState>(`/messages/${encodeURIComponent(id)}`, "PATCH", payload);
  return { id: patched.Id ?? id, webLink: patched.WebLink ?? draft.WebLink };
}

/** Deletes a draft after the IsDraft guard. Outlook answers 204 No Content on success. */
async function deleteDraft(id: string): Promise<void> {
  await requireDraft(id, "delete", false);
  await apiWrite<void>(`/messages/${encodeURIComponent(id)}`, "DELETE");
}

async function searchEvents(query: string): Promise<Event[]> {
  const now = new Date();
  const end = new Date(now.getTime() + 90 * 86400000);
  const data = await apiFetch<{ value: Event[] }>("/calendarview", {
    startDateTime: now.toISOString(), endDateTime: end.toISOString(),
    $top: "200", $select: "Id,Subject,Start,End,Location,Organizer,IsAllDay,IsCancelled", $orderby: "Start/DateTime",
  });
  const q = query.toLowerCase();
  return data.value.filter(
    (ev) => ev.Subject?.toLowerCase().includes(q) || ev.Location?.DisplayName?.toLowerCase().includes(q) || ev.Organizer?.EmailAddress?.Address?.toLowerCase().includes(q),
  );
}

// ── ToolModule ─────────────────────────────────────────────

export const outlook: ToolModule = {
  name: "outlook",

  async status() {
    const rem = timeRemaining();
    const mins = Math.floor(rem / 60000);
    return rem > 0 ? `Outlook: active (${mins}m remaining)` : "Outlook: no session";
  },

  async warmup() {
    await capture();
    const mins = Math.floor(timeRemaining() / 60000);
    return `Outlook: OK (${mins}m remaining)`;
  },

  register(server: McpServer) {
    server.tool("outlook_status", "Check Outlook session status", {}, async () => {
      const rem = timeRemaining();
      const mins = Math.floor(rem / 60000);
      return { content: [{ type: "text", text: JSON.stringify({
        connected: rem > 0, minutes_remaining: mins,
        message: rem > 0 ? `Outlook active (${mins}m remaining)` : "No session. Run warmup.",
      }, null, 2) }] };
    });

    server.tool("outlook_refresh", "Refresh the Outlook token (opens browser briefly)", {}, async () => {
      try {
        await capture();
        return { content: [{ type: "text", text: `Token refreshed. ${Math.floor(timeRemaining() / 60000)}m remaining.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Refresh failed: ${(err as Error).message}` }], isError: true };
      }
    });

    server.tool("outlook_list_emails", "List recent Outlook emails", {
      folder: z.string().optional().describe("Mail folder (default: inbox)"),
      limit: z.number().int().min(1).max(200).optional().describe("Max emails (1-200, default: 20)"),
      skip: z.number().int().min(0).optional().describe("Skip first N emails for pagination (default: 0)"),
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Filter: emails on or after this date (YYYY-MM-DD)"),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Filter: emails before this date (YYYY-MM-DD)"),
    }, async ({ folder, limit, skip, from_date, to_date }) => {
      const emails = await listEmails(folder ?? "inbox", limit ?? 20, skip ?? 0, from_date, to_date);
      return { content: [{ type: "text", text: JSON.stringify(emails.map((e) => ({
        id: e.Id, subject: e.Subject, from: e.From ? formatRecipient(e.From) : null,
        date: e.ReceivedDateTime, preview: e.BodyPreview, read: e.IsRead,
      })), null, 2) }] };
    });

    server.tool("outlook_read_email", "Read full email content by ID", {
      id: z.string().describe("Email ID"),
    }, async ({ id }) => {
      const email = await readEmail(id);
      return { content: [{ type: "text", text: JSON.stringify({
        subject: email.Subject,
        from: email.From ? formatRecipient(email.From) : null,
        to: email.ToRecipients?.map(formatRecipient) ?? [],
        cc: email.CcRecipients?.map(formatRecipient) ?? [],
        date: email.ReceivedDateTime, body: email.Body.Content, bodyType: email.Body.ContentType,
      }, null, 2) }] };
    });

    server.tool("outlook_search_emails", "Search Outlook emails by keyword", {
      query: z.string().describe("Search query"),
      limit: z.number().int().min(1).max(50).optional().describe("Max results (1-50, default: 20)"),
    }, async ({ query, limit }) => {
      const emails = await searchEmails(query, limit ?? 20);
      return { content: [{ type: "text", text: JSON.stringify(emails.map((e) => ({
        id: e.Id, subject: e.Subject, from: e.From ? formatRecipient(e.From) : null,
        date: e.ReceivedDateTime, preview: e.BodyPreview,
      })), null, 2) }] };
    });

    server.tool("outlook_list_events", "List Outlook calendar events for a date range (default: next 7 days)", {
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().describe("End date (YYYY-MM-DD)"),
      include_cancelled: z.boolean().optional().describe("Include cancelled events"),
    }, async ({ start_date, end_date, include_cancelled }) => {
      const events = await listEvents(start_date, end_date);
      const filtered = include_cancelled ? events : events.filter((e) => !e.IsCancelled);
      return { content: [{ type: "text", text: JSON.stringify(filtered.map((e) => ({
        id: e.Id, subject: e.Subject, start: e.Start.DateTime, end: e.End.DateTime,
        timezone: e.Start.TimeZone, location: e.Location?.DisplayName || null,
        organizer: e.Organizer?.EmailAddress?.Address, allDay: e.IsAllDay,
      })), null, 2) }] };
    });

    server.tool("outlook_search_events", "Search Outlook calendar events (subject, location, organizer)", {
      query: z.string().describe("Search query"),
    }, async ({ query }) => {
      const events = await searchEvents(query);
      return { content: [{ type: "text", text: JSON.stringify(events.map((e) => ({
        id: e.Id, subject: e.Subject, start: e.Start.DateTime, end: e.End.DateTime,
        location: e.Location?.DisplayName || null, organizer: e.Organizer?.EmailAddress?.Address,
      })), null, 2) }] };
    });

    server.tool("outlook_create_draft", "Create a new email draft in Outlook. Saves to Drafts — never sends.", {
      to: z.array(z.string()).min(1).describe("Recipient email addresses"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body content"),
      cc: z.array(z.string()).optional().describe("CC email addresses"),
      body_type: z.enum(["HTML", "Text"]).optional().describe("Body content type (default: HTML)"),
    }, async ({ to, subject, body, cc, body_type }) => {
      const draft = await createDraft(to, subject, body, body_type ?? "HTML", cc ?? []);
      return { content: [{ type: "text", text: JSON.stringify({
        id: draft.id, web_link: draft.webLink,
        note: "Draft saved to Outlook Drafts folder. Not sent — review and send manually.",
      }, null, 2) }] };
    });

    server.tool("outlook_create_reply_draft", "Create a draft reply to an existing email, with the original thread quoted. Saves to Drafts — never sends.", {
      id: z.string().describe("ID of the email to reply to"),
      comment: z.string().describe("Reply text, inserted above the quoted thread"),
      reply_all: z.boolean().optional().describe("Reply to all recipients instead of just the sender (default: false)"),
    }, async ({ id, comment, reply_all }) => {
      const draft = await createReplyDraft(id, comment, reply_all ?? false);
      return { content: [{ type: "text", text: JSON.stringify({
        id: draft.id, web_link: draft.webLink,
        note: "Reply draft saved to Outlook Drafts folder. Not sent — review and send manually.",
      }, null, 2) }] };
    });

    server.tool("outlook_update_draft", "Edit an existing draft in place (any draft, including replies from outlook_create_reply_draft). Only the fields passed are changed. Saves to Drafts. Never sends.", {
      id: z.string().describe("ID of the draft to update"),
      subject: z.string().optional().describe("New subject"),
      body: z.string().optional().describe("Replacement body. Replaces the entire body, including any quoted thread. Cannot be combined with prepend_comment."),
      body_type: z.enum(["HTML", "Text"]).optional().describe("Content type of body (default: HTML). Only used together with body."),
      to: z.array(z.string()).optional().describe("Replacement To recipients, as the full list. An empty array clears them."),
      cc: z.array(z.string()).optional().describe("Replacement CC recipients, as the full list. An empty array clears them."),
      prepend_comment: z.string().optional().describe("Text to insert above the existing body, keeping the quoted thread intact. Newlines become <br> in HTML drafts. Cannot be combined with body."),
    }, async ({ id, subject, body, body_type, to, cc, prepend_comment }) => {
      const draft = await updateDraft(id, { subject, body, bodyType: body_type, to, cc, prependComment: prepend_comment });
      return { content: [{ type: "text", text: JSON.stringify({
        id: draft.id, web_link: draft.webLink,
        note: "Draft updated in Outlook Drafts folder. Not sent. Review and send manually.",
      }, null, 2) }] };
    });

    server.tool("outlook_delete_draft", "Delete a draft by ID. Refuses anything that is not a draft, so received and sent emails are never touched.", {
      id: z.string().describe("ID of the draft to delete"),
    }, async ({ id }) => {
      await deleteDraft(id);
      return { content: [{ type: "text", text: JSON.stringify({ id, deleted: true }, null, 2) }] };
    });
  },
};
