# Déjà Vu — Design

## Architecture

```
            ┌──────────────── Forge app "deja-vu" (Runs on Atlassian) ────────────────┐
 Rovo Chat ─┤ rovo:agent  "Déjà Vu"                                                   │
 Rovo Studio┤ rovo:mcp    exposes the same actions as MCP tools                       │
 Jira issue ┤ jira:issuePanel (UI Kit) ──resolver──┐                                  │
            │                                      ▼                                  │
            │   actions / resolvers ──► core/ (pure TS: ranking, clustering, format)  │
            │          │        │                                                     │
            │          │        └──► Forge KVS: incident index (fingerprints)         │
            │          ├──► Jira / JSM REST  (requestJira)                            │
            │          └──► Teamwork Graph API (requestTeamworkGraph, Cypher)         │
            │                 → PRs, deployments, Confluence pages linked to incidents│
 Jira event ┤ trigger avi:jira:created:issue / updated:issue → reindex one incident   │
            └─────────────────────────────────────────────────────────────────────────┘
```

**Why Teamwork Graph for PRs, deploys and pages:** a Forge app installed in Jira can't call the
Bitbucket API directly (cross-product calls between Jira and Bitbucket aren't supported). The
graph already links Jira work items to external pull requests, deployments and Confluence pages,
so reading it through `requestTeamworkGraph` gives us all three with one integration, and it
targets the Teamwork Graph bonus.

> ⚠️ The Teamwork Graph API is EAP. Atlassian says to install apps that call it only in **test
> organizations**, which the Codegeist demo site is. De-risk in week 1 with the `echo` query.

## Modules (manifest sketch)

```yaml
modules:
  rovo:agent:
    - key: deja-vu-agent
      name: Déjà Vu
      description: Finds similar past incidents, related changes, runbooks and who fixed them.
      prompt: resource:agent-prompt;prompt.md      # keep the long prompt in a file
      conversationStarters:
        - Have we seen this incident before?
        - What changed before the last outage of this service?
        - Who should I pull in for this incident?
      actions:
        - find-similar-incidents
        - get-incident-context
        - find-runbook
        - who-fixed-it

  rovo:mcp:
    - key: deja-vu-mcp
      name: Déjà Vu incident memory
      tools:
        - find-similar-incidents
        - get-incident-context
        - find-runbook
        - who-fixed-it

  action:
    - key: find-similar-incidents
      name: Find similar incidents
      function: findSimilar
      actionVerb: GET
      description: Given an incident key or free-text symptoms, returns the most similar resolved incidents with scores and resolution notes.
      inputs:
        issueKey:   { title: Incident key, type: string, required: false, description: "Jira key like PAY-123" }
        symptoms:   { title: Symptoms,     type: string, required: false, description: "Free text if no key" }
        limit:      { title: Limit,        type: integer, required: false, description: "Max results, default 5" }
    # get-incident-context, find-runbook, who-fixed-it follow the same shape

  jira:issuePanel:
    - key: deja-vu-panel
      title: Déjà Vu
      resource: panel
      resolver: { function: panelResolver }
      render: native

  trigger:
    - key: index-on-change
      function: indexIncident
      events: [avi:jira:created:issue, avi:jira:updated:issue]

  function:
    - { key: findSimilar,   handler: actions.findSimilar }
    - { key: panelResolver, handler: panel.handler }
    - { key: indexIncident, handler: indexer.onEvent }
    # …one per action

permissions:
  scopes:
    - read:jira-work
    - read:jira-user
    - storage:app
    - read:graph:issue:jira
    - read:graph:page:confluence
    - read:graph:pull-request:external
    - read:graph:user:atlassian
    # deployments: add the scope listed on the ExternalDeployment page (verify exact name)
```

Exact property names (e.g. how `inputs` and `prompt` resources are declared) must be checked
against the Forge manifest reference when implementing. Treat this as a sketch.

## Code layout

```
src/
  core/            # pure, unit-tested, no Forge imports
    tokenize.ts    # lowercase, strip stopwords, keep error signatures (e.g. "ECONNRESET", "HTTP 502")
    bm25.ts        # BM25 over the candidate set
    rank.ts        # combined score + threshold
    cluster.ts     # group incidents into recurring clusters (for "runbook missing")
  adapters/
    jira.ts        # JQL search, get issue, comments, resolver lookup
    graph.ts       # Teamwork Graph Cypher queries
    kvs.ts         # index read/write
  actions.ts       # Rovo action / MCP tool handlers (thin)
  panel/           # UI Kit issue panel + resolver
  indexer.ts       # trigger handler + full reindex
resources/
  prompt.md        # agent prompt
test/              # unit tests for core/
```

Keep `core/` free of Forge imports so ranking can be tested locally with `npm test`.

## Data model (Forge KVS)

Key `incident:<issueKey>` →

```json
{
  "key": "PAY-17",
  "summary": "payments-api 502s after release 2.11",
  "service": "payments-api",
  "tokens": ["payments-api", "502", "release", "upstream", "timeout"],
  "occurredAt": "2026-07-03T14:20:00Z",
  "resolvedAt": "2026-07-03T15:05:00Z",
  "resolverAccountId": "5f…",
  "resolutionNote": "Rolled back to 2.10 via pipeline; root cause PR #31",
  "status": "Resolved"
}
```

Plus `meta:index` → `{ count, builtAt }`. Small and flat: the panel loads candidates from KVS
instead of running JQL every time.

**`occurredAt`:** Jira doesn't let you set the created date through the REST API, so seeded
incidents would all look like they happened today. Store the real time in a date field
(e.g. a custom field "Incident start") and read that for recency.

## Ranking

For a query incident $q$ and candidate $i$:

$$
\text{score}(i) = w_1 \cdot \widehat{\text{BM25}}(q, i) + w_2 \cdot \mathbb{1}[\text{service}_q = \text{service}_i] + w_3 \cdot e^{-\lambda \, \Delta t_i}
$$

- $\widehat{\text{BM25}}$ = BM25 normalized to 0–1 by the top score in the candidate set.
- Defaults: $w_1 = 0.6$, $w_2 = 0.3$, $w_3 = 0.1$, $\lambda = \ln 2 / 90$ days (half-life 90 days).
- Show a result only if `score ≥ 0.35` (tune with seed data). Below that → "no strong match".
- Error signatures (status codes, exception names, error codes) get double token weight.

This matches the formula in the Devpost "About" text. If you change the ranking, update both.

## Teamwork Graph queries (Cypher)

Linked PRs for an incident (relationship confirmed in docs):

```cypher
MATCH (item:JiraWorkItem {ari: $id})-[:jira_work_item_links_external_pull_request]->(pr:ExternalPullRequest)
RETURN pr
```

Deployments and Confluence pages: use the equivalent `JiraWorkItem` → `ExternalDeployment` /
`ConfluencePage` relationships from the Teamwork Graph API reference. Confirm the exact
relationship names in the API playground before coding.

Call pattern:

```ts
const res = await api.asUser().requestTeamworkGraph(query, variables);
```

Using `asUser()` keeps results inside the current user's permissions (R1.5).

## Agent prompt (resources/prompt.md) — key rules

- Always call `find-similar-incidents` first; then `get-incident-context`, `find-runbook`, `who-fixed-it` as needed.
- Ground every claim in tool output; cite incident keys, runbook titles, PR/deploy names.
- If tools return nothing, say "I haven't seen this before" and suggest standard triage.
- Next steps: at most 3, concrete, each with its source.
- Never invent people, links or incidents.

## Issue panel (UI Kit)

- Header: "Seen 4 times before · last on Jul 3 · resolved by Maya in ~45 min"
- List: top 3 similar incidents (key, summary, score bar, resolution note)
- "Recent change" badge if a deploy to the same service happened in the window
- Runbook link, or a "Runbook missing" warning
- "Ask Déjà Vu" button → opens Rovo chat with the agent

## Testing

- Unit tests for `core/` (tokenize, BM25, rank threshold, recency decay, clustering).
- A small fixture set (10 incidents) with expected top results.
- Manual end-to-end on the demo site with the seed data (see seed-data-plan.md).
