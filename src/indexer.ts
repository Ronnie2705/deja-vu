// Builds and maintains the incident index (task 2.5).
import { addComment, commentExists, getIncident, getResolutionNote, isTrackedIncident, searchResolvedIncidents, type JiraIncident } from './adapters/jira';
import { fetchRunbooks } from './adapters/confluence';
import { loadIndex, saveIndex, upsert, type IncidentIndex, type IndexedIncident } from './adapters/store';
import { rankIncidents, focusToCluster } from './core/rank';
import { whoFixedIt } from './core/experts';
import { matchRunbook, draftFromIncidents } from './core/runbook';
import { buildTriageAdf, TRIAGE_MARKER, buildRunbookOpportunityAdf, OPPORTUNITY_MARKER, type TriageSummary } from './core/triageComment';
import { RECURRING_THRESHOLD } from './config';

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

/** Keeps the index consistent: a resolved incident is memory, a reopened one is removed. */
async function syncIndex(key: string, incident: JiraIncident): Promise<void> {
  await upsert(key, incident.resolved ? await toIndexed(incident) : null);
  console.log(`Déjà Vu: ${incident.resolved ? 'indexed' : 'unindexed'} ${key}`);
}

/** Forge trigger: avi:jira:updated:issue — sync the index, and on resolve, close runbook gaps. */
export async function onIssueEvent(event: { issue?: { key?: string } }): Promise<void> {
  const key = event?.issue?.key;
  if (!key) return;
  const incident = await getIncident(key);
  if (!incident || !isTrackedIncident(incident)) return;
  await syncIndex(key, incident);
  // Self-improving: a just-resolved incident may reveal a recurring gap worth drafting.
  if (incident.resolved) await nudgeRunbookGap(key, incident);
}

/**
 * When a resolved incident belongs to a failure that has recurred past the
 * threshold but still has no runbook, Déjà Vu posts a ready-to-publish draft —
 * so the knowledge base closes its own gaps as incidents resolve. Posts once.
 */
async function nudgeRunbookGap(key: string, incident: JiraIncident): Promise<void> {
  try {
    if (await commentExists(key, OPPORTUNITY_MARKER)) return; // one nudge per incident
    const index = await ensureIndex();
    const query = { key, text: `${incident.summary} ${incident.description}`.trim(), service: incident.service, at: incident.occurredAt };
    const all = rankIncidents(query, index.incidents, { limit: 50 }).matches;
    if (all.length < RECURRING_THRESHOLD) return; // not yet a recurring pattern

    // Already covered by a runbook? Then there's no gap to close.
    if (index.runbooks && index.runbooks.length > 0 && matchRunbook(query.text, index.runbooks).confident) return;

    const incidents = focusToCluster(all).map((m) => m.incident as IndexedIncident);
    const draft = draftFromIncidents(incidents);
    await addComment(
      key,
      buildRunbookOpportunityAdf(
        { service: draft.service, signatures: draft.signatures, symptoms: draft.symptoms, fixSteps: draft.fixSteps, basedOn: incidents.map((i) => i.key) },
        all.length,
      ),
    );
    console.log(`Déjà Vu: runbook-gap nudge on ${key} (seen ${all.length}×, no runbook)`);
  } catch (e) {
    console.warn(`Déjà Vu: gap nudge on ${key} failed:`, (e as Error).message);
  }
}

/** Forge trigger: avi:jira:created:issue — sync the index AND proactively triage a new incident. */
export async function onIssueCreated(event: { issue?: { key?: string } }): Promise<void> {
  const key = event?.issue?.key;
  if (!key) return;
  const incident = await getIncident(key);
  if (!incident || !isTrackedIncident(incident)) return;
  await syncIndex(key, incident);
  // A brand-new, still-open incident is the moment to surface the memory.
  if (!incident.resolved) await postTriage(key, incident);
}

/** Posts Déjà Vu's memory as a comment on a new incident, once. Best-effort. */
async function postTriage(key: string, incident: JiraIncident): Promise<void> {
  try {
    if (await commentExists(key, TRIAGE_MARKER)) return; // don't double-post on a retried trigger
    const index = await ensureIndex();
    const query = { key, text: `${incident.summary} ${incident.description}`.trim(), service: incident.service, at: incident.occurredAt };
    const all = rankIncidents(query, index.incidents, { limit: 50 }).matches;
    if (all.length === 0) return; // nothing to add — stay quiet rather than spam

    const last = [...all].sort((a, b) => (b.incident.occurredAt ?? '').localeCompare(a.incident.occurredAt ?? ''))[0];
    const experts = whoFixedIt(all);

    let runbook: TriageSummary['runbook'];
    let runbookMissing = false;
    if (index.runbooks && index.runbooks.length > 0) {
      const { best, confident } = matchRunbook(query.text, index.runbooks);
      if (confident && best) runbook = { title: best.runbook.title, url: best.runbook.url ?? null };
      else if (all.length >= RECURRING_THRESHOLD) runbookMissing = true;
    }

    const summary: TriageSummary = {
      seenBefore: all.length,
      mostRecentKey: last.incident.key,
      mostRecentDate: (last.incident.occurredAt ?? '').slice(0, 10) || undefined,
      topExpert: experts[0] ? { name: experts[0].name, resolved: experts[0].resolved } : undefined,
      runbook,
      runbookMissing,
      topMatches: all.slice(0, 3).map((m) => ({ key: m.incident.key })),
    };
    await addComment(key, buildTriageAdf(summary));
    console.log(`Déjà Vu: posted triage on ${key} (seen ${all.length}×)`);
  } catch (e) {
    console.warn(`Déjà Vu: triage on ${key} failed:`, (e as Error).message);
  }
}
