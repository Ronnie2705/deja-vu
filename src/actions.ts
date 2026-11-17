// Rovo actions. Keep these thin: fetch, call core/, format.
import { getIncident } from './adapters/jira';
import { ensureIndex, reindexAll } from './indexer';
import { rankIncidents, focusToCluster, type RankQuery } from './core/rank';
import { whoFixedIt } from './core/experts';
import { matchRunbook, draftFromIncidents, runbookStorageBody, type RunbookDoc } from './core/runbook';
import { createRunbookPage } from './adapters/confluence';
import { RECURRING_THRESHOLD } from './config';
import type { IncidentIndex, IndexedIncident } from './adapters/store';

interface ActionPayload {
  issueKey?: string;
  symptoms?: string;
  limit?: number | string;
  title?: string;
  context?: { jira?: { issueKey?: string } };
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : 'unknown date');

/** Turns an action payload into a ranking query, or an error message for the agent. */
async function buildQuery(payload: ActionPayload): Promise<{ query: RankQuery; label: string } | { error: string }> {
  const issueKey = (payload.issueKey || payload.context?.jira?.issueKey || '').trim().toUpperCase() || undefined;
  let text = (payload.symptoms ?? '').trim();
  let service: string | undefined;
  let at: string | undefined;

  if (issueKey) {
    // Read the query incident as the user, so they only see what they're allowed to.
    const incident = await getIncident(issueKey, 'user');
    if (!incident) return { error: `I couldn't open ${issueKey}. Check the key and your access.` };
    text = `${incident.summary} ${incident.description} ${text}`.trim();
    service = incident.service;
    at = incident.occurredAt;
  }
  if (!text) return { error: 'Give me an incident key (like PAY-45) or describe the symptoms.' };
  return { query: { key: issueKey, text, service, at }, label: issueKey ?? text };
}

/** All matches above the threshold (for counts and experts), plus the top `limit` to show. */
async function search(query: RankQuery, limit: number) {
  const index = await ensureIndex();
  const ranked = rankIncidents(query, index.incidents, { limit: 50 });
  return { index, all: ranked.matches, top: ranked.matches.slice(0, limit) };
}

/** Runbook status for a query, but only once runbooks have actually been indexed. */
function runbookStatus(index: IncidentIndex, queryText: string, seenBefore: number) {
  if (!index.runbooks || index.runbooks.length === 0) return undefined;
  const { best, confident } = matchRunbook(queryText, index.runbooks);
  if (confident && best) return { found: true as const, title: best.runbook.title, url: best.runbook.url ?? null };
  if (seenBefore >= RECURRING_THRESHOLD) {
    return { found: false as const, missing: true as const, note: `No runbook for a failure seen ${seenBefore} times — worth writing one.` };
  }
  return { found: false as const, missing: false as const };
}

export async function findSimilar(payload: ActionPayload) {
  const q = await buildQuery(payload);
  if ('error' in q) return q;
  const limit = Math.min(Math.max(Number(payload.limit) || 5, 1), 10);
  const { index, all, top } = await search(q.query, limit);

  if (all.length === 0) {
    return {
      query: q.label,
      noStrongMatch: true,
      message: `No strong match among ${index.incidents.length} resolved incidents. This looks new: use standard triage.`,
    };
  }

  const last = [...all].sort((a, b) => (b.incident.occurredAt ?? '').localeCompare(a.incident.occurredAt ?? ''))[0];
  return {
    query: q.label,
    service: q.query.service ?? null,
    seenBefore: all.length,
    mostRecent: { key: last.incident.key, happened: day(last.incident.occurredAt) },
    runbook: runbookStatus(index, q.query.text, all.length) ?? null,
    whoFixedIt: whoFixedIt(all).map((e) => ({ name: e.name, resolved: e.resolved, lastKey: e.lastKey })),
    matches: top.map((m) => {
      const i = m.incident as IndexedIncident;
      return {
        key: i.key,
        summary: i.summary,
        service: i.service ?? null,
        happened: day(i.occurredAt),
        resolvedBy: i.resolverName ?? null,
        resolution: i.resolution ?? null,
        score: Number(m.score.toFixed(2)),
        textSimilarity: Number(m.text.toFixed(2)),
        sameService: m.sameService,
      };
    }),
  };
}

export async function whoFixed(payload: ActionPayload) {
  const q = await buildQuery(payload);
  if ('error' in q) return q;
  const { all } = await search(q.query, 50);
  if (all.length === 0) {
    return { query: q.label, noStrongMatch: true, message: 'No similar past incidents, so nobody has fixed this before.' };
  }
  return {
    query: q.label,
    basedOn: all.length,
    experts: whoFixedIt(all).map((e) => ({
      name: e.name,
      resolvedSimilar: e.resolved,
      mostRecent: e.lastKey,
      mostRecentDate: day(e.lastDate),
    })),
  };
}

export async function findRunbook(payload: ActionPayload) {
  const q = await buildQuery(payload);
  if ('error' in q) return q;
  const { index, all } = await search(q.query, 50);
  if (!index.runbooks || index.runbooks.length === 0) {
    return { query: q.label, message: 'No runbooks are indexed yet. Add runbooks in Confluence and rebuild the index.' };
  }
  const { best, confident } = matchRunbook(q.query.text, index.runbooks);
  if (confident && best) {
    return { query: q.label, found: true, title: best.runbook.title, url: best.runbook.url ?? null };
  }
  return {
    query: q.label,
    found: false,
    seenBefore: all.length,
    missing: all.length >= RECURRING_THRESHOLD,
    message:
      all.length >= RECURRING_THRESHOLD
        ? `No runbook for this, and it has happened ${all.length} times. Consider writing one.`
        : 'No matching runbook found.',
  };
}

/** Guard + grounded draft shared by suggest-runbook and publish-runbook, so both agree. */
type DraftOutcome =
  | { error: string }
  | { status: 'noMatch'; label: string }
  | { status: 'exists'; label: string; title: string; url: string | null }
  | { status: 'tooFew'; label: string; seen: number }
  | { status: 'ok'; label: string; seenBefore: number; doc: RunbookDoc };

async function prepareDraft(payload: ActionPayload): Promise<DraftOutcome> {
  const q = await buildQuery(payload);
  if ('error' in q) return { error: q.error };
  const { index, all } = await search(q.query, 50);

  if (all.length === 0) return { status: 'noMatch', label: q.label };
  // Don't draft one if a good runbook already exists.
  if (index.runbooks && index.runbooks.length > 0) {
    const { best, confident } = matchRunbook(q.query.text, index.runbooks);
    if (confident && best) return { status: 'exists', label: q.label, title: best.runbook.title, url: best.runbook.url ?? null };
  }
  if (all.length < RECURRING_THRESHOLD) return { status: 'tooFew', label: q.label, seen: all.length };

  // Draft from the one failure mode this query is really about, not every weak
  // match — otherwise a PayRail runbook bleeds in release 502s and ledger timeouts.
  const focused = focusToCluster(all);
  const incidents = focused.map((m) => m.incident as IndexedIncident);
  const draft = draftFromIncidents(incidents);
  const service = draft.service ?? q.query.service ?? undefined;
  const sig = draft.signatures[0];
  const title = (payload.title && payload.title.trim()) || `Déjà Vu draft: ${service ?? 'incident'}${sig ? ` ${sig}` : ' failures'}`;
  return {
    status: 'ok',
    label: q.label,
    seenBefore: all.length,
    doc: {
      title,
      service,
      symptoms: draft.symptoms,
      signatures: draft.signatures,
      fixSteps: draft.fixSteps,
      owner: whoFixedIt(focused)[0]?.name ?? null,
      basedOn: incidents.map((i) => i.key),
    },
  };
}

export async function suggestRunbook(payload: ActionPayload) {
  const r = await prepareDraft(payload);
  if ('error' in r) return r;
  if (r.status === 'noMatch') return { query: r.label, message: 'No similar past incidents, so there is nothing to base a runbook on.' };
  if (r.status === 'exists') return { query: r.label, runbookExists: true, title: r.title, url: r.url };
  if (r.status === 'tooFew') {
    return { query: r.label, enoughHistory: false, seenBefore: r.seen, message: `Only seen ${r.seen} time(s) — not enough of a pattern to justify a runbook yet.` };
  }
  return {
    query: r.label,
    draftRunbook: true,
    suggestedTitle: r.doc.title,
    seenBefore: r.seenBefore, // honest recurrence count across all similar incidents
    basedOnCount: r.doc.basedOn.length, // how many the draft actually used
    service: r.doc.service ?? null,
    signatures: r.doc.signatures,
    symptoms: r.doc.symptoms,
    resolutionsSeen: r.doc.fixSteps, // grounded fix steps — the agent must use only these
    suggestedOwner: r.doc.owner ?? null,
    basedOn: r.doc.basedOn,
  };
}

export async function publishRunbook(payload: ActionPayload) {
  const r = await prepareDraft(payload);
  if ('error' in r) return r;
  if (r.status === 'noMatch') return { query: r.label, published: false, message: "No similar incidents to base a runbook on, so there's nothing to publish." };
  if (r.status === 'exists') return { query: r.label, published: false, runbookExists: true, title: r.title, url: r.url };
  if (r.status === 'tooFew') {
    return { query: r.label, published: false, enoughHistory: false, seenBefore: r.seen, message: `Only seen ${r.seen} time(s) — not enough of a pattern to publish a runbook yet.` };
  }

  const result = await createRunbookPage(r.doc.title, runbookStorageBody(r.doc));
  if (!result.ok) return { query: r.label, published: false, message: `Couldn't create the page: ${result.reason}` };
  return {
    query: r.label,
    published: true,
    title: r.doc.title,
    url: result.url ?? null,
    basedOn: r.doc.basedOn,
    message: `Published "${r.doc.title}" to Confluence, grounded in ${r.doc.basedOn.join(', ')}. Rebuild the index to make it searchable.`,
  };
}

export async function reindex() {
  const index = await reindexAll();
  return {
    message: `Indexed ${index.incidents.length} resolved incidents and ${index.runbooks.length} runbooks.`,
    builtAt: index.builtAt,
  };
}
