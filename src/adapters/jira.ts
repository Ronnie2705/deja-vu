// Thin wrapper around the Jira REST API. All Jira calls go through here.
import api, { route } from '@forge/api';
import { INCIDENT_START_FIELD_NAME, INCIDENT_TYPE, PROJECT_KEY, RESOLUTION_PREFIX } from '../config';

export type As = 'app' | 'user';
const client = (as: As) => (as === 'user' ? api.asUser() : api.asApp());

export interface JiraIncident {
  key: string;
  summary: string;
  description: string;
  service?: string;
  occurredAt?: string;
  resolvedAt?: string;
  resolverAccountId?: string;
  resolverName?: string;
  resolved: boolean;
  projectKey: string;
  issueType: string;
}

/** Plain text from an Atlassian Document Format value (or a plain string). */
export function adfToText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text') return n.text ?? '';
  const inner = (n.content ?? []).map(adfToText).join(n.type === 'doc' ? '\n' : '');
  return n.type === 'paragraph' ? inner + '\n' : inner;
}

let incidentStartFieldId: string | null | undefined;

async function getIncidentStartFieldId(): Promise<string | null> {
  if (incidentStartFieldId !== undefined) return incidentStartFieldId;
  const res = await api.asApp().requestJira(route`/rest/api/3/field`, { headers: { Accept: 'application/json' } });
  const fields = (await res.json()) as { id: string; name: string }[];
  incidentStartFieldId = fields.find((f) => f.name === INCIDENT_START_FIELD_NAME)?.id ?? null;
  return incidentStartFieldId;
}

async function fieldList(): Promise<string[]> {
  const start = await getIncidentStartFieldId();
  return ['summary', 'description', 'components', 'assignee', 'resolutiondate', 'statusCategory', 'status', 'project', 'issuetype', 'created', ...(start ? [start] : [])];
}

function toIncident(issue: any, startField: string | null): JiraIncident {
  const f = issue.fields ?? {};
  return {
    key: issue.key,
    summary: f.summary ?? '',
    description: adfToText(f.description).trim(),
    service: f.components?.[0]?.name,
    occurredAt: (startField && f[startField]) || f.created,
    resolvedAt: f.resolutiondate ?? undefined,
    resolverAccountId: f.assignee?.accountId,
    resolverName: f.assignee?.displayName,
    resolved: f.status?.statusCategory?.key === 'done' || !!f.resolutiondate,
    projectKey: f.project?.key ?? '',
    issueType: f.issuetype?.name ?? '',
  };
}

export async function getIncident(key: string, as: As = 'app'): Promise<JiraIncident | null> {
  const fields = await fieldList();
  const res = await client(as).requestJira(route`/rest/api/3/issue/${key}?fields=${fields.join(',')}`, { headers: { Accept: 'application/json' } });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Jira get ${key} failed: ${res.status} ${await res.text()}`);
  return toIncident(await res.json(), await getIncidentStartFieldId());
}

/** All resolved incidents in the project, newest first (paged). */
export async function searchResolvedIncidents(max = 1000): Promise<JiraIncident[]> {
  const fields = await fieldList();
  const startField = await getIncidentStartFieldId();
  const jql = `project = ${PROJECT_KEY} AND issuetype = "${INCIDENT_TYPE}" AND statusCategory = Done ORDER BY created DESC`;
  const out: JiraIncident[] = [];
  let nextPageToken: string | undefined;
  do {
    const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql, fields, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) }),
    });
    if (!res.ok) throw new Error(`Jira search failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as { issues: any[]; nextPageToken?: string; isLast?: boolean };
    for (const issue of page.issues ?? []) out.push(toIncident(issue, startField));
    nextPageToken = page.isLast === false ? page.nextPageToken : undefined;
  } while (nextPageToken && out.length < max);
  return out;
}

/** The resolution note: the newest comment starting with "Resolution:". */
export async function getResolutionNote(key: string): Promise<string | undefined> {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment?orderBy=-created&maxResults=50`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { comments?: { body: unknown }[] };
  for (const c of data.comments ?? []) {
    const text = adfToText(c.body).trim();
    if (text.startsWith(RESOLUTION_PREFIX)) return text.slice(RESOLUTION_PREFIX.length).trim();
  }
  return undefined;
}

export function isTrackedIncident(i: JiraIncident): boolean {
  return i.projectKey === PROJECT_KEY && i.issueType === INCIDENT_TYPE;
}

/** Adds a comment (ADF document) to an issue. Returns whether it succeeded. */
export async function addComment(key: string, body: object): Promise<boolean> {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) console.warn(`Déjà Vu: addComment ${key} failed ${res.status} ${await res.text()}`);
  return res.ok;
}

/** True if any comment on the issue contains the given marker text — used to avoid double-posting. */
export async function commentExists(key: string, marker: string): Promise<boolean> {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment?maxResults=50`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { comments?: { body: unknown }[] };
  return (data.comments ?? []).some((c) => adfToText(c.body).includes(marker));
}
