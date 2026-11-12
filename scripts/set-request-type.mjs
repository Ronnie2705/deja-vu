// Backfills a JSM request type onto the seeded incidents so they appear in the
// Incidents queues. Reads keys from scripts/.seed-state.json.
//
// Usage (from the project root):
//   node --env-file=.env scripts/set-request-type.mjs --list        # show available request types
//   node --env-file=.env scripts/set-request-type.mjs --limit 1     # update one incident, check it in Jira
//   node --env-file=.env scripts/set-request-type.mjs               # update the rest
//
// Optional: --type "Report a system problem"   (the default)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(here, '.seed-state.json');
const PROJECT = 'PAY';

const args = process.argv.slice(2);
const LIST = args.includes('--list');
const typeIdx = args.indexOf('--type');
const TYPE_NAME = typeIdx >= 0 ? args[typeIdx + 1] : 'Report a system problem';
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const { JIRA_BASE, JIRA_EMAIL, JIRA_TOKEN } = process.env;
if (!JIRA_BASE || !JIRA_EMAIL || !JIRA_TOKEN) {
  console.error('Missing JIRA_BASE, JIRA_EMAIL or JIRA_TOKEN. Run with --env-file=.env');
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
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  // 1. Find the PAY service desk and its request types.
  const desks = await jira('GET', '/rest/servicedeskapi/servicedesk?limit=100');
  const desk = desks.values.find((d) => d.projectKey === PROJECT);
  if (!desk) throw new Error(`No service desk for project ${PROJECT}`);
  const types = await jira('GET', `/rest/servicedeskapi/servicedesk/${desk.id}/requesttype?limit=100`);

  if (LIST) {
    console.log(`Request types in ${PROJECT}:`);
    for (const t of types.values) console.log(`  ${t.id}  ${t.name}`);
    return;
  }

  const type = types.values.find((t) => t.name.toLowerCase() === TYPE_NAME.toLowerCase());
  if (!type) throw new Error(`Request type "${TYPE_NAME}" not found. Run with --list to see the options.`);
  console.log(`Request type: ${type.name} (id ${type.id})`);

  // 2. Find the "Request Type" custom field.
  const fields = await jira('GET', '/rest/api/3/field');
  const rtField = fields.find((f) => f.schema?.custom === 'com.atlassian.servicedesk:vp-origin');
  if (!rtField) throw new Error('Could not find the Request Type field');
  console.log(`Request Type field: ${rtField.id}`);

  // 3. Update each seeded incident.
  const state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  const keys = Object.values(state).map((s) => s.key).slice(0, LIMIT);
  for (const key of keys) {
    await jira('PUT', `/rest/api/3/issue/${key}`, { fields: { [rtField.id]: String(type.id) } });
    console.log(`   ✓ ${key}`);
    await sleep(200);
  }
  console.log(`Done: ${keys.length} incident(s) updated.`);
}

main().catch((e) => {
  console.error('\n✗ ' + e.message);
  process.exit(1);
});
