# Déjà Vu — Seed Data Plan

The demo only works if the site has a believable history. Everything below is fictional:
company **"Northwind Pay"**, payment provider **"PayRail"**. No real company or work data.

## 1. Jira Service Management project

- Template: **IT Service Management**
- Name: **Payments Platform Ops** · Key: **PAY**
- Components (= services): `payments-api`, `checkout-web`, `ledger-db`, `auth-gateway`,
  `notifications-worker`
- Custom date field: **Incident start** (used for recency, since created dates can't be backdated)

## 2. People (so "who fixed it" means something)

The demo site has only you. Invite 4 teammates using Gmail plus-addresses — each is a separate
Atlassian account but lands in your inbox:

| Name | Email | Specialty in the story |
|---|---|---|
| Maya Chen | `yourname+maya@gmail.com` | payments-api, deploys |
| Arjun Rao | `yourname+arjun@gmail.com` | databases |
| Lena Ortiz | `yourname+lena@gmail.com` | auth, certificates |
| Sam Okafor | `yourname+sam@gmail.com` | messaging, Kafka |

Accept each invite once so the account becomes active and assignable.

## 3. Incident clusters (~40 resolved + noise)

Spread **Incident start** dates over the last ~8 months. Vary wording so matching isn't trivial.

| # | Cluster | Service | Count | Typical signature | Resolution pattern | Resolver | Runbook |
|---|---|---|---|---|---|---|---|
| A | Bad release → 5xx | payments-api | 8 | `HTTP 502`, `upstream timeout`, "after release 2.x" | Roll back release; root cause in a PR | Maya (6), Sam (2) | ✅ "Rollback payments-api" |
| B | Connection pool exhausted | ledger-db | 8 | `too many connections`, `pool timeout`, latency spike | Kill long queries, raise pool size | Arjun (7), Maya (1) | ✅ "Ledger DB connection exhaustion" |
| C | Expired TLS certificate | auth-gateway | 6 | `certificate has expired`, `SSL handshake failed` | Rotate cert, restart gateway | Lena (6) | ✅ "Rotate auth-gateway certificates" |
| D | Consumer lag | notifications-worker | 7 | `consumer lag`, "emails delayed", `rebalance` | Scale consumers, clear stuck partition | Sam (5), Arjun (2) | ✅ "Notifications backlog" |
| E | PayRail provider timeouts | payments-api / checkout-web | 6 | `PayRail timeout`, `ETIMEDOUT`, "card payments failing" | Enable failover provider | Maya (3), Lena (3) | ❌ **missing on purpose** |
| — | Noise | mixed | 8 | one-offs (typo on checkout page, DNS blip, quota alert…) | various | mixed | — |

Each incident gets:
- **Summary** and **description** with symptoms + an error snippet
- **Component**, **priority**, **Incident start**
- An **internal comment** with the resolution note (e.g. "Rolled back to 2.9.3. Cause: PR #27 changed retry config.")
- Assignee = resolver, then transition to **Resolved**

Cluster **E** has no runbook so the "Runbook missing" warning shows up in the demo.

## 4. Confluence runbooks

Space: **Payments Ops Runbooks**. Four short pages (one per runbook ✅ above), each with
Symptoms, Diagnosis, Fix steps, Rollback, Owner. Mention the service name and error signatures
so matching works.

## 5. Bitbucket: PRs and deploys

- Free Bitbucket Cloud workspace → repo `payments-api`
- Connect it to Jira (**Spaces sidebar → Connect repositories**)
- For each cluster A incident, create a branch and PR whose title includes the key,
  e.g. `PAY-17 Revert retry config from 2.11` → Jira links it automatically
- Add a simple `bitbucket-pipelines.yml` with a `deployment: production` step so deploys appear
  in Jira's deployment info, with commit messages referencing PAY keys
- Verify links appear on the Jira issue's Development panel, then confirm with a Teamwork Graph
  query (see design.md)

PR dates will be "now" — that's fine; the story relies on links, not PR timestamps.

## 6. The demo incident (created live in the video)

> **PAY-NEW:** "payments-api returning 502s for card payments after deploying release 2.14"
> Component: payments-api · Priority: Highest

Expected Déjà Vu result:
- **Seen 8 times before** (cluster A), top match ~0.8
- **Recent change:** deploy of release 2.14 to production 20 min earlier
- **Runbook:** "Rollback payments-api"
- **Who fixed it:** Maya (6 times)
- **Next steps:** (1) roll back to 2.13 per runbook, (2) page Maya, (3) check the 2.14 PR for retry/timeout config changes

Second demo moment (shorter): an incident matching cluster **E** → "Seen 6 times — **no runbook
exists**" to show the gap-finding value.

## 7. Seed script

`scripts/seed.ts`, run locally (not part of the Forge app):
- Reads incidents from `scripts/incidents.json` (write the 40 incidents as data, easy to tweak)
- Uses Jira REST with your email + API token (keep both in a local `.env`, never commit it)
- Creates issues, sets fields, adds the internal comment, assigns, transitions to Resolved
- Idempotent: skips incidents whose `seedId` label already exists
- Then run the app's **reindex** action
