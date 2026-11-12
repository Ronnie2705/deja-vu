# Déjà Vu — Tasks

Submit by **Sun Dec 20** (hard deadline Tue Dec 22, 12:00 PM PT / 1:00 PM MT).
Each task is small enough for one evening. ⚠️ = de-risk early.

## Week 1 · Nov 11–16 — Foundation
- [ ] 1.1 Switch local Node to 24 (matches the `nodejs24.x` runtime)
- [ ] 1.2 Push `C:\dev\deja-vu` to a private GitHub repo; add these spec files under `docs/spec/`
- [ ] 1.3 Create JSM project **PAY** (IT Service Management template), components, "Incident start" field
- [ ] 1.4 ⚠️ Teamwork Graph smoke test: add `read:graph:issue:jira`, call the `echo` query, log the result
- [ ] 1.5 Invite the 4 plus-address teammates and activate them
- [ ] 1.6 Convert the app to TypeScript, set up `npm test` (Vitest or Jest), create `src/core/`

## Week 2 · Nov 17–23 — Matching engine
- [ ] 2.1 Attend the Build Session (Tue Nov 17, 10:00 AM MT) with the app open
- [ ] 2.2 `core/tokenize` + `core/bm25` + `core/rank` with unit tests (fixture of 10 incidents)
- [ ] 2.3 Write `scripts/incidents.json` (40 incidents, clusters A–E + noise)
- [ ] 2.4 `scripts/seed.ts` → seed PAY; check incidents look right in Jira
- [ ] 2.5 `indexer.ts`: full reindex into KVS + trigger on create/update
- [ ] 2.6 Action `find-similar-incidents`; replace the hello-world action in the agent

**Checkpoint:** in Rovo chat, "Have we seen PAY-NEW before?" returns cluster A incidents.

## Week 3 · Nov 24–30 — Context (Thanksgiving week, lighter)
- [ ] 3.1 Bitbucket workspace + repo, connect to Jira, create PRs and pipeline deploys for cluster A
- [ ] 3.2 ⚠️ Confirm PR/deploy links show on Jira issues and in a Teamwork Graph query
- [ ] 3.3 Action `get-incident-context` (PRs + deploys via graph, "recent change" flag)
- [ ] 3.4 Write the 4 Confluence runbooks; action `find-runbook` (+ "runbook missing" via `core/cluster`)
- [ ] 3.5 Action `who-fixed-it`

## Week 4 · Dec 1–7 — Surfaces
- [ ] 4.1 Agent prompt in `resources/prompt.md` (grounding + citation rules); test 10 questions
- [ ] 4.2 Issue panel (UI Kit): header, top 3 matches, recent-change badge, runbook link
- [ ] 4.3 `rovo:mcp` module exposing the 4 actions; test from a Rovo Studio custom agent
- [ ] 4.4 Optional: connect an external MCP client (needs admin toggle in Atlassian Administration)

**Checkpoint:** full demo story works end to end on the site.

## Week 5 · Dec 8–14 — Polish and stretch
- [ ] 5.1 Error states, empty states, loading states in the panel
- [ ] 5.2 Tune ranking weights and threshold against the seed data
- [ ] 5.3 Stretch: `skill.md` describing when to use the tools (pairs with the MCP bonus)
- [ ] 5.4 Stretch: internal comment on new incidents ("Déjà Vu found 3 similar incidents")
- [ ] 5.5 Create the **distribution / installation link** for judges; test it on a second site if possible
- [ ] 5.6 Decide on Marketplace (free listing only); skip if time is short

## Week 6 · Dec 15–20 — Ship
- [ ] 6.1 README: setup, permissions, architecture diagram, how to seed demo data
- [ ] 6.2 Screenshots (3:2) for the Devpost gallery + thumbnail
- [ ] 6.3 Record the video (< 5 min): problem → live incident → panel → agent → MCP → architecture
- [ ] 6.4 Finish the Devpost "About" (fill the TODOs), Built-with tags, links, bonus prize details
- [ ] 6.5 Make the repo public (or share with the addresses Devpost lists), submit by **Dec 20**

## Cut list (if behind)
1. Week 5 stretch items
2. External MCP client (keep the Rovo Studio test)
3. Deployments (keep PRs only)
4. Clustering / "runbook missing" (keep the runbook link)
