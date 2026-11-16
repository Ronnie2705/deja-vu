import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rankIncidents, incidentText, type Incident } from '../src/core/rank';
import { matchRunbook, type Runbook } from '../src/core/runbook';

const seed = JSON.parse(readFileSync(new URL('../scripts/incidents.json', import.meta.url), 'utf8'));
const incidents: Incident[] = seed.incidents.map((i: any) => ({
  key: i.seedId,
  summary: i.summary,
  description: i.description,
  service: i.component,
  occurredAt: i.incidentStart,
}));

// Mirrors the four runbook pages in docs/runbooks.md. Cluster E (PayRail) has none on purpose.
const runbooks: Runbook[] = [
  {
    id: 'rb-a',
    title: 'Rollback payments-api after a bad release',
    text: 'Rollback payments-api after a bad release. Service payments-api. Symptoms HTTP 502 or 503, upstream timeout, error rate spikes right after a release deploy. Diagnosis identify the release version and confirm the spike started at the deploy. Fix roll back to the previous release via the pipeline. Rollback trigger the pipeline rollback to the previous stable version.',
  },
  {
    id: 'rb-b',
    title: 'Ledger DB connection exhaustion',
    text: 'Ledger DB connection exhaustion. Service ledger-db. Symptoms too many connections, pool timeout, connection is not available, latency spike. Diagnosis check active connections and long-running queries. Fix kill idle-in-transaction and long queries, then raise the pool size.',
  },
  {
    id: 'rb-c',
    title: 'Rotate auth-gateway certificates',
    text: 'Rotate auth-gateway certificates. Service auth-gateway. Symptoms certificate has expired, SSL handshake failed, x509 certificate expired, certificate verify failed. Fix rotate the certificate from the vault and restart the gateway.',
  },
  {
    id: 'rb-d',
    title: 'Notifications backlog and consumer lag',
    text: 'Notifications backlog and consumer lag. Service notifications-worker. Symptoms consumer lag, notifications or emails delayed, rebalance loop. Fix scale the consumers, clear the stuck partition, move poison messages to the DLQ.',
  },
];

const incidentByCluster = (c: string) => incidents.filter((i) => i.key[0] === c);

describe('matchRunbook', () => {
  it('cluster A incidents match the payments-api rollback runbook', () => {
    for (const i of incidentByCluster('A')) {
      const r = matchRunbook(incidentText(i), runbooks);
      expect(r.confident, i.key).toBe(true);
      expect(r.best?.runbook.id, i.key).toBe('rb-a');
    }
  });

  it('cluster B → ledger runbook, C → cert runbook, D → notifications runbook', () => {
    for (const [cluster, id] of [['B', 'rb-b'], ['C', 'rb-c'], ['D', 'rb-d']] as const) {
      for (const i of incidentByCluster(cluster)) {
        const r = matchRunbook(incidentText(i), runbooks);
        expect(r.confident, i.key).toBe(true);
        expect(r.best?.runbook.id, i.key).toBe(id);
      }
    }
  });

  it('cluster E (PayRail) has no confident runbook — the gap the demo shows', () => {
    for (const i of incidentByCluster('E')) {
      expect(matchRunbook(incidentText(i), runbooks).confident, i.key).toBe(false);
    }
  });

  it('returns no match when there are no runbooks', () => {
    expect(matchRunbook('anything', []).confident).toBe(false);
  });
});

describe('runbook-missing signal end to end', () => {
  const AT = '2026-11-14T16:00:00Z';

  it('a recurring PayRail failure is seen many times but has no runbook', () => {
    const q = { text: 'Card payments failing: PayRail timeout, ETIMEDOUT on authorize', service: 'payments-api', at: AT };
    const seen = rankIncidents(q, incidents, { limit: 50 }).matches.length;
    expect(seen).toBeGreaterThanOrEqual(3);
    expect(matchRunbook(q.text, runbooks).confident).toBe(false);
  });

  it('a recurring bad-release failure is seen many times and has a runbook', () => {
    const q = { text: 'payments-api 502s after deploying release 2.14', service: 'payments-api', at: AT };
    const seen = rankIncidents(q, incidents, { limit: 50 }).matches.length;
    expect(seen).toBeGreaterThanOrEqual(3);
    expect(matchRunbook(q.text, runbooks).best?.runbook.id).toBe('rb-a');
  });
});
