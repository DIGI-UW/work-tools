# Harvest access reference

## Primary: Harvest MCP connector (use for ALL reads/writes)

| Tool | Purpose / key params |
|---|---|
| `list_time_entries` | `from`, `to` (YYYY-MM-DD, inclusive), optional `user_id`, `project_id`. Paginate via `next_cursor` -> `cursor`. Omit `user_id` for self (2344962). |
| `log_time` | `project_id`, `task_id`, `hours` (decimal) OR `started_time`+`ended_time`, `spent_at`, `notes`. |
| `update_time_entry` | `id` + any of `hours`, `notes`, `project_id`, `task_id`, `spent_at`. Ownership enforced server-side. |
| `delete_time_entry` | `id`. Prefer `update_time_entry`; avoid deletes. |
| `list_projects` | `search` (substring), `is_active`. Use to re-discover ids when a cached id fails ("Project isn't active" = archived). |
| `list_tasks` / `list_project_assignments` | Task ids valid for a project. |
| `get_account_settings` | Rounding, week start, approval rules. |
| `submit_timesheet` | Exists, but this skill never auto-submits — Casey reviews first. |

Known failure modes:
- `validation_failed: Project isn't active` — the project was archived; re-discover with
  `list_projects(search=...)` and match by name (e.g. PNG Tranche 1 46605414 -> Tranche 2 48537882, 2026-07).
- Task not assigned to project — confirm with `list_tasks` / `list_project_assignments`.

## Fallback only: Chrome console REST (when the MCP is down)

Navigate Chrome to `https://digitc.harvestapp.com`, then use `javascript_tool` with `fetch` against
`https://api.harvestapp.com/v2/...` and headers `Authorization: Bearer <runtime token>`,
`Harvest-Account-Id: 978800`. Never commit a token; rotate immediately if one appears in a file.

- `GET /v2/time_entries?from=YYYY-MM-DD&to=YYYY-MM-DD&user_id=2344962`
- `POST /v2/time_entries` body: `{project_id, task_id, spent_at, hours, notes}`
- `PATCH /v2/time_entries/{id}` body: fields to change
