// Matches a runbook to an incident by content overlap. Pure: no Forge imports.
import { tokenizeDetailed } from './tokenize';

export interface DraftSource {
  summary: string;
  description?: string;
  service?: string;
  resolution?: string;
}

export interface RunbookDraft {
  service?: string;
  signatures: string[]; // error signatures seen across the incidents
  symptoms: string[]; // a few representative incident summaries
  fixSteps: string[]; // the distinct resolution notes
}

const mostCommon = (xs: (string | undefined)[]): string | undefined => {
  const counts = new Map<string, number>();
  for (const x of xs) if (x) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: string | undefined;
  let bestN = 0;
  for (const [x, n] of counts) if (n > bestN) ((best = x), (bestN = n));
  return best;
};

/** Pulls grounded runbook material out of a set of resolved incidents. Invents nothing. */
export function draftFromIncidents(incidents: DraftSource[]): RunbookDraft {
  const service = mostCommon(incidents.map((i) => i.service));

  // Error signatures that show up in more than one incident.
  const sigCounts = new Map<string, number>();
  for (const i of incidents) {
    const seen = new Set(
      tokenizeDetailed(`${i.summary} ${i.description ?? ''}`)
        .filter((t) => t.signature)
        .map((t) => t.term),
    );
    for (const s of seen) sigCounts.set(s, (sigCounts.get(s) ?? 0) + 1);
  }
  const signatures = [...sigCounts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s]) => s.toUpperCase());

  const symptoms = incidents.slice(0, 4).map((i) => i.summary);

  // Distinct resolution notes, in original wording.
  const fixSteps: string[] = [];
  for (const i of incidents) {
    const r = i.resolution?.trim();
    if (r && !fixSteps.some((f) => f.toLowerCase() === r.toLowerCase())) fixSteps.push(r);
  }

  return { service, signatures, symptoms, fixSteps };
}

export interface Runbook {
  id: string;
  title: string;
  url?: string;
  /** Title + body text, used for matching. */
  text: string;
}

export interface RunbookMatch {
  runbook: Runbook;
  score: number;
}

export interface RunbookResult {
  best?: RunbookMatch;
  confident: boolean;
}

/**
 * Minimum weighted overlap (shared distinctive terms; error signatures count double)
 * for a runbook to be considered a real match rather than an incidental word overlap.
 */
export const CONFIDENT_SCORE = 3;

export function matchRunbook(queryText: string, runbooks: Runbook[], opts: { confident?: number } = {}): RunbookResult {
  const threshold = opts.confident ?? CONFIDENT_SCORE;
  if (runbooks.length === 0) return { confident: false };

  const q = new Map<string, number>();
  for (const t of tokenizeDetailed(queryText)) q.set(t.term, Math.max(q.get(t.term) ?? 0, t.signature ? 2 : 1));

  const scored = runbooks
    .map((runbook) => {
      const terms = new Set(tokenizeDetailed(runbook.text).map((t) => t.term));
      let score = 0;
      for (const [term, w] of q) if (terms.has(term)) score += w;
      return { runbook, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  return { best, confident: best.score >= threshold };
}
