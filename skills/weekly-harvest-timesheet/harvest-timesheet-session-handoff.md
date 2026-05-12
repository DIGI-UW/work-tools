# Harvest Timesheet Automation — Session Handoff

## Last Run

- **Date**: March 4, 2026
- **Period**: February 2026 (full month backfill)
- **Status**: Instructions generated, awaiting Harvest API submission via Claude Code

### February 2026 Actuals

| Project | Hours | Forecast | Variance |
|---------|-------|----------|----------|
| Madagascar LIS | 47 | 62 | -15h (new project, ramping) |
| Gold Star OE AI | 31 | 60 | -29h (new project, ramping) |
| Haiti HIS | 10 | 20 | -10h |
| DIGI General | 29 | n/a | Expected (meeting catch-all) |
| WHO SMART | 2 | 9 | -7h |
| Ethiopia LIS | 1 | 1 | On target |
| OOO | 40 | — | Week 3 winter break |
| **Total** | **160** | | |

### Key Learnings from February

1. **Outlook is the only work calendar** — Google Calendar only has personal events
2. **Meeting-to-project mapping is stable** — same recurring meetings each week, categorization rarely changes
3. **DIGI General absorbs ~24h/month in meetings** — Dev weekly (2h×4), DIGI Team (1h×3-4), 1:1s, workforce, retreats
4. **Forecast numbers were initially wrong** — corrected Haiti to 20h, Madagascar to 62h, Gold Star to 60h
5. **Harvest API quirk (resolved)**: Harvest's API ignores raw `hours` for Member-role accounts. The `work-tools` MCP server now always submits `started_time`/`ended_time` (real calendar times for meetings, 12pm–4pm placement for project fill). Updating an existing entry's `hours` via the MCP used to be a silent no-op for Member-role accounts; fixed in PR #9. Always pass times explicitly when creating or updating entries.
6. **Gold Star task is External Billable** (task 23300925), not Non-Billable as previously documented

### New Meetings Added to Mapping
- Dev Retreat → DIGI General (4h blocks, occasional)
- Roaming care quick check-in → Haiti HIS
- Madagascar Meetup → Madagascar LIS

## Key Files

- Skill: `SKILL.md`
- Forecast reference: `references/FY26 Team Time Forecast.xlsx`
- Feb instructions: `feb-2026-harvest-instructions.json`
- Handoff: `harvest-timesheet-session-handoff.md`

## Harvest Project IDs

| Project | ID | Task ID |
|---------|----|---------|
| Madagascar LIS (FY26) | 46605259 | 23300925 |
| Gold Star OE AI Lab Mgmt | 43777862 | 23300925 |
| Haiti HIS (FY26) | 46316326 | 23300925 |
| DIGI General Work | 18982046 | 19814923 |
| WHO SMART Training (FY26) | 45673959 | 23300925 |
| Ethiopia LIS AHRI (FY26) | 46004172 | 23300925 |
| Out of Office | 18507028 | 19814923 |
| Papua New Guinea LIS (FY26) | 46605414 | 23300925 |
| TAP DRC NCE COMP2 (FY26) | 46316418 | (check API) |
