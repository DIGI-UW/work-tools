# Harvest Timesheet — User Configuration (template)

Copy this file to `my-config.md` in this directory (gitignored) and fill in your values, or save a
named copy `my-config.<yourname>.md` to share with teammates. `SKILL.md` reads these sections at
runtime. Ask Claude to "set up my harvest-timesheet config" and it can discover most of this for you
via the Harvest MCP (`get_account_settings`, `list_projects`, `list_tasks`).

## Identity
- **Harvest Account ID**: `000000`
- **Harvest User ID**: `0000000`        <!-- your own user id; omit user_id in MCP calls to default to self -->
- **Email**: you@example.org
- **Timezone**: America/Los_Angeles      <!-- IANA name; must match the Harvest account timezone -->

## Schedule & allocation
- **hours_per_day**: 7.5                  <!-- regular workday total -->
- **ooo_hours**: 8.0                      <!-- Out-of-Office / holiday day total -->
- **increment**: 0.25
- **week**: Mon–Fri
- **filler_split**: 100% <ProjectA>       <!-- e.g. "80% <ProjectA> / 20% <ProjectB>"; projects marked meeting-only get no filler -->

## Approved projects (bill ONLY to these)

| Project | project_id | task_id | Calendar keywords | Filler? |
|---|---|---|---|---|
| Project A | 11111 | 22222 | keyword1, keyword2 | yes |
| Project B | 33333 | 22222 | keyword3 | yes |
| General/Admin | 44444 | 22222 | team meeting, admin, 1:1 | meeting-only |
| Out of Office | 55555 | 66666 | OOO, holiday, vacation, sick | n/a |

## Mapping rules
- **Special routing** (event → project overrides): e.g. "<Meeting X> → Project A".
- **Never-bill** (route elsewhere or drop): e.g. "<Client Y> → bill to Project A instead" or "drop".
- **Skip (do not bill)**: list recurring events you don't attend / that aren't work
  (e.g. optional community calls, social events, private "Busy" blocks). Canceled events → skip.
- **Ambiguous events**: interactive → ask the user; unattended → leave out of meeting mapping
  (filler covers the day) and note in the report.

## Archived / retired projects (never bill)
- List any archived project ids so a stale cache never bills to them.

## Holidays
- **jurisdiction**: Washington State (RCW 1.16.050) — implemented in `references/wa-holidays.js`.
  Change this if you observe a different holiday set.
