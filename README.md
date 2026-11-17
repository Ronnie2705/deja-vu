# Déjà Vu — Incident Memory for Jira Service Management

> *"Have we seen this before?"* — answered in seconds, grounded in your own incident history.

Déjà Vu is an [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app for Jira Service Management that gives on-call engineers an institutional memory. When an incident lands, Déjà Vu instantly surfaces the similar incidents your team has already resolved, who fixed them, and the runbook that applies. When a recurring failure has **no** runbook, it drafts one — grounded entirely in how the past incidents were actually fixed — and **publishes it to Confluence** on request. And it doesn't wait to be asked: the moment a new incident is created, Déjà Vu **auto-posts its memory as a comment**.

Built for **Atlassian Codegeist 2026** — *Apps for Software Teams*.

---

## The problem

At 2 a.m., the on-call engineer staring at a fresh incident almost never knows that the same failure was solved three times last quarter — by three different people, with the fix buried in a closed ticket's resolution note. The knowledge exists; it just isn't reachable at the moment it matters. Runbooks, where they exist at all, drift out of date, and nobody notices the recurring failure that *should* have one.

Déjà Vu closes that gap. It treats every resolved incident as memory, and makes that memory reachable right where the work happens — proactively in the issue view, and on demand through a Rovo agent.

---

## What it does

Déjà Vu ships as a **Rovo agent** with grounded abilities, an **issue panel** that shows the same intelligence inline, and a **proactive trigger** that comments on new incidents automatically.

| Ability | What it answers | How it's grounded |
|---|---|---|
| **Find similar incidents** | "Have we seen this before?" | Ranks resolved incidents by text similarity, same-service, and recency |
| **Who fixed it** | "Who should I pull in?" | Counts who resolved the similar incidents, most-recent first |
| **Find the runbook** | "Is there a runbook for this?" | Matches Confluence runbooks by content overlap; flags when a recurring failure has none |
| **Draft a runbook** | "Write the missing runbook" | Drafts service, symptoms, signatures, and **fix steps taken verbatim from past resolutions** — inventing nothing |
| **Publish a runbook** | "Save that draft" | Writes the grounded draft to the Confluence runbook space as a real page; the next lookup finds it |
| **Responder context** | "What else is this person handling?" | Reads the **Teamwork Graph** for the assignee's other work items — live, cross-product |
| **Reindex** | "Rebuild the memory" | Re-reads resolved incidents and runbooks from Jira + Confluence |

And two things that happen with **no prompting at all**:

- **Proactive triage** — when a new incident is created, a trigger posts a Déjà Vu memory comment: recurrence count, who to pull in, and the matching runbook (or a missing-runbook warning).
- **Self-improving memory** — when an incident *resolves* and reveals a recurring failure that still has no runbook, Déjà Vu auto-posts a ready-to-publish draft on the ticket. The knowledge base closes its own gaps as work resolves.

A full-page **dashboard** (a Jira project page) turns all of this into a runbook-coverage command center for incident leads: coverage %, which services have gaps, top responders, and recurrence over time.

Every answer is built **only** from the app's own retrieved data. The agent is instructed never to invent incidents, people, fixes, or links — if a field is unknown, it says so.

---

## How it works

### Retrieval & ranking

Déjà Vu maintains an index of resolved incidents in [Forge KVS](https://developer.atlassian.com/platform/forge/runtime-reference/storage-api/) storage, refreshed on demand and kept live by Jira triggers on issue create/update.

Matching is a small, transparent ranking engine (no external ML services, no data leaving Atlassian):

```
score = w1 · BM25(text)  +  w2 · [same service]  +  w3 · recency_decay
```

- **BM25** over a custom tokenizer that normalizes plurals and status codes and flags error *signatures* (e.g. `ETIMEDOUT`, `502`, `x509`), which are weighted more heavily than ordinary words.
- **Same-service** boost so a `payments-api` incident prefers other `payments-api` incidents.
- **Recency decay** (90-day half-life) so the freshest precedent surfaces first.
- A candidate is a match only if it clears both a score threshold **and** a minimum text-similarity floor — same-service and recency alone never manufacture a match.

### Runbook matching, drafting & publishing

Runbooks are read from a Confluence space and matched to an incident by weighted term overlap (error signatures count double). A confident match points the engineer straight to the runbook. No match on a failure that has recurred past a threshold is reported as a **missing runbook** — the signal that one should be written.

When asked to draft that missing runbook, Déjà Vu:

1. **Focuses on the closest cluster** — it drafts only from the incidents most similar to the query, not the whole long tail, so a *PayRail timeout* runbook doesn't bleed in release-regression `502`s or unrelated ledger errors. (This also keeps a stray incident's error code from surfacing as a false signature.)
2. **Extracts grounded material** — the most common affected service, the error signatures that recur across the cluster, representative symptoms, and the **distinct resolution notes verbatim** as candidate fix steps.
3. **Publishes on request** — writes the draft to the Confluence runbook space as a real page (HTML-escaped, stamped as an auto-draft citing its source incidents), then the next `find-runbook` lookup returns it. The **detect → draft → publish → find** loop closes end-to-end.

Nothing in the draft is generated from thin air; every fix step is a real resolution note from a real past incident. Both drafting and publishing share one grounded builder, so the published page is exactly what the agent showed.

### Proactive triage

A Forge trigger on `avi:jira:created:issue` fires when a new incident is created. If it's a tracked incident with similar history, Déjà Vu posts a comment — *"Seen 8× before; most recent PAY-36. Maya Chen resolved 6 of them. Runbook: …"* — with the runbook linked if one exists, or a warning if a recurring failure has none. It dedupes (a retried trigger won't double-post) and stays quiet for genuinely novel incidents rather than spamming. Updated incidents just re-index; only *created* ones trigger triage.

### Teamwork Graph context

For a given incident, Déjà Vu queries the **Teamwork Graph** (via a curated query, `atlassianUserAssignedJiraWorkItems`) to surface what else the incident's assignee is currently handling — live, cross-product data pulled straight from the graph. It's an independent cross-check on the "who to pull in" signal: the index names the expert, and the graph confirms their track record on the service.

### Self-improving memory

The create/update triggers are split: a *created* incident gets proactive triage; an *updated* one re-indexes. When that update is a **resolution**, Déjà Vu checks whether the failure has now recurred past the threshold with no matching runbook — and if so, posts a grounded, ready-to-publish draft on the ticket (deduped to once per incident). Reply "publish it" and the draft lands in Confluence, so the next incident of that type finds it and the dashboard's coverage climbs. Memory that curates itself.

### Coverage dashboard

A `jira:projectPage` renders a live command center from the index: a pure `aggregateDashboard()` computes runbook coverage (per-incident runbook matches), coverage and gaps by service, top responders, and incidents by month, drawn with UI Kit's native bar charts. It reframes Déjà Vu from a per-incident helper into an operational-risk map for incident leads — which recurring failures still have no runbook, and whether coverage is improving.

---

## Forge modules

| Module | Key(s) | Purpose |
|---|---|---|
| `rovo:agent` | `deja-vu` | The conversational agent and its seven abilities |
| `rovo:mcp` | `deja-vu-mcp` | Exposes the core actions as MCP tools |
| `action` (×7) | `find-similar-incidents`, `who-fixed-it`, `find-runbook`, `suggest-runbook`, `publish-runbook`, `reindex-incidents`, `graph-context` | The agent's abilities |
| `jira:issuePanel` | `deja-vu-panel` | Inline incident intelligence (UI Kit, `render: native`) |
| `jira:projectPage` | `deja-vu-dashboard` | The coverage dashboard (UI Kit charts) |
| `trigger` | `index-on-create`, `index-on-update` | `created` → index + proactive triage; `updated` → index + self-improving gap nudge |

**Scopes:** `read:jira-work`, `read:jira-user`, `write:jira-work`, `read:space:confluence`, `read:page:confluence`, `write:page:confluence`, `storage:app`, `read:graph:issue:jira`, `read:graph:user:atlassian`
**Runtime:** `nodejs24.x` (arm64)

> Note: Confluence calls use the **v2 API**, which requires the **granular** Confluence scopes (`read:space:confluence`, `write:page:confluence`) rather than the older classic ones.

---

## Tech stack

- **Atlassian Forge** — serverless app platform (Jira + Confluence)
- **Rovo** — agent, actions, and MCP module
- **Teamwork Graph** — live cross-product context via a curated query (`requestTeamworkGraph`)
- **TypeScript** throughout; **UI Kit** (`@forge/react` ≥ 11.2.0) for the issue panel and the dashboard's native bar charts
- **Vitest** — 45 unit tests covering tokenization, ranking, source-focusing, experts, runbook matching, drafting, the Confluence storage-body builder, the triage + runbook-opportunity comment builders, and the dashboard aggregation
- Zero external services — all retrieval and ranking runs inside Forge

---

## Project structure

```
deja-vu/
├── manifest.yml              # Forge modules, agent prompt, scopes
├── src/
│   ├── config.ts             # Project key, incident type, field names, thresholds
│   ├── core/                 # Pure logic — no Forge imports, fully unit-tested
│   │   ├── tokenize.ts       # Tokenizer + error-signature detection
│   │   ├── bm25.ts           # BM25 index
│   │   ├── rank.ts           # rankIncidents() + focusToCluster()
│   │   ├── experts.ts        # whoFixedIt()
│   │   ├── runbook.ts        # matchRunbook(), draftFromIncidents(), runbookStorageBody()
│   │   ├── triageComment.ts  # buildTriageAdf() + buildRunbookOpportunityAdf()
│   │   └── dashboard.ts      # aggregateDashboard() — coverage metrics
│   ├── adapters/             # Forge-facing I/O
│   │   ├── jira.ts           # Incident/resolution reads, ADF↔text, addComment()
│   │   ├── confluence.ts     # Runbook fetch + createRunbookPage()
│   │   └── store.ts          # KVS index (incidents + runbooks)
│   ├── indexer.ts            # reindexAll(), ensureIndex(), triggers, triage + gap nudge
│   ├── actions.ts            # Rovo actions (thin: fetch → core → format)
│   ├── graph.ts              # Teamwork Graph curated-query integration
│   ├── dashboard/            # Dashboard project-page frontend + resolver
│   └── panel/                # Issue-panel frontend + resolver
├── scripts/                  # Synthetic demo-data seeding (see below)
└── test/                     # 45 Vitest tests
```

The `core/` layer is deliberately pure — no Forge imports — so the ranking, drafting, and rendering logic is fast to test and reason about in isolation.

---

## Setup & installation

### Prerequisites

- Node.js 20–24 and the [Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/) (`npm install -g @forge/cli`)
- A Jira Service Management site with a **Payments Platform Ops** (or equivalent) project
- A Confluence space named **Runbooks** (or keyed `RUN`) for published runbooks

### Deploy

```bash
npm install
npm run build          # or: npx tsc -p . --noemit   (type-check only)
npx vitest run         # 39 tests should pass
forge deploy
forge install --upgrade
```

Because the app integrates both Jira and Confluence, it installs as two product installations; run `forge install --upgrade --product jira` and `--product confluence` to upgrade both. Scope changes trigger a major-version bump — approve with `forge deploy --approve MAJOR_VERSION_RULE` and accept the new permissions on upgrade.

### Configure

Déjà Vu reads its project key, incident type, field names, and runbook space key from `src/config.ts`. Adjust these to match your JSM project and Confluence space, then redeploy.

---

## Demo data (synthetic)

This repository includes a **synthetic, reproducible demo dataset** so judges and reviewers can see Déjà Vu working against realistic incident history without any real customer data.

`scripts/seed.mjs` creates **43 fabricated incidents** on a test JSM project, organized into clusters that mirror real on-call patterns:

- **Release regressions** — `payments-api` 5xx errors after deploys (these *have* a rollback runbook)
- **Database connection exhaustion** — `ledger-db` pool timeouts under load
- **Certificate expiry** — `auth-gateway` TLS/x509 failures
- **Consumer lag** — `notifications-worker` delayed receipts and rebalance storms
- **PayRail gateway timeouts** — recurring card-payment failures that **have no runbook** (the "draft the missing runbook" demo)
- **Noise** — unrelated one-off tickets, to prove the matcher doesn't over-trigger

All of it is invented for demonstration. To recreate it:

```bash
node scripts/seed.mjs
```

---

## Try it

**On demand**, ask the Déjà Vu agent (or read the issue panel):

- **"Have we seen this incident before?"** → verdict, recurrence count, and top matches with resolvers
- **"Who should I pull in for this?"** → the people who've resolved similar incidents
- **"Is there a runbook for PAY-34?"** → the matching runbook, or a missing-runbook warning
- **"Draft a runbook for PAY-34"** → a grounded draft for a recurring PayRail failure that has no runbook
- **"Publish it to Confluence"** → writes the draft as a real Confluence page and links it; reindex, and the next lookup finds it
- **"What else is the responder for PAY-9 working on?"** → the assignee's other work, live from the Teamwork Graph

**Proactively:**

- Create a new `[System] Incident` (e.g. *"Card payments failing: PayRail timeout"*) and watch Déjà Vu post its memory as a comment within seconds — no one asked.
- Resolve an incident in an uncovered cluster (e.g. ledger-db) and watch Déjà Vu post a **ready-to-publish runbook draft** — the self-improving loop.

**Dashboard:** open the **Déjà Vu** page in the project sidebar for runbook coverage %, gaps by service, top responders, and incidents over time — then publish a drafted runbook and watch coverage climb.

---

## Tests

```bash
npx vitest run
```

45 tests cover the tokenizer and signature detection, the ranking engine, closest-cluster source focusing, expert attribution, runbook matching, runbook drafting (asserting every fix step is a real resolution note), the Confluence storage-body builder (including HTML-escaping), the triage and runbook-opportunity comment builders, and the dashboard coverage aggregation.

---

## Runs on Atlassian

Déjà Vu runs entirely on Forge — all compute, storage, and data access stay within the Atlassian platform. No incident data is sent to any external service, which makes it eligible for the **Runs on Atlassian** program.

---

## Bonus prize alignment

- **Best Agents (Rovo):** a `rovo:agent` with seven grounded abilities.
- **Best app with Atlassian MCP:** a `rovo:mcp` module exposing the core actions as MCP tools.
- **Best Teamwork Graph integration:** live consumption of the Teamwork Graph via a curated query for responder context.

---

## Limitations & roadmap

- Matching is intentionally lightweight (BM25 + signals) rather than embedding-based — transparent and dependency-free, at the cost of some recall on heavily paraphrased incidents. Embedding-backed retrieval is a natural next step.
- Runbook drafting focuses on the dominant failure cluster; in domains with heavy vocabulary overlap, a closely related incident may still appear as a supporting symptom. Drafts are always marked for human review.
- The Teamwork Graph integration reads the assignee's work items today; with a Bitbucket/GitHub connector ingesting deployments and pull requests, the same approach extends to true **deployment awareness** (`jiraWorkItemLinkedExternalDeployments`) — a natural next step.

---

## Author

**Bhawneet Singh** — built for Atlassian Codegeist 2026.

## License

MIT (see `LICENSE`).
