import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rankIncidents, type Incident } from '../src/core/rank';
import { whoFixedIt } from '../src/core/experts';

const seed = JSON.parse(readFileSync(new URL('../scripts/incidents.json', import.meta.url), 'utf8'));
const incidents: Incident[] = seed.incidents.map((i: any) => ({
  key: i.seedId,
  summary: i.summary,
  description: i.description,
  service: i.component,
  occurredAt: i.incidentStart,
  resolver: seed.people[i.resolver].name,
}));
const AT = '2026-11-12T16:00:00Z';
const all = { limit: 50 };

describe('whoFixedIt on the seed data', () => {
  it('bad release on payments-api → Maya first', () => {
    const r = rankIncidents({ text: 'payments-api 502s after deploying release 2.14', service: 'payments-api', at: AT }, incidents, all);
    const experts = whoFixedIt(r.matches);
    expect(experts[0].name).toBe('Maya Chen');
    expect(experts[0].resolved).toBeGreaterThan(experts[1]?.resolved ?? 0);
  });

  it('expired certificate → only Lena', () => {
    const r = rankIncidents({ text: 'SSL handshake failed, certificate has expired', service: 'auth-gateway', at: AT }, incidents, all);
    expect(whoFixedIt(r.matches).map((e) => e.name)).toEqual(['Lena Ortiz']);
  });

  it('DB connections → Arjun first', () => {
    const r = rankIncidents({ text: 'ledger-db too many connections, pool timeout', service: 'ledger-db', at: AT }, incidents, all);
    expect(whoFixedIt(r.matches)[0].name).toBe('Arjun Rao');
  });

  it('returns nothing when there are no matches', () => {
    expect(whoFixedIt([])).toEqual([]);
  });
});

describe('whoFixedIt rules', () => {
  const m = (key: string, resolver: string, occurredAt: string) => ({
    incident: { key, summary: '', resolver, occurredAt },
    score: 1, text: 1, sameService: true, recency: 1,
  });

  it('breaks ties by most recent incident and caps at the limit', () => {
    const experts = whoFixedIt(
      [m('1', 'Old', '2026-01-01'), m('2', 'New', '2026-10-01'), m('3', 'Third', '2026-05-01'), m('4', 'Fourth', '2026-03-01')],
      3,
    );
    expect(experts.map((e) => e.name)).toEqual(['New', 'Third', 'Fourth']);
  });

  it('records each person\'s latest incident', () => {
    const [e] = whoFixedIt([m('A', 'Maya', '2026-01-01'), m('B', 'Maya', '2026-09-01')]);
    expect(e).toMatchObject({ resolved: 2, lastKey: 'B' });
  });
});
