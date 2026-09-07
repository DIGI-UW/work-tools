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
| Madagascar LIS (FY26)        | 46605259  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| Haiti HIS (FY26)             | 46316326  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| Ethiopia LIS AHRI (FY26)     | 46004172  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| WHO SMART Training (FY26)    | 45673959  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| GOLD STAR OE AI Lab Mgmt     | 43777862  | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| Papua New Guinea LIS Tranche 2 (FY26/FY27)| 48537882 | 26896787 | DIGI Internal Billable Rate FY27 | Yes |
| Indonesia LIS Tranche 2 (FY26)| 48102259 | 23300925 | DIGI External Billable Rate FY25  | Yes      |
| OpenMRS NSF Cybersecurity & AI (FY26) | 48491293 | 23300925 | DIGI External Billable Rate FY25 | Yes  |
| OpenELIS Community           | 44644581  | 23300925 | DIGI External Billable Rate FY25  | No (tasks non-billable) |
| DIGI General Work            | 18982046  | 19814923 | Non-Billable Time                 | No       |
| Out of Office                | 18507028  | 19814923 | Non-Billable Time                 | No       |

**⚠️ PNG:** the OLD "Papua New Guinea LIS (FY26)" project **46605414 is dead** — no tasks assigned, returns HTTP 422. Use **PNG LIS Tranche 2 (48537882)** with task **26896787** ("DIGI Internal Billable Rate FY27" — NOT the usual 23300925). Piotr was assigned 2026-06-18. Always verify a project's tasks via `harvest_list_tasks` before logging if a 422 appears.

**OpenELIS Community (44644581):** client OpenELIS, all tasks non-billable. Per Piotr (May), OE Community Call / OE coordination / GSoC go to **DIGI General**, not here — confirm before routing anything to this project.

**Note:** Gold Star uses "DIGI External Billable Rate FY25" (task 23300925), NOT "Non-Billable Time". This was confirmed from actual Feb 2026 entry creation.

**Note (June 2026):** Gold Star OE AI Lab is for **OpenELIS** AI work only. The **OpenMRS AI project (chartsearchai repos)** bills to **OpenMRS Cybersecurity (FY26)**, project 48491293, client NSF — despite the "Cybersecurity" name, this is the OpenMRS AI billing target (confirmed by Piotr, June 12 2026). GitHub signal: `openmrs/*chartsearchai*` and `pmanko/clinical-ai-validation-harness` repos → this project.

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
| e-SIL: DIGI <> Mekom weekly | Madagascar LIS  | Mekom = Madagascar partner|
| Analyzers                    | Split Mad/GS    | ~50/50 by forecast ratio  |
| CHARESS <> DIGI              | Haiti HIS       | CHARESS = Haiti partner   |
| Roaming care                 | Haiti HIS       |                           |
| WHO SMART CD Meeting         | WHO SMART       |                           |
| Ethiopia Regroup             | Ethiopia LIS    |                           |
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
| Mozzy & Piotr                | Madagascar LIS  | Moses = Mad release partner |
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
