// Ranks past incidents against a new one. Pure: no Forge imports.
//
// score = w1·BM25norm + w2·[same service] + w3·e^(−λ·Δt days)
// A candidate is a match only if score ≥ threshold AND its text similarity
// reaches minText — same service and recency alone never make a match.

import { Bm25Index } from './bm25';
import { tokenizeDetailed } from './tokenize';

export interface Incident {
  key: string;
  summary: string;
  description?: string;
  service?: string;
  occurredAt?: string; // ISO date-time
  resolution?: string;
  resolver?: string;
}

export interface RankQuery {
  key?: string; // excluded from results (the incident itself)
  text: string;
  service?: string;
  at?: string; // ISO date-time of the new incident; defaults to now
}

export interface RankOptions {
  w1?: number;
  w2?: number;
  w3?: number;
  halfLifeDays?: number;
  threshold?: number;
  minText?: number;
  limit?: number;
  signatureWeight?: number;
}

export interface RankedIncident {
  incident: Incident;
  score: number;
  text: number; // normalised BM25, 0–1
  sameService: boolean;
  recency: number; // 0–1
}

export interface RankResult {
  matches: RankedIncident[];
  noStrongMatch: boolean;
}

export const DEFAULTS: Required<RankOptions> = {
  w1: 0.6,
  w2: 0.3,
  w3: 0.1,
  halfLifeDays: 90,
  threshold: 0.35,
  minText: 0.2,
  limit: 5,
  signatureWeight: 2,
};

const DAY_MS = 86_400_000;

export function incidentText(i: Incident): string {
  return [i.summary, i.description ?? ''].join(' ');
}

export function rankIncidents(query: RankQuery, candidates: Incident[], options: RankOptions = {}): RankResult {
  const o = { ...DEFAULTS, ...options };
  const pool = candidates.filter((c) => c.key !== query.key);
  if (pool.length === 0) return { matches: [], noStrongMatch: true };

  const index = new Bm25Index(pool.map((c) => ({ id: c.key, terms: tokenizeDetailed(incidentText(c)).map((t) => t.term) })));

  const q = new Map<string, number>();
  for (const t of tokenizeDetailed(query.text)) {
    const w = t.signature ? o.signatureWeight : 1;
    q.set(t.term, Math.max(q.get(t.term) ?? 0, w));
  }

  const raw = pool.map((c) => ({ c, bm: index.score(q, c.key) }));
  const top = Math.max(...raw.map((r) => r.bm));
  const now = query.at ? Date.parse(query.at) : Date.now();
  const lambda = Math.LN2 / o.halfLifeDays;

  const scored: RankedIncident[] = raw.map(({ c, bm }) => {
    const text = top > 0 ? bm / top : 0;
    const sameService = !!query.service && !!c.service && query.service === c.service;
    const ageDays = c.occurredAt ? Math.max(0, (now - Date.parse(c.occurredAt)) / DAY_MS) : Infinity;
    const recency = Number.isFinite(ageDays) ? Math.exp(-lambda * ageDays) : 0;
    const score = o.w1 * text + o.w2 * (sameService ? 1 : 0) + o.w3 * recency;
    return { incident: c, score, text, sameService, recency };
  });

  const matches = scored
    .filter((s) => s.score >= o.threshold && s.text >= o.minText)
    .sort((a, b) => b.score - a.score)
    .slice(0, o.limit);

  return { matches, noStrongMatch: matches.length === 0 };
}
