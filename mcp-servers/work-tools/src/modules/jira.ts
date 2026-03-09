/**
 * Jira module — issue search and retrieval via Jira Cloud REST API v3.
 *
 * Auth: Basic Auth with email + API token (no browser needed).
 * Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN env vars.
 * Get your token at: https://id.atlassian.com/manage-profile/security/api-tokens
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolModule } from "../types.js";

// ── Config ─────────────────────────────────────────────────

function getConfig() {
  return {
    baseUrl: (process.env.JIRA_BASE_URL ?? "").replace(/\/+$/, ""),
    email: process.env.JIRA_EMAIL ?? "",
    token: process.env.JIRA_API_TOKEN ?? process.env.JIRA_TOKEN ?? "",
  };
}

function isConfigured(): boolean {
  const { baseUrl, email, token } = getConfig();
  return !!(baseUrl && email && token);
}

const NOT_CONFIGURED =
  "Jira not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN env vars.\n" +
  "Get a token at: https://id.atlassian.com/manage-profile/security/api-tokens";

// ── HTTP helper ────────────────────────────────────────────

function authHeader(): string {
  const { email, token } = getConfig();
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const { baseUrl } = getConfig();
  const url = new URL(`${baseUrl}/rest/api/3${path}`);
  if (params) for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string } | null;
    priority: { name: string } | null;
    assignee: { displayName: string; accountId: string } | null;
    issuetype: { name: string } | null;
    project: { key: string; name: string } | null;
    created: string;
    updated: string;
    duedate: string | null;
    description: unknown;
    labels: string[];
  };
}

interface SearchResult {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

// ── API functions ──────────────────────────────────────────

function formatIssue(issue: JiraIssue) {
  const f = issue.fields;
  return {
    key: issue.key,
    summary: f.summary,
    status: f.status?.name ?? null,
    priority: f.priority?.name ?? null,
    assignee: f.assignee?.displayName ?? null,
    type: f.issuetype?.name ?? null,
    project: f.project?.key ?? null,
    created: f.created,
    updated: f.updated,
    duedate: f.duedate,
    labels: f.labels ?? [],
  };
}

async function searchIssues(jql: string, maxResults = 50, fields?: string) {
  const params: Record<string, string> = {
    jql,
    maxResults: String(maxResults),
    fields: fields ?? "summary,status,priority,assignee,issuetype,project,created,updated,duedate,labels",
  };
  const data = await apiFetch<SearchResult>("/search/jql", params);
  return {
    total: data.total,
    issues: data.issues.map(formatIssue),
  };
}

async function getIssue(issueKey: string) {
  const data = await apiFetch<JiraIssue>(`/issue/${encodeURIComponent(issueKey)}`, {
    fields: "summary,status,priority,assignee,issuetype,project,created,updated,duedate,description,labels",
  });
  return {
    ...formatIssue(data),
    description: data.fields.description,
  };
}

async function listProjects() {
  const data = await apiFetch<JiraProject[]>("/project", { recent: "20" });
  return data.map((p) => ({ id: p.id, key: p.key, name: p.name, type: p.projectTypeKey }));
}

// ── ToolModule ─────────────────────────────────────────────

export const jira: ToolModule = {
  name: "jira",

  async status() {
    if (!isConfigured()) return "Jira: not configured (set env vars)";
    try {
      await apiFetch("/myself");
      return "Jira: connected";
    } catch (err) {
      return `Jira: auth failed — ${(err as Error).message}`;
    }
  },

  // No warmup needed — uses API token from env vars

  register(server: McpServer) {
    const guard = () => {
      if (!isConfigured()) throw new Error(NOT_CONFIGURED);
    };

    server.tool("jira_status", "Check Jira connection status", {}, async () => {
      return { content: [{ type: "text", text: await jira.status() }] };
    });

    server.tool("jira_search", "Search Jira issues using JQL", {
      jql: z.string().describe("JQL query (e.g. 'assignee = currentUser() AND status != Done')"),
      max_results: z.number().int().min(1).max(100).optional().describe("Max results (1-100, default: 50)"),
    }, async ({ jql, max_results }) => {
      guard();
      const result = await searchIssues(jql, max_results ?? 50);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    server.tool("jira_get_issue", "Get a Jira issue by key", {
      issue_key: z.string().describe("Issue key (e.g. PROJ-123)"),
    }, async ({ issue_key }) => {
      guard();
      const issue = await getIssue(issue_key);
      return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
    });

    server.tool("jira_my_issues", "Get issues assigned to you", {
      status_filter: z.string().optional().describe("Filter by status (e.g. 'In Progress', 'To Do'). Default: all non-Done."),
      max_results: z.number().int().min(1).max(100).optional().describe("Max results (default: 30)"),
    }, async ({ status_filter, max_results }) => {
      guard();
      let jql = "assignee = currentUser()";
      if (status_filter) jql += ` AND status = "${status_filter}"`;
      else jql += " AND status != Done";
      jql += " ORDER BY updated DESC";
      const result = await searchIssues(jql, max_results ?? 30);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    server.tool("jira_list_projects", "List recent Jira projects", {}, async () => {
      guard();
      const projects = await listProjects();
      return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
    });
  },
};
