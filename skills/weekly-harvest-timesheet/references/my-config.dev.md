# Weekly Harvest Timesheet — User Configuration (Developer)

## Role
- **Flavor**: dev

## Identity
- **Name**: Piotr
- **Email**: piotr.mankowski@gmail.com
- **Slack ID**: UJ7MMJT4K
- **Slack workspace**: digi-team-uw
- **Work hours**: 7am–4pm PST
- **Schedule**: Fridays at 3:00 PM
- **Daily total**: exactly 8h, whole-hour blocks

## Jira
- **Cloud ID**: 57b4e32d-23d4-4a71-8985-82ac0274d145
- OGC-* → GOLD STAR OE AI Lab Management
- WSG-* → WHO SMART Training
- BOT-* → relevant country project

## Harvest Project → Task ID Reference

| Harvest Project              | Project ID | Task ID  | Task Name                         | Billable |
|------------------------------|-----------|----------|-----------------------------------|----------|
| PNG LIS Tranche 2 (FY26/FY27)| 48537882  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| OpenMRS NSF Cybersecurity & AI (FY26) | 48491293 | 23300925 | DIGI External Billable Rate FY25 | Yes  |
| Haiti HIS Comp 5 (FY26)      | 48961546  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| ACT Registry Technical Assistance | 48219327 | 23287211 | DIGI Internal Billable Rate FY25 | Yes   |
| Indonesia LIS Tranche 2 (FY26)| 48102259 | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| Madagascar LIS (FY26)        | 46605259  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| Ethiopia LIS AHRI (FY26)     | 46004172  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| Haiti HIS (FY26)             | 46316326  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| WHO SMART Guidelines FY24-FY25| 38649814 | 19814923 | Non-Billable Time                 | No       |
| GOLD STAR OE AI Lab Mgmt     | 43777862  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| DIGI General Work            | 18982046  | 19814923 | Non-Billable Time                 | No       |
| Out of Office                | 18507028  | 19814923 | Non-Billable Time                 | No       |

### OpenELIS Community (44644581) — where OpenELIS *dev* work goes

Client OpenELIS. **All tasks non-billable.** Country sub-tasks attribute upstream
OpenELIS platform work to whichever country drove it:

| Task            | Task ID  |
|-----------------|----------|
| OE PNG          | 27217795 |
| OE IDN          | 27217796 |
| OE MDG          | 27217794 |
| OE ETH          | 27217865 |
| OE CIV          | 27217797 |
| GSOC            | 27217798 |
| Non-Billable Time | 19814923 |

**⚠️ Corrected 2026-09-07 — the following were wrong and caused a bad first draft:**

1. **PNG task ID.** This file said use **26896787** ("DIGI Internal Billable Rate FY27").
   Every actual PNG entry in June and July 2026 used **23300925** ("DIGI External
   Billable Rate FY25"). Both tasks exist on the project, so the wrong one does **not**
   422 — it silently bills the wrong rate. Use 23300925 unless told otherwise.
   (The OLD project "Papua New Guinea LIS (FY26)" **46605414 is dead** — no tasks, 422s.
   It is also gone from `harvest_list_projects`.)
2. **OpenELIS Community routing was backwards.** This file said "OE Community Call /
   OE coordination / GSoC go to DIGI General, **not here**." In practice OpenELIS
   Community is the single largest bucket via the country sub-tasks above.
   Keep the *OpenELIS Community Call meeting* on DIGI General, but route OpenELIS
   **dev** work to the OE country tasks.
3. **Madagascar and Ethiopia dev work → OE MDG / OE ETH, not the country projects.**
   Madagascar LIS (46605259) and Ethiopia LIS AHRI (46004172) had **zero hours** in
   June and July 2026. The Mekom weekly, the Mozzy 1:1 and the WHO Ethiopia FHIR
   drop-in clinic were billed to OE MDG / OE ETH.
4. **Gold Star OE AI Lab is AI work, not OpenELIS dev** (per Piotr, 2026-09-07) — it
   happens to touch OpenELIS. It had **zero hours** in June and July; AI work is billed
   to OpenMRS NSF (48491293) at a steady 7-9h/week. Piotr notes much of the AI work is
   on his own time (e.g. the 62-commit weekend of Aug 22-24), so weight it **down**
   relative to OpenELIS dev work when filling hours.

**WHO SMART:** actuals use **WHO SMART Guidelines FY24-FY25 (38649814)** with
Non-Billable Time, not "WHO SMART Training (45673959)". 12h landed there in the week
of 2026-07-13.

**Always verify with `harvest_list_tasks` before logging to a project you have not used
recently** — task IDs and billability differ per project, and a wrong-but-valid task
fails silently rather than erroring.

## FY26 Forecast (hours/month)

forecast_last_synced: 2026-09-07
forecast_source: "FY26 Team Time Forecast" — Google Sheets id 1hybHfyf3F_iheK7JVlPN1x_ZdaZD_9-VtWjo2uSxPmo
  (tab whose header reads "Project (Harvest Name)"; linked by Sonora Stampfly in the
  2026-08-10 "Monthly Forecasting Meeting" invite. Sheet last modified 2026-09-04.)

Piotr's rows, FY26 = Oct 2025 – Sep 2026. Blank = nothing forecast that month.

| Project (Harvest Name)            | Oct | Nov | Dec | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Total |
|-----------------------------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-------|
| Madagascar LIS (FY26)             |     |  32 |   0 |  61 |  62 |   1 |  74 |  49 |     |     |     |     |   279 |
| Haiti HIS (FY26)                  |  11 |   9 |  11 |  15 |  10 |   1 |     |     |     |     |     |     |    57 |
| Haiti HIS (FY26) – Comp 2 + 5     |     |     |     |     |     |     |   7 |   1 |   2 |   8 |   8 |   8 |    34 |
| Ethiopia LIS (FY26)               |  14 |  34 |   1 |     |     |     |     |     |     |     |     |     |    49 |
| Indonesia LIS – Tranche 2 (FY26)  |     |     |     |     |     |     |   9 |  30 |   4 |     |     |     |    43 |
| ACT Registry (Uganda RHD)         |     |     |     |     |     |     |   4 |  13 |   1 |   4 |     |     |    22 |
| Jamaica TSIS-DHIS2 (FY27)         |     |     |     |     |     |     |     |     |     |   6 |   0 |   6 |    12 |

**⚠️ The forecast is nearly empty from June 2026 onward.** For **August 2026 the only
forecast row for Piotr is Haiti HIS Comp 2 + 5 = 8h** (Jamaica is 0). Madagascar, Indonesia
and ACT Registry all stop after June; Gold Star OE AI Lab and OpenMRS NSF Cybersecurity & AI
have **no rows at all** on this tab despite being where the actual dev work went. So for
Jun–Sep 2026 the forecast cannot be used to allocate fill hours — derive them from actual
signals (GitHub PRs, Jira, calendar) and confirm with the user.

**Two tabs disagree.** An older tab in the same workbook uses pre-Harvest project names
("Haiti HIS Work (FY26)", "Gold Star - WHO Test", "CDI LAB (FY26)") and shows a different
Madagascar profile plus Haiti 6h/mo for Jul–Sep. The "Project (Harvest Name)" tab above is
the newer one and is what maps cleanly onto Harvest project names — prefer it. The numbers
in this file before 2026-09-07 came from the older tab.

**Also on the newer tab but missing from the project/task table above:** ACT Registry
(Uganda RHD) → Harvest "ACT Registry Technical Assistance" (48219327), and Haiti HIS
Comp 2 + 5 → Harvest "Haiti HIS Comp 5 (FY26)" (48961546). Confirm task IDs via
`harvest_list_tasks` before logging to either.

**Important:** DIGI General is never forecasted — it absorbs internal meetings, admin, and coordination. The forecasted total won't reach 160h; the gap is implicitly DIGI General.

## Meeting → Project Mappings

Apply these rules automatically when categorizing calendar events:

| Meeting Pattern              | Project         | Notes                     |
|-----------------------------|-----------------|---------------------------|
| Madagascar project review    | Madagascar LIS  |                           |
| OpenELIS Dev meeting         | Madagascar LIS  |                           |
| Madagascar Meetup            | Madagascar LIS  |                           |
| e-SIL: DIGI <> Mekom weekly | OE MDG          | OpenELIS Community / 27217794 (per actuals) |
| Analyzers                    | Split Mad/GS    | ~50/50 by forecast ratio  |
| CHARESS <> DIGI              | Haiti HIS       | CHARESS = Haiti partner   |
| Roaming care                 | Haiti HIS       |                           |
| WHO SMART CD Meeting         | WHO SMART       |                           |
| Ethiopia Regroup             | Ethiopia LIS    |                           |
| Drop-in Clinic Ethiopia FHIR | OE ETH          | WHO-organised, 01:00 PST; OpenELIS Community / 27217865 |
| PNG OpenELIS Phase 2 Kick Off| PNG Tranche 2   | 48537882 / 23300925       |
| ACT Tech Approach / ACT DIGI + Timor Leste | ACT Registry TA | 48219327 / 23287211 |
| WHO SMART IG in Mongolia     | WHO SMART FY24-25 | 38649814 / 19814923     |
| Monthly Forecasting Meeting  | DIGI General    | Sonora; forecast sheet link is in this invite |
| IOM pre-contract review      | DIGI General    | BD / pre-contract         |
| DevOps: Monthly Audit        | DIGI General    | Nested inside Dev/tech weekly — do not double-log |
| Ethiopia travel planning     | DIGI General    | Garrett/WHO travel logistics — separate WHO project, not Ethiopia LIS; bill to DIGI General until that project exists |
| DIGI Team Meeting            | DIGI General    |                           |
| Dev/tech team weekly         | DIGI General    | 2h meeting                |
| Ian & Piotr                  | DIGI General    | Round 15min → 1h          |
| Ian/Piotr/Jan                | DIGI General    |                           |
| DIGI Workforce Dev/M&E       | DIGI General    |                           |
| Dev Process Strategy         | DIGI General    |                           |
| Dev Weekly strategy review   | DIGI General    |                           |
| Dev Retreat                  | DIGI General    | 4h blocks                 |
| SILNAS DEV call              | Indonesia LIS   | SILNAS = Indonesia (UNDP) |
| ACTG + DIGI touchbase        | DIGI General    |                           |
| Mozzy & Piotr                | OE MDG          | OpenELIS Community / 27217794 |
| Agentic Health Surveillance  | DIGI General    | Seminar                   |
| OpenELIS Community Call      | DIGI General    | Also "OE cross-project coordination" |
| GSoC Weekly Check-in         | DIGI General    |                           |

## Meetings NOT Attended (ignore these)

| Meeting Pattern              | Reason          |
|-----------------------------|-----------------|
| SMART Guidelines CoP (weekly)| Does not attend |
| OHDSI Africa                 | Does not attend |
| OHS Developers Call          | Does not attend |
| O3 Squad Calls               | Does not attend |
| OpenMRS technical strategy   | Does not attend |
| Google<>DIGI Monthly         | Does not attend |
| ITI Committee                | Does not attend |
| Google AI Project Meeting    | No longer participating (as of May 2026) |
| DIGI TPM Meeting             | On calendar but not attended — that slot is OpenMRS AI work |
| I-TECH All Hands             | On calendar but not attended — that slot is OpenMRS AI work |

## Events to Ignore

| Pattern                      | Reason                        |
|-----------------------------|-------------------------------|
| SPH * (social/community)     | UW social events, not work    |
| DIGI Co-Working Hold         | Room hold, not a real meeting |
| Personal calendar events     | Kids activities, appointments |
