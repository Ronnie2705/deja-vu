// Déjà Vu seed script — creates the demo incidents in Jira Service Management.
//
// Usage (from the project root, Node 20.6+):
//   node --env-file=.env scripts/seed.mjs --dry-run      # show what would happen
//   node --env-file=.env scripts/seed.mjs --limit 1      # create just the first incident
//   node --env-file=.env scripts/seed.mjs                # create the rest
//
// .env (never commit it):
//   JIRA_BASE=https://one-atlas-insp.atlassian.net
//   JIRA_EMAIL=you@example.com
//   JIRA_TOKEN=your-atlassian-api-token
//
// Safe to re-run: created incidents are recorded in scripts/.seed-state.json and skipped.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(here, 'incidents.json');
const STATE_FILE = path.join(here, '.seed-state.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const { JIRA_BASE, JIRA_EMAIL, JIRA_TOKEN } = process.env;
if (!JIRA_BASE || !JIRA_EMAIL || !JIRA_TOKEN) {
  console.error('Missing JIRA_BASE, JIRA_EMAIL or JIRA_TOKEN. Create a .env file and run with --env-file=.env');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jira(method, urlPath, body) {
  const res = await fetch(JIRA_BASE.replace(/\/$/, '') + urlPath, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Atlassian Document Format: one paragraph per line of text.
const adf = (text) => ({
  type: 'doc',
  version: 1,
  content: text.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
});

// Jira's Date Time Picker wants e.g. 2026-03-04T15:12:00.000+0000
const jiraDateTime = (iso) => new Date(iso).toISOString().replace('Z', '+0000');

async function findIssueTypeId(projectKey, name) {
  const meta = await jira('GET', `/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = meta.issueTypes ?? meta.values ?? [];
  const match = types.find((t) => t.name === name) ?? types.find((t) => t.name.toLowerCase().includes('incident'));
  if (!match) throw new Error(`No issue type "${name}" in ${projectKey}. Found: ${types.map((t) => t.name).join(', ')}`);
  console.log(`Issue type: ${match.name} (id ${match.id})`);
  return match.id;
}

async function findAccountId(displayName) {
  const users = await jira('GET', `/rest/api/3/user/search?query=${encodeURIComponent(displayName)}`);
  const match = users.find((u) => u.displayName === displayName && u.accountType === 'atlassian');
  if (!match) throw new Error(`User "${displayName}" not found. Has the invite been accepted?`);
  return match.accountId;
}

// Create the issue; if Jira rejects optional fields (not on the screen), drop them and retry.
async function createIssue(fields) {
  const required = new Set(['project', 'issuetype', 'summary']);
  let current = { ...fields };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await jira('POST', '/rest/api/3/issue', { fields: current });
    } catch (e) {
      const bad = Object.keys(e.body?.errors ?? {}).filter((k) => !required.has(k) && k in current);
      if (e.status !== 400 || bad.length === 0) throw e;
      console.warn(`   ⚠ Jira rejected field(s) ${bad.join(', ')}: ${JSON.stringify(e.body.errors)}. Retrying without them.`);
      for (const k of bad) delete current[k];
    }
  }
  throw new Error('Could not create issue after removing rejected fields');
}

async function resolveIssue(key) {
  const { transitions } = await jira('GET', `/rest/api/3/issue/${key}/transitions`);
  const pick =
    transitions.find((t) => /resolve/i.test(t.name) || /resolved/i.test(t.to?.name ?? '')) ??
    transitions.find((t) => /done|close|complete/i.test(t.name) || /done|closed/i.test(t.to?.name ?? ''));
  if (!pick) {
    console.warn(`   ⚠ No resolve/done transition from current status. Available: ${transitions.map((t) => t.name).join(', ')}`);
    return false;
  }
  // Some workflows require a resolution value on the transition screen.
  for (const fields of [undefined, { resolution: { name: 'Done' } }, { resolution: { name: 'Fixed' } }]) {
    try {
      await jira('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: pick.id }, ...(fields ? { fields } : {}) });
      return true;
    } catch (e) {
      if (e.status !== 400) throw e;
    }
  }
  console.warn(`   ⚠ Transition "${pick.name}" failed for ${key}; resolve it by hand.`);
  return false;
}

async function main() {
  const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  const state = existsSync(STATE_FILE) ? JSON.parse(await readFile(STATE_FILE, 'utf8')) : {};
  const todo = data.incidents.filter((i) => !state[i.seedId]).slice(0, LIMIT);

  console.log(`${data.incidents.length} incidents in file, ${Object.keys(state).length} already seeded, ${todo.length} to create${DRY_RUN ? ' (dry run)' : ''}.`);
  if (todo.length === 0) return;

  const issueTypeId = await findIssueTypeId(data.project, data.issueType);
  const accountIds = {};
  for (const [alias, person] of Object.entries(data.people)) {
    accountIds[alias] = await findAccountId(person.name);
    console.log(`User ${person.name} → ${accountIds[alias]}`);
  }

  for (const inc of todo) {
    const fields = {
      project: { key: data.project },
      issuetype: { id: issueTypeId },
      summary: inc.summary,
      description: adf(inc.description),
      components: [{ name: inc.component }],
      priority: { name: inc.priority },
      [data.incidentStartField]: jiraDateTime(inc.incidentStart),
    };

    if (DRY_RUN) {
      console.log(`[dry run] ${inc.seedId}: ${inc.summary} → ${data.people[inc.resolver].name}`);
      continue;
    }

    console.log(`${inc.seedId}: ${inc.summary}`);
    const created = await createIssue(fields);
    const key = created.key;

    await jira('PUT', `/rest/api/3/issue/${key}/assignee`, { accountId: accountIds[inc.resolver] });

    // Internal (agent-only) comment holding the resolution note.
    await jira('POST', `/rest/api/3/issue/${key}/comment`, {
      body: adf(`Resolution: ${inc.resolution}`),
      properties: [{ key: 'sd.public.comment', value: { internal: true } }],
    });

    const resolved = await resolveIssue(key);

    state[inc.seedId] = { key, resolved };
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`   ✓ ${key}${resolved ? ' (resolved)' : ' (NOT resolved)'}`);
    await sleep(300); // stay well under rate limits
  }

  console.log('Done. Seeded incidents are listed in scripts/.seed-state.json');
}

main().catch((e) => {
  console.error('\n✗ ' + e.message);
  process.exit(1);
});
