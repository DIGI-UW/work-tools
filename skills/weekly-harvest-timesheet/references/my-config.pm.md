# Weekly Harvest Timesheet — User Configuration (Project Manager)

## Role
- **Flavor**: pm

## Identity
- **Name**: Your Name
- **Email**: you@example.com
- **Slack ID**: YOUR_SLACK_ID
- **Slack workspace**: your-workspace
- **Work hours**: 9am–5pm (your timezone)
- **Schedule**: Fridays at 3:00 PM
- **Daily total**: exactly 8h, whole-hour blocks

## Jira
- **Cloud ID**: your-jira-cloud-id
- PROJ-* → Your Project Name (add your Jira project key → Harvest project mappings)

## Harvest Project → Task ID Reference

Run `harvest_list_projects` and `harvest_list_tasks` to populate this table:

| Harvest Project | Project ID | Task ID | Task Name      | Billable |
|-----------------|-----------|---------|----------------|----------|
| Project A       | 12345     | 67890   | Billable Work  | Yes      |
| Project B       | 12346     | 67890   | Billable Work  | Yes      |
| General/Admin   | 12347     | 99999   | Non-Billable   | No       |
| Out of Office   | 12348     | 99999   | Non-Billable   | No       |

## Forecast (hours/month)

forecast_last_synced: YYYY-MM-DD

Optional — paste your monthly forecast table here if you have one.

| Project   | Month1 | Month2 | Month3 | ... |
|-----------|--------|--------|--------|-----|
| Project A |     40 |     40 |     40 | ... |
| Project B |     80 |     80 |     80 | ... |

## Meeting → Project Mappings

Map your recurring calendar meetings to Harvest projects:

| Meeting Pattern     | Project     | Notes               |
|--------------------|-------------|----------------------|
| Weekly standup      | Project A   |                      |
| Client sync         | Project B   | External partner     |
| Team meeting        | General     |                      |
| All hands           | General     | Monthly              |

## Meetings NOT Attended (ignore these)

| Meeting Pattern     | Reason          |
|--------------------|-----------------|
| Optional all-hands  | Does not attend |

## Events to Ignore

| Pattern             | Reason                 |
|--------------------|------------------------|
| Social events       | Not work               |
| Room holds          | Not a real meeting     |
| Personal events     | Not work               |
