// Builds and maintains the incident index (task 2.5).
import { getIncident, getResolutionNote, isTrackedIncident, searchResolvedIncidents, type JiraIncident } from './adapters/jira';
import { fetchRunbooks } from './adapters/confluence';
import { loadIndex, saveIndex, upsert, type IncidentIndex, type IndexedIncident } from './adapters/store';

async function toIndexed(i: JiraIncident): Promise<IndexedIncident> {
  return {
    key: i.key,
    summary: i.summary,
    description: i.description,
    service: i.service,
    occurredAt: i.occurredAt,
    resolvedAt: i.resolvedAt,
    resolverAccountId: i.resolverAccountId,
    resolverName: i.resolverName,
    resolver: i.resolverName,
    resolution: await getResolutionNote(i.key),
  };
}

/** Rebuild the whole index from Jira (incidents) and Confluence (runbooks). */
export async function reindexAll(): Promise<IncidentIndex> {
  const found = await searchResolvedIncidents();
  const incidents: IndexedIncident[] = [];
  for (const i of found) incidents.push(await toIndexed(i));
  // Runbooks are best-effort: a Confluence hiccup shouldn't fail the whole reindex.
  let runbooks: IncidentIndex['runbooks'] = [];
  try {
    runbooks = await fetchRunbooks();
  } catch (e) {
    console.warn('Déjà Vu: could not fetch runbooks:', (e as Error).message);
  }
  const index = await saveIndex(incidents, runbooks);
  console.log(`Déjà Vu: indexed ${incidents.length} incidents and ${runbooks.length} runbooks`);
  return index;
}

/** Index if empty, otherwise return what's stored. */
export async function ensureIndex(): Promise<IncidentIndex> {
  const existing = await loadIndex();
  return existing && existing.incidents.length > 0 ? existing : reindexAll();
}

/** Forge trigger: avi:jira:created:issue / avi:jira:updated:issue. */
export async function onIssueEvent(event: { issue?: { key?: string } }): Promise<void> {
  const key = event?.issue?.key;
  if (!key) return;
  const incident = await getIncident(key);
  if (!incident || !isTrackedIncident(incident)) return;
  // Only resolved incidents are "memory"; reopening one removes it again.
  await upsert(key, incident.resolved ? await toIndexed(incident) : null);
  console.log(`Déjà Vu: ${incident.resolved ? 'indexed' : 'unindexed'} ${key}`);
}
