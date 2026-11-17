# Privacy Policy — Déjà Vu

_Last updated: November 2026_

Déjà Vu ("the app") is an Atlassian Forge app for Jira Service Management and Confluence. This policy explains what data the app accesses, what it stores, and where.

## What the app runs on

Déjà Vu runs entirely on the **Atlassian Forge** platform, inside your own Atlassian environment. It does **not** send your data to any external or third-party service. All processing and storage happen within Atlassian-hosted infrastructure.

## What data the app accesses

With the permissions you grant at installation, the app reads:

- **Jira issues** in the configured project (incident summaries, descriptions, resolution notes, status, and the display name and Atlassian account ID of the person who resolved each incident).
- **Confluence pages** in the configured runbook space (titles and body text).
- **Teamwork Graph** data about an incident's assignee (their other assigned work items), read on demand.

## What data the app stores

To answer "have we seen this before" quickly, the app builds and caches an **index of resolved incidents** in **Forge Key-Value Store** (Atlassian-hosted storage scoped to your installation). This index includes incident text, affected service, dates, and **resolver display names and Atlassian account IDs**. The app also writes:

- **Comments** on Jira incidents (its proactive triage and runbook-opportunity notes).
- **Runbook pages** in your Confluence runbook space, when you ask it to publish a drafted runbook.

The app does not collect payment information, government identifiers, or any data beyond the Atlassian content described above.

## Where data is stored and who can see it

All stored data lives in **Forge storage within your Atlassian site**. It is not transmitted to the developer or any third party. Access is limited by your Atlassian permissions.

## Retention and deletion

The cached index persists until it is rebuilt or the app is uninstalled. **Uninstalling the app removes its Forge storage**, deleting the cached index. Comments and runbook pages the app created remain in Jira/Confluence as normal content you control, and can be deleted like any other issue comment or page.

## Contact

Questions or requests: https://github.com/Ronnie2705/deja-vu/issues

_Déjà Vu is an independent project built for the Atlassian Codegeist 2026 hackathon and is not affiliated with any employer._
