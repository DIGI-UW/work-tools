---
name: deep-research
description: |
  **Deep Research Agent**: Conducts multi-source research on any topic and produces a structured report with references plus a conversational summary. Supports configurable depth, time budgets, tone personas, source filters, audience targeting, data density, source trust grading, and interactive or unassisted modes.
  - MANDATORY TRIGGERS: research, investigate, literature review, evidence review, find out about, what does the evidence say, deep dive, background research, explore the topic, survey the field, state of the art, look into, compile findings, research report
  - Use this skill whenever the user wants substantive research beyond a simple factual question — multiple sources consulted, findings synthesized, or a report produced. Even casual phrasing like "can you look into X" or "I need to understand Y better" should trigger this skill when the implied need is multi-source research.
  - Do NOT trigger for simple factual questions answerable from knowledge or a single search.
---

## Prerequisites

**MCP Servers** (optional):
- PubMed MCP — biomedical literature search (Claude-native integration)
- Atlassian MCP — Confluence page search (optional, for internal docs)

**Environment Variables**: None.

**Full tool reference:** See [references/work-tools-index.md](references/work-tools-index.md) for all available MCP tools and other skills.

# Deep Research Skill

Conduct rigorous, multi-source research and deliver:
1. A **structured research report** saved as a markdown file
2. A **concise conversational summary** of key findings

## Parameters

The user may specify any of these. If not, infer smart defaults from context.

### Mode
- **interactive** (default) — present a research plan with all assumed parameters and wait for user confirmation before searching. This is the careful mode: validate tone, scope, audience, depth, and source assumptions with the user first.
- **unassisted** — go with smart defaults immediately, no confirmation step. For when the user wants speed over polish.

### Depth
- **quick**: 3-5 sources. Getting oriented on a topic.
- **standard** (default): 10-15 sources. Solid coverage with synthesis.
- **deep**: 20-40+ sources, following citation trails. Comprehensive.

### Time Budget
A hard upper limit on how long the entire research task should take, from first search to final saved report.
- Examples: "1 minute," "5 minutes," "15 minutes," "take your time"
- Default: no limit (depth parameter governs effort)

**Time budget is always a hard ceiling.** Never exceed it. If depth is deep but time is 5 minutes, cut the research short and deliver the best report possible within 5 minutes.

**But don't stop early without checking.** If you finish your planned research rounds with time remaining:
1. Do a coverage assessment — are there obvious gaps, unanswered sub-questions, or thin sections?
2. If yes, use the remaining time to strengthen weak areas, follow up on promising leads, or add more sources.
3. If depth was not explicitly set (i.e., you're inferring it), use the full time budget productively. Someone who says "15 minutes" is telling you they want 15 minutes' worth of research, not a quick skim that finishes in 3.
4. Only stop early if you're genuinely satisfied the topic is well-covered and additional searching would yield diminishing returns.

When depth is not specified, use the time budget to gauge effort:
  - **~1 min**: 2-3 parallel searches, synthesize immediately. No follow-up rounds.
  - **~5 min**: 2 rounds of searching, moderate follow-up.
  - **~15 min**: Multiple iterative rounds, citation chasing, thorough cross-referencing.
  - **30+ min**: Exhaustive — full-text articles, every promising lead, comprehensive evidence base.

**How to track time.** You don't have an internal clock, so use timestamps:
1. At the very start of research, run: `date +%s` via Bash and store the result as your start time.
2. At the end of each search round (a natural breakpoint), run `date +%s` again and compute elapsed seconds: `echo $(( $(date +%s) - START_TIME ))`.
3. Reserve roughly 30% of the time budget for synthesis and writing. So if the budget is 10 minutes, start wrapping up research by ~7 minutes.
4. If you're past the time budget, stop searching immediately and write the report with what you have. Note in the report metadata that the time budget was reached and further research could expand coverage.

Be strategic: run searches in parallel, prioritize high-value sources early, and always leave enough time for a well-written report. A polished 5-minute report beats a sloppy 15-minute one.

### Tone
Use persona-style labels that feel intuitive. The tone shapes the voice, formality, and feel of the report:

- **analyst** — professional, clear, evidence-driven. Like a briefing for a decision-maker. Good for policy, business, strategy topics.
- **storyteller** — narrative, engaging, explains context and significance. Like a well-written long-form article. Good for making complex topics accessible.
- **academic** — formal, precise, citation-heavy, structured argumentation. Like a journal review. Good for literature reviews and technical audiences.
- **friendly** — warm, practical, conversational. Like getting advice from a knowledgeable friend. Good for personal research, family decisions, consumer topics.
- **auto** (default) — infer from topic context. Health policy → analyst. Summer camps → friendly. Literature review → academic. Tech trends → storyteller.

The user can also provide a freeform description instead (e.g., "write like a WHO country office briefing" or "casual but data-backed").

### Data Density
Controls the balance between narrative prose and structured data in the report body:

- **narrative** (default) — prose-first. The main sections tell a story with bolded key points and short, readable paragraphs. Dense data (detailed comparisons, long lists, raw data) goes into tables, figures, or appendices rather than cluttering the narrative flow.
- **balanced** — narrative core with inline tables and figures where they genuinely aid comprehension. Data is woven into the text when it helps; pushed to appendices when it doesn't.
- **data-rich** — more tables, figures, and structured data in the body. Narrative wraps around the data. Good for technical audiences who want to see the evidence laid out.

### Output Length
- **brief**: 1-2 pages
- **standard** (default): 3-5 pages
- **comprehensive**: 6-10+ pages
- Or a specific word count target.

### Audience
Who the report is written for. This affects vocabulary, assumed knowledge, and how much background context to include:

- **technical** — assumes domain expertise. Uses field terminology without over-explaining.
- **executive** — high-level focus on implications, decisions, and actionable takeaways. Minimal technical detail.
- **general** (default) — accessible to an informed non-specialist. Explains key terms briefly.
- **personal** — for the user's own use. Less formal structure, more direct and practical.
- Freeform: e.g., "my team of public health informaticists" or "a board of directors."

### Recency
Optional time window to constrain source freshness:
- Examples: "last 2 years," "since 2020," "last 6 months"
- Default: no filter (most relevant sources regardless of date)

### Source Filters
Two dimensions for controlling what sources the research draws from:

**Source type** — include or exclude by category:
- PubMed / scholarly literature
- Web (general)
- News / journalism
- Government / institutional (WHO, CDC, government agencies)
- Google Drive (internal documents)
- Confluence / Jira (team knowledge)
- Grey literature (working papers, preprints, reports)
- Freeform: e.g., "only .gov and .org sites," "skip news articles"

**Evidence tier** (especially relevant for health/science topics) — set a minimum tier or preference order:
- Systematic reviews & meta-analyses
- Randomized controlled trials (RCTs)
- Observational studies (cohort, case-control, cross-sectional)
- Expert opinion & commentary
- Grey literature & reports

Example usage: "prioritize systematic reviews," "only peer-reviewed sources," "include grey literature"

### Source Trust Grading
- **enabled** (default) / **disabled**

When enabled, the References section becomes a color-coded bibliography table rather than a plain list. This makes it easy to scan source quality at a glance.

The grading considers three dimensions:
- **Authority**: Is this an established institution, peer-reviewed journal, recognized expert, or unknown entity?
- **Evidence quality**: Primary data / original research → secondary reporting → opinion / commentary
- **Recency**: How current is the information relative to the topic?

Present the bibliography as a markdown table with color-coded confidence indicators:

```markdown
## References

| # | Confidence | Source | Type | Notes |
|---|-----------|--------|------|-------|
| 1 | 🟢 High | WHO. "Global Strategy on Digital Health 2020-2025." 2021. [Link](https://...) | Institutional / Policy document | Official WHO primary source |
| 2 | 🟡 Medium | Smith, J. "FHIR in Rural Kenya." *Healthcare IT News*, 2025. [Link](https://...) | Trade journalism | Single-author reporting; corroborated by [1], [5] |
| 3 | 🔴 Low | "Top 10 Digital Health Trends." Anonymous blog, 2024. [Link](https://...) | Unattributed web content | No editorial oversight; included for trend context only |
```

Color coding:
- 🟢 **High confidence** — peer-reviewed, institutional primary sources, established experts
- 🟡 **Medium confidence** — reputable journalism, credible secondary sources, grey literature from known organizations
- 🔴 **Low confidence** — unattributed content, opinion pieces, sources with limited editorial oversight

The grading is descriptive, not a filter. All sources that made it into the report earned their place — the table helps the reader quickly calibrate how much weight to put on each one and understand *why* each source was included.

## Research Process

### 1. Plan and Validate

Break the research question into sub-questions. Identify which tools, source types, and parameters fit.

**In interactive mode**: Present the full plan to the user before searching. Include:
- Topic and sub-questions you'll investigate
- Assumed parameters: depth, tone, audience, data density, source types, recency
- Estimated time and source count
- Any clarifying questions about scope or focus

Wait for confirmation. The user may adjust parameters, narrow the scope, or redirect focus — better to catch this now than after 20 minutes of searching.

**In unassisted mode**: Skip confirmation. Log your assumed parameters in the report metadata and proceed.

### 2. Search Iteratively

Use multiple rounds of searching, each informed by the previous. Follow promising leads, check cited sources, and look for contradicting evidence.

Available tools:
- **WebSearch** — broad queries, current events, grey literature
- **PubMed** (search_articles, get_article_metadata, find_related_articles, get_full_text_article) — biomedical literature
- **WebFetch** — read full content of important web pages
- **Google Drive** (google_drive_search) — internal docs and prior work *(only if a Google Drive MCP is configured; skip if unavailable)*
- **Confluence/Jira** (Atlassian search) — team knowledge
- **Gmail** — only if the user specifically asks

Run searches in parallel where possible to save time. Respect source type filters and evidence tier preferences.

### 3. Synthesize and Write

Write the report matching the specified tone, audience, and data density. The writing quality matters as much as the research quality.

**Writing principles**:
- The main body should be **narrative prose** — not bullet dumps. Use short, engaging paragraphs with bolded key phrases for scannability.
- Dense data (detailed comparisons, statistics, long lists) belongs in **tables, figures, or appendices** — not inline bullet lists.
- Every section should earn its place. Cut filler ruthlessly.

**Report structure** — adapt based on topic and tone:

```markdown
# [Research Topic]

> Research conducted on [date] | Depth: [depth] | Sources: [N] | Tone: [tone] | Audience: [audience]

## [Overview section — see tone-adapted naming below]
[2-3 paragraph synthesis — the key takeaways someone needs if they read nothing else]

## [Context section]
[Context: what this topic is, why it matters, current state of affairs]

## [Findings sections]

### [Theme 1]
[Narrative discussion with evidence from multiple sources. Bold key points. Short paragraphs.]

### [Theme 2]
[...]

## [Analysis section]
[Synthesis — what the findings mean together, patterns, contradictions, evidence gaps]

## [Takeaways section]
[Actionable takeaways based on the evidence]

## References
[Numbered citations with URLs/DOIs and trust grading annotations if enabled]

## Appendix (if applicable)
[Detailed data tables, extended comparisons, supplementary material]
```

**Adapt section names to match the tone.** "Executive Summary" is perfect for analyst and academic tones, but sounds corporate in a friendly or storyteller context. Match the headers to the voice:

| Section purpose | analyst / academic | storyteller | friendly |
|---|---|---|---|
| Overview | Executive Summary | The Big Picture | Quick Take / What You Need to Know |
| Context | Background | Setting the Scene | Some Context |
| Findings | Key Findings | What We Found | What Stood Out |
| Analysis | Analysis & Discussion | Connecting the Dots | What It All Means |
| Takeaways | Conclusions & Recommendations | Where This Is Heading | Bottom Line / Next Steps |

These are suggestions, not rigid rules — use your judgment to pick headers that feel natural for the topic and tone. The point is: a guide about summer camps shouldn't read like a policy brief.

For **quick** depth: Overview, Findings, References.
For **deep** depth: consider adding methodology notes, evidence tables, detailed appendices.

### 4. Save and Present

1. Save the report as markdown to the outputs directory
2. Provide a 3-5 sentence conversational summary in chat
3. Link the report file for download
4. Offer format conversion (docx, PDF) if the user wants it

## Principles

- Every claim should trace to a cited source. Include dates and URLs/DOIs.
- Surface conflicting evidence honestly — don't flatten disagreements.
- Distinguish "one source claims X" from "X is well-established across multiple sources."
- Don't pad. Every section should earn its place.
- If you find very little, say so. Note what you searched and suggest alternatives.
- Readable > comprehensive. A shorter, well-written report beats a longer wall of text.
