# Harvest Timesheet — User Configuration (Casey / DIGI)

Casey's DIGI/I-TECH config. To use: `cp my-config.casey.md my-config.md`.

## Identity
- **Harvest Account ID**: `978800`
- **Harvest User ID**: `2344962`          <!-- omit user_id in MCP calls to default to self -->
- **Email**: caseyi@uw.edu
- **Timezone**: America/Los_Angeles

## Schedule & allocation
- **hours_per_day**: 7.5
- **ooo_hours**: 8.0
- **increment**: 0.25
- **week**: Mon–Fri
- **filler_split**: 80% Papua New Guinea Tranche 2 / 20% Indonesia   <!-- Madagascar is meeting-only, no filler; updated 2026-07-10 (was 30% Madagascar / 70% Indonesia on 2026-05-29) -->

## Approved projects (bill ONLY to these)

| Project | project_id | task_id | Calendar keywords | Filler? |
|---|---|---|---|---|
| Madagascar LIS (FY26) | 46605259 | 23300925 | Madagascar, Mekom, eSIL/e-SIL, MedX, O3 Squad, OpenMRS, Comité de projet, OpenELIS Review, OpenELIS Community Call | meeting-only |
| Indonesia LIS (FY26) | 47227048 | 23300925 | Indonesia, APHL, SILNAS, Indo, OE cross-project coordination | yes |
| Papua New Guinea LIS Tranche 2 (FY26/FY27) | 48537882 | 23300925 | PNG, Papua, Johnson, Dev/tech team weekly check-in | yes |
| DIGI General Work | 18982046 | 23300925 | DIGI, DGH, OHIE, Zim VMMC, Workforce, TPM, Interoperability, OMRS Checkin, Team Meeting, Dev Weekly strategy review | meeting-only |
| Ethiopia LIS AHRI (FY26) | 46004172 | 23300925 | Ethiopia, Orbit | yes |
| Out of Office | 18507028 | 19814923 | OOO, holiday, vacation, sick | n/a |

## Mapping rules
- **Special routing**:
  - TAP/DRC → **NEVER bill**; route those hours to **Madagascar** instead.
  - OpenELIS Community Call → **Madagascar**.
  - OE cross-project coordination → **Indonesia**.
  - Dev/tech team weekly check-in → **PNG Tranche 2**.
- **Skip (do not bill)**: Open Digital Health Summit Planning Call, OHS Developers Calls, Global
  Product Support Team, Yao Celebration Potluck, "RE: Fortnightly Catch Up", Aurum & DIGI follow-up,
  any private "Busy" blocks. Canceled events → skip entirely.
- **Ambiguous events**: interactive → ask Casey; unattended → leave out of meeting mapping (filler
  covers the day) and note in the report.

## Archived / retired projects (never bill)
- PNG Tranche 1 `46605414` — archived 2026-06-18; Harvest rejects entries. Use Tranche 2 `48537882`.

## Holidays
- **jurisdiction**: Washington State (RCW 1.16.050) — `references/wa-holidays.js`.

## Notes
- Account conventions (from `get_account_settings`, 2026-06-20): approval required before final;
  hour rounding OFF (log exact 0.25h); Harvest week starts Sunday but Casey's work week is Mon–Fri —
  always drive the range explicitly.
- Submission is manual: entries land `unsubmitted`; Casey reviews before approving.
