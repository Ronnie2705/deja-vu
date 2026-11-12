import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rankIncidents, type Incident } from '../src/core/rank';

// The real seed data. Keys are seed IDs, so the first letter is the cluster (A–E, N = noise).
const seed = JSON.parse(readFileSync(new URL('../scripts/incidents.json', import.meta.url), 'utf8'));
const incidents: Incident[] = seed.incidents.map((i: any) => ({
  key: i.seedId,
  summary: i.summary,
  description: i.description,
  service: i.component,
  occurredAt: i.incidentStart,
  resolution: i.resolution,
  resolver: i.resolver,
}));

const AT = '2026-11-12T16:00:00Z';
const clusters = (r: ReturnType<typeof rankIncidents>) => r.matches.map((m) => m.incident.key[0]);

describe('rankIncidents on the seed data', () => {
  it('demo incident: payments-api 502s after release → bad-release cluster (A) dominates', () => {
    const r = rankIncidents(
      { text: 'payments-api returning 502s for card payments after deploying release 2.14', service: 'payments-api', at: AT },
      incidents,
    );
    expect(r.noStrongMatch).toBe(false);
    expect(clusters(r)[0]).toBe('A');
    expect(clusters(r).filter((c) => c === 'A').length).toBeGreaterThanOrEqual(4);
    expect(clusters(r)).not.toContain('N');
  });

  it('PayRail timeouts → PayRail cluster (E) first', () => {
    const r = rankIncidents(
      { text: 'Card payments failing, PayRail ETIMEDOUT on authorize', service: 'payments-api', at: AT },
      incidents,
    );
    expect(clusters(r)[0]).toBe('E');
  });

  it('expired certificate → certificate cluster (C) only', () => {
    const r = rankIncidents(
      { text: 'Users cannot log in: SSL handshake failed, certificate has expired', service: 'auth-gateway', at: AT },
      incidents,
    );
    expect(clusters(r)[0]).toBe('C');
    expect(new Set(clusters(r))).toEqual(new Set(['C']));
  });

  it('DB connection exhaustion → ledger-db cluster (B) first', () => {
    const r = rankIncidents(
      { text: 'ledger writes failing: too many connections, pool timeout', service: 'ledger-db', at: AT },
      incidents,
    );
    expect(clusters(r)[0]).toBe('B');
  });

  it('unrelated incident → explicit "no strong match"', () => {
    const r = rankIncidents({ text: 'Office coffee machine is broken again', service: 'checkout-web', at: AT }, incidents);
    expect(r.noStrongMatch).toBe(true);
    expect(r.matches).toEqual([]);
  });

  it('same service alone is never enough to be a match', () => {
    const r = rankIncidents({ text: 'quarterly roadmap planning', service: 'payments-api', at: AT }, incidents);
    expect(r.noStrongMatch).toBe(true);
  });

  it('excludes the incident itself', () => {
    const r = rankIncidents({ key: 'A8', text: incidents.find((i) => i.key === 'A8')!.summary, service: 'payments-api', at: AT }, incidents);
    expect(r.matches.map((m) => m.incident.key)).not.toContain('A8');
  });
});

describe('rankIncidents scoring rules', () => {
  const base = { summary: 'ledger-db too many connections', service: 'ledger-db' };

  it('newer incident outranks an otherwise identical older one', () => {
    const r = rankIncidents({ text: 'too many connections on ledger-db', service: 'ledger-db', at: AT }, [
      { ...base, key: 'OLD', occurredAt: '2026-01-01T00:00:00Z' },
      { ...base, key: 'NEW', occurredAt: '2026-11-01T00:00:00Z' },
    ]);
    expect(r.matches[0].incident.key).toBe('NEW');
  });

  it('same-service incident outranks an identical one on another service', () => {
    const r = rankIncidents({ text: 'too many connections', service: 'ledger-db', at: AT }, [
      { ...base, key: 'OTHER', service: 'payments-api', occurredAt: '2026-11-01T00:00:00Z' },
      { ...base, key: 'SAME', occurredAt: '2026-11-01T00:00:00Z' },
    ]);
    expect(r.matches[0].incident.key).toBe('SAME');
  });

  it('scores stay between 0 and 1', () => {
    const r = rankIncidents({ text: 'payments-api 502', service: 'payments-api', at: AT }, incidents, { limit: 50, threshold: 0, minText: 0 });
    for (const m of r.matches) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(1);
    }
  });
});
