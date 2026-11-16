// "Who fixed it last time" — aggregates resolvers across similar incidents. Pure: no Forge imports.
import type { RankedIncident } from './rank';

export interface Expert {
  name: string;
  accountId?: string;
  /** How many of the similar incidents this person resolved. */
  resolved: number;
  /** Their most recent similar incident. */
  lastKey: string;
  lastDate?: string;
}

/**
 * Up to `limit` people who resolved the most similar incidents.
 * Ties break on who handled one most recently.
 */
export function whoFixedIt(matches: RankedIncident[], limit = 3): Expert[] {
  const byPerson = new Map<string, Expert>();
  for (const m of matches) {
    const i = m.incident as RankedIncident['incident'] & { resolverAccountId?: string; resolverName?: string };
    const name = i.resolverName ?? i.resolver;
    if (!name) continue;
    const id = i.resolverAccountId ?? name;
    const e = byPerson.get(id) ?? { name, accountId: i.resolverAccountId, resolved: 0, lastKey: i.key, lastDate: i.occurredAt };
    e.resolved += 1;
    if ((i.occurredAt ?? '') > (e.lastDate ?? '')) {
      e.lastKey = i.key;
      e.lastDate = i.occurredAt;
    }
    byPerson.set(id, e);
  }
  return [...byPerson.values()]
    .sort((a, b) => b.resolved - a.resolved || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
    .slice(0, limit);
}
