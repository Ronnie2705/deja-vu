import { describe, it, expect } from 'vitest';
import { aggregateDashboard, type DashboardIncident } from '../src/core/dashboard';
import type { Runbook } from '../src/core/runbook';

const incidents: DashboardIncident[] = [
  { key: 'PAY-1', summary: 'payments-api 502 after release', service: 'payments-api', occurredAt: '2026-10-02T00:00:00Z', resolverName: 'Maya Chen' },
  { key: 'PAY-2', summary: 'payments-api 503 after deploy', service: 'payments-api', occurredAt: '2026-10-10T00:00:00Z', resolverName: 'Maya Chen' },
  { key: 'PAY-3', summary: 'ledger-db pool timeout exhausted connections', service: 'ledger-db', occurredAt: '2026-11-01T00:00:00Z', resolverName: 'Sam Okafor' },
  { key: 'PAY-4', summary: 'ledger-db too many connections at peak', service: 'ledger-db', occurredAt: '2026-11-03T00:00:00Z', resolverName: 'Sam Okafor' },
];

// A runbook that confidently covers the payments-api 502 release failures.
const runbooks: Runbook[] = [
  { id: 'r1', title: 'Rollback payments-api', text: 'Rollback payments-api 502 503 release deploy pipeline revert upstream timeout' },
];

describe('aggregateDashboard', () => {
  const d = aggregateDashboard(incidents, runbooks);

  it('computes coverage from real runbook matches', () => {
    expect(d.totalIncidents).toBe(4);
    expect(d.totalRunbooks).toBe(1);
    // payments-api covered, ledger-db not → 50%
    expect(d.coveredCount).toBe(2);
    expect(d.uncoveredCount).toBe(2);
    expect(d.coveragePct).toBe(50);
  });

  it('breaks coverage down by service and lists the gaps', () => {
    const ledger = d.byService.find((s) => s.service === 'ledger-db')!;
    expect(ledger.gap).toBe(2);
    expect(ledger.covered).toBe(0);
    const gap = d.gapsByService.find((g) => g.service === 'ledger-db')!;
    expect(gap.count).toBe(2);
    expect(gap.examples.length).toBeGreaterThan(0);
    // payments-api is fully covered, so it is not a gap
    expect(d.gapsByService.some((g) => g.service === 'payments-api')).toBe(false);
  });

  it('ranks responders and buckets incidents by month', () => {
    expect(d.topResponders[0]).toEqual({ name: 'Maya Chen', resolved: 2 });
    expect(d.byMonth).toEqual([
      { month: '2026-10', count: 2 },
      { month: '2026-11', count: 2 },
    ]);
  });

  it('reports zero coverage when there are no runbooks', () => {
    expect(aggregateDashboard(incidents, []).coveragePct).toBe(0);
  });
});
