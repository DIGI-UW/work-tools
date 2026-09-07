# Harvest Timesheet Automation — Session Handoff

## Last Run

- **Date**: September 7, 2026
- **Period**: August 2026 (full month backfill — month was completely empty)
- **Status**: **Submitted** — 119 entries created via API, all validation checks pass.
  Final submit/approve is still a manual click in the Harvest web UI (no API endpoint).

### August 2026 Actuals

| Project / task | Hours | Billable |
|---|---:|---|
| PNG LIS Tranche 2 / 23300925 | 60.93 | yes |
| DIGI General / 19814923 | 27.58 | no |
| Out of Office (Aug 18-20 PTO) | 24.00 | no |
| OpenMRS NSF Cyber & AI / 23300925 | 21.25 | yes |
| OpenELIS Community / OE PNG 27217795 | 14.75 | no |
| Haiti HIS Comp 5 / 23300925 | 6.00 | yes |
| OpenELIS Community / OE ETH 27217865 | 4.00 | no |
| OpenELIS Community / OE MDG 27217794 | 3.75 | no |
| OpenELIS Community / GSOC 27217798 | 3.00 | no |
| ACT Registry TA / 23287211 | 1.75 | yes |
| WHO SMART FY24-25 / 19814923 | 1.00 | no |
| **Total** | **168.00** | 89.9 billable / 78.1 non-billable |

Forecast comparison: the live FY26 sheet forecast **8h total** for Piotr in August
(Haiti Comp 2+5 only). Everything else was unforecast, so the fill was derived from
actual signals, not the forecast. See the forecast section of `my-config.md`.

### Key Learnings from August

1. **Config had four wrong mappings** that produced a bad first draft — all corrected in
   `my-config.dev.md` on 2026-09-07: PNG task ID (26896787 → 23300925), the OpenELIS
   Community "route to DIGI General instead" note (backwards), Madagascar/Ethiopia dev
   work (goes to OE MDG / OE ETH, not the country projects), and the claim that Gold Star
   OE AI Lab is for OpenELIS AI work (it is AI work generally, and had zero hours Jun-Jul).
2. **Read recent actuals before trusting the config.** `harvest_weekly_summary` on two or
   three recent weeks is the single most useful step — it revealed the OE country sub-task
   scheme, the real PNG task ID, and which projects are actually live. Do this first.
3. **A wrong-but-valid task ID fails silently.** It does not 422; it bills the wrong rate.
   Verify with `harvest_list_tasks` for any project not used recently.
4. **Slack + GitHub commits together identify time off; neither alone does.** For Aug 11-21,
   Slack-loud/commit-zero days were coordination days and commit-loud/Slack-zero days were
   heads-down coding. Only days scoring **zero on both** were real absences (Aug 18-20).
   `list_commits` returned a false empty — use `search_commits` with `author-date:` ranges.
5. **Calendar events are invitations, not attendance.** Aug 18 and 20 had 6 and 4 events but
   zero activity on both signals; Piotr had announced in #general he would miss standing
   meetings while travelling.
6. **The forecast may be nearly empty.** Do not assume the forecast can allocate fill hours;
   check the current month's column before relying on it.
7. **PNG billable-vs-upstream is unresolved.** Nothing documents whether the `OE *` tasks are
   upstream-only or the default for all OpenELIS work. August was billed contract-weighted
   (60.9h on Tranche 2 vs 14.8h on OE PNG) at Piotr's direction. Confirm with Sonora — the
   alternative reading moves ~46h between billable and non-billable.
8. **Harvest API quirk (still true)**: Harvest ignores raw `hours` for Member-role accounts.
   Always submit `started_time`/`ended_time` — real calendar times for meetings, and place
   the dominant fill project in a contiguous 12:00-16:00 block, smaller blocks in morning
   gaps. 119 entries over 18 working days (~6.4/day) matches Piotr's historical cadence.

### Open items carried forward

- **7 unsubmitted OOO days** in Harvest (Jan 19, Feb 16-20, Mar 6 = 56h) and **5 submitted
  but unapproved** (May 25, Jun 19, Jul 3, 9, 10 = 40h). Manual pass in the Harvest UI.
- **DGH Payroll email unanswered**: Young Cho (dghpay@uw.edu), "Action Needed: Holiday Taken
  Time Off Review", 2026-06-04. Corrections >90 days old need Central Payroll.
- **September 2026 is also empty** in Harvest as of this run.
- Harvest projects active but still absent from the config table: CDI LABQUASY 46316250,
  DRC TAP 48298140, AHA SHIELD 48219375, GOLD STAR CapDev 43777802, GS WHO IPS 43718721,
  GS WHO Testable IGs 43718704.

---

## Previous Run (February 2026)



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
