# Déjà Vu — Incident Memory for Jira Service Management

> *"Have we seen this before?"* — answered in seconds, grounded in your own incident history.

Déjà Vu is an [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app for Jira Service Management that gives on-call engineers an institutional memory. When an incident lands, Déjà Vu instantly surfaces the similar incidents your team has already resolved, who fixed them, and the runbook that applies — and when a recurring failure has **no** runbook, it drafts one for you, grounded entirely in how the past incidents were actually fixed.

Built for **Atlassian Codegeist 2026** — *Apps for Software Teams*.

---

## The problem

At 2 a.m., the on-call engineer staring at a fresh incident almost never knows that the same failure was solved three times last quarter — by three different people, with the fix buried in a closed ticket's resolution note. The knowledge exists; it just isn't reachable at the moment it matters. Runbooks, where they exist at all, drift out of date, and nobody notices the recurring failure that *should* have one.

Déjà Vu closes that gap. It treats every resolved incident as memory, and makes that memory queryable right where the work happens — in the issue view and through a Rovo agent.

---

## What it does

Déjà Vu ships as a **Rovo agent** with five grounded abilities, plus an **issue panel** that shows the same intelligence inline on any incident.

| Ability | What it answers | How it's grounded |
|---|---|---|
| **Find similar incidents** | "Have we seen this before?" | Ranks resolved incidents by text similarity, same-service, and recency |
| **Who fixed it** | "Who should I pull in?" | Counts who resolved the similar incidents, most-recent first |
| **Find the runbook** | "Is there a runbook for this?" | Matches Confluence runbooks by content overlap; flags when a recurring failure has none |
| **Draft a runbook** | "Write the missing runbook" | Drafts service, symptoms, signatures, and **fix steps taken verbatim from past resolutions** — inventing nothing |
| **Reindex** | "Rebuild the memory" | Re-reads resolved incidents and runbooks from Jira + Confluence |

Every answer is built **only** from the app's own retrieved data. The agent is instructed never to invent incidents, people, fixes, or links — if a field is unknown, it says so.

---

## How it works

### Retrieval & ranking

Déjà Vu maintains an index of resolved incidents in [Forge KVS](https://developer.atlassian.com/platform/forge/runtime-reference/storage-api/) storage, refreshed on demand and kept live by a Jira trigger on issue create/update.

Matching is a small, transparent ranking engine (no external ML services, no data leaving Atlassian):

```
score = w1 · BM25(text)  +  w2 · [same service]  +  w3 · recency_decay
```

- **BM25** over a custom tokenizer that normalizes plurals and status codes and flags error *signatures* (e.g. `ETIMEDOUT`, `502`, `x509`), which are weighted more heavily than ordinary words.
- **Same-service** boost so a `payments-api` incident prefers other `payments-api` incidents.
- **Recency decay** (90-day half-life) so the freshest precedent surfaces first.
- A candidate is a match only if it clears both a score threshold **and** a minimum text-similarity floor — same-service and recency alone never manufacture a match.

### Runbook matching & drafting

Runbooks are read from a Confluence space and matched to an incident by weighted term overlap (error signatures count double). A confident match points the engineer straight to the runbook. No match on a failure that has recurred past a threshold is reported as a **missing runbook** — the signal that one should be written.

When asked to draft that missing runbook, Déjà Vu:

1. **Focuses on the closest cluster** — it drafts only from the incidents most similar to the query, not the whole long tail, so a *PayRail timeout* runbook doesn't bleed in release-regression `502`s or unrelated ledger errors. (This also keeps a stray incident's error code from surfacing as a false signature.)
2. **Extracts grounded material** — the most common affected service, the error signatures that recur across the cluster, representative symptoms, and the **distinct resolution notes verbatim** as candidate fix steps.
3. **Hands a reviewable draft to a human** — clearly labeled as a draft, citing the incidents it was built from, for an engineer to refine before publishing.

Nothing in the draft is generated from thin air; every fix step is a real resolution note from a real past incident.

---

## Forge modules

| Module | Key | Purpose |
|---|---|---|
| `rovo:agent` | `deja-vu` | The conversational agent and its five abilities |
| `rovo:mcp` | `deja-vu-mcp` | Exposes the core actions as MCP tools |
| `action` (×6) | `find-similar-incidents`, `who-fixed-it`, `find-runbook`, `suggest-runbook`, `reindex-incidents`, `graph-echo` | The agent's abilities |
| `jira:issuePanel` | `deja-vu-panel` | Inline incident intelligence (UI Kit, `render: native`) |
| `trigger` | `index-on-change` | Keeps the index fresh on issue create/update |

**Scopes:** `read:jira-work`, `read:jira-user`, `read:confluence-space.summary`, `read:page:confluence`, `storage:app`, `read:graph:issue:jira`
**Runtime:** `nodejs24.x` (arm64)

---

## Tech stack

- **Atlassian Forge** — serverless app platform (Jira + Confluence)
- **Rovo** — agent, actions, and MCP module
- **TypeScript** throughout; **UI Kit** (`@forge/react`) for the issue panel
- **Teamwork Graph** connectivity (via `requestTeamworkGraph`)
- **Vitest** — 32 unit tests covering tokenization, ranking, experts, runbook matching, drafting, and source-focusing
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
│   │   └── runbook.ts        # matchRunbook() + draftFromIncidents()
│   ├── adapters/             # Forge-facing I/O
│   │   ├── jira.ts           # Incident + resolution reads, ADF→text
│   │   ├── confluence.ts     # Runbook fetching
│   │   └── store.ts          # KVS index (incidents + runbooks)
│   ├── indexer.ts            # reindexAll(), ensureIndex(), trigger handler
│   ├── actions.ts            # The six Rovo actions (thin: fetch → core → format)
│   └── panel/                # Issue-panel frontend + resolver
├── scripts/                  # Synthetic demo-data seeding (see below)
└── test/                     # 32 Vitest tests
```

The `core/` layer is deliberately pure — no Forge imports — so the ranking and drafting logic is fast to test and reason about in isolation.

---

## Setup & installation

### Prerequisites

- Node.js 20–24 and the [Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/) (`npm install -g @forge/cli`)
- A Jira Service Management site with a **Payments Platform Ops** (or equivalent) project
- A Confluence space for runbooks

### Deploy

```bash
npm install
npm run build          # or: npx tsc -p . --noemit   (type-check only)
npx vitest run         # 32 tests should pass
forge deploy
forge install --upgrade
```

### Configure

Déjà Vu reads its project key, incident type, and field names from `src/config.ts`. Adjust these to match your JSM project, then redeploy.

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

Open any incident and ask the Déjà Vu agent (or read the issue panel):

- **"Have we seen this incident before?"** → verdict, recurrence count, and top matches with resolvers
- **"Who should I pull in for this?"** → the people who've resolved similar incidents
- **"Is there a runbook for this?"** → the matching runbook, or a missing-runbook warning
- **"Draft a runbook for PAY-34"** → a grounded draft for a recurring PayRail failure that has no runbook
- **"Draft a runbook for PAY-9"** → correctly declines — a rollback runbook already exists

---

## Tests

```bash
npx vitest run
```

32 tests cover the tokenizer and signature detection, the ranking engine, expert attribution, runbook matching, runbook drafting (asserting every fix step is a real resolution note), and the closest-cluster source focusing.

---

## Runs on Atlassian

Déjà Vu runs entirely on Forge — all compute, storage, and data access stay within the Atlassian platform. No incident data is sent to any external service, which makes it eligible for the **Runs on Atlassian** program.

---

## Limitations & roadmap

- Matching is intentionally lightweight (BM25 + signals) rather than embedding-based — transparent and dependency-free, at the cost of some recall on heavily paraphrased incidents. Embedding-backed retrieval is a natural next step.
- Runbook drafting focuses on the dominant failure cluster; in domains with heavy vocabulary overlap, a closely related incident may still appear as a supporting symptom. Drafts are always marked for human review.
- Teamwork Graph integration currently covers connectivity; richer cross-product context (linked PRs, deploys) is a roadmap item.

---

## Author

**Bhawneet Singh** — built for Atlassian Codegeist 2026.

## License

MIT (see `LICENSE`).
