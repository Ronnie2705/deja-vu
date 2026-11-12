# Déjà Vu — Requirements

> Codegeist 2026 · Category: **Apps for Software Teams**
> Target bonuses: **Best Agents (Rovo)**, **Best app with MCP**, **Best Teamwork Graph integration**
> Deadline: **Tue Dec 22, 2026, 12:00 PM PT** — aim to submit by **Sun Dec 20**.

## Problem

When an incident opens, the on-call engineer starts from zero, even though the team has usually
seen this failure before. The fix lives in a closed ticket, the cause in a PR or deploy, the
procedure in a Confluence runbook, and the expert in someone else's head. Déjà Vu brings that
context to the incident the moment it's created.

## Users

- **On-call engineer** — needs a fast, trustworthy "have we seen this before, and what fixed it?"
- **Incident commander** — needs to know who to pull in and whether a recent change is the likely cause.
- **Team lead** — wants to see where runbooks are missing for recurring incidents.

## Requirements

### R1 — Similar past incidents
**As an** on-call engineer, **I want** the most similar past incidents for the incident I'm looking at,
**so that** I can reuse what worked.

Acceptance criteria:
1. Given an open incident, Déjà Vu returns up to 5 resolved incidents ranked by relevance.
2. Each result shows key, summary, affected service, when it happened, a relevance score, and
   the resolution note.
3. Ranking combines text similarity, same-service match, and recency (see design.md §Ranking).
4. Incidents with no meaningful match return an explicit "no strong match" result instead of
   weak guesses (score below threshold is not shown as a match).
5. Results only include incidents the current user has permission to see.

### R2 — Related changes (PRs and deploys)
**As an** incident commander, **I want** the PRs and deployments linked to similar past
incidents, and any recent deploys to the affected service, **so that** I can spot a likely cause.

Acceptance criteria:
1. For each similar incident, show linked pull requests and deployments read from Teamwork Graph.
2. Flag deploys to the same service within a configurable window (default 2 hours) before the
   current incident as "recent change".
3. If the graph returns nothing, say so; never fabricate links.

### R3 — Runbook
**As an** on-call engineer, **I want** the matching Confluence runbook, **so that** I can follow a known procedure.

Acceptance criteria:
1. Return the best-matching runbook page (title + link) for the affected service / failure type.
2. If no runbook exists for a recurring cluster (≥ 3 similar incidents), show "Runbook missing"
   so the team can see the gap.

### R4 — Who fixed it last time
**As an** incident commander, **I want** to know who resolved similar incidents, **so that** I can pull in the right person.

Acceptance criteria:
1. List up to 3 people who resolved the most similar incidents, with how many each resolved.
2. Use the resolver (assignee at resolution), not the reporter.

### R5 — Suggested next step
**As an** on-call engineer, **I want** a short suggested next step, **so that** I can act immediately.

Acceptance criteria:
1. The Rovo agent produces 1–3 concrete next steps grounded only in R1–R4 evidence.
2. Every suggestion cites the incident, runbook, or deploy it came from.

### R6 — Surfaces
1. **Rovo agent** ("Déjà Vu") answers questions like "Have we seen this before?" and
   "What changed in payments-api before the last outage?" using the actions below.
2. **Jira issue panel** on incidents shows R1–R4 at a glance without opening chat.
3. **MCP tools** (`rovo:mcp`) expose the same actions to custom Rovo Studio agents and
   MCP-compatible clients.

### R7 — Automatic indexing
1. When an incident is created or resolved, Déjà Vu updates its index automatically (Forge trigger).
2. A one-time "reindex" admin action rebuilds the index from existing incidents.

## Non-functional

- **Speed:** issue panel loads in under 3 s for a project with ≤ 500 incidents.
- **Privacy:** no data leaves Atlassian; no external APIs or LLMs beyond Rovo itself.
- **Honesty:** the agent states uncertainty and never invents incidents, links, or people.
- **Runs on Atlassian:** keep the app eligible (Forge-hosted, no egress).

## Out of scope (for the hackathon)

- Writing new runbooks automatically (stretch only).
- Slack / Teams notifications.
- Paid Marketplace listing (free listing only, if at all).
