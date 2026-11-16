import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rankIncidents, type Incident } from '../src/core/rank';
import { draftFromIncidents, type DraftSource } from '../src/core/runbook';

const seed = JSON.parse(readFileSync(new URL('../scripts/incidents.json', import.meta.url), 'utf8'));
const incidents: (Incident & DraftSource)[] = seed.incidents.map((i: any) => ({
  key: i.seedId,
  summary: i.summary,
  description: i.description,
  service: i.component,
  occurredAt: i.incidentStart,
  resolution: i.resolution,
}));
const AT = '2026-11-15T16:00:00Z';

describe('draftFromIncidents on the PayRail cluster (the missing-runbook demo)', () => {
  const payRail = rankIncidents(
    { text: 'card payments failing, PayRail timeout, ETIMEDOUT on authorize', service: 'payments-api', at: AT },
    incidents,
    { limit: 50 },
  ).matches.map((m) => m.incident as DraftSource);

  it('finds enough history to draft from', () => {
    expect(payRail.length).toBeGreaterThanOrEqual(3);
  });

  it('extracts the service, real fix steps, and error signatures — inventing nothing', () => {
    const draft = draftFromIncidents(payRail);
    expect(draft.service).toBeTruthy();
    expect(draft.fixSteps.length).toBeGreaterThan(0);
    // Every fix step is a real resolution note from the source incidents.
    const realResolutions = new Set(payRail.map((i) => i.resolution?.trim().toLowerCase()));
    for (const step of draft.fixSteps) expect(realResolutions.has(step.toLowerCase())).toBe(true);
    // PayRail incidents mention ETIMEDOUT — a signature should surface.
    expect(draft.signatures).toContain('ETIMEDOUT');
    expect(draft.symptoms.length).toBeGreaterThan(0);
  });

  it('deduplicates identical resolution notes', () => {
    const dupes: DraftSource[] = [
      { summary: 'a', resolution: 'Enabled failover' },
      { summary: 'b', resolution: 'enabled failover' },
      { summary: 'c', resolution: 'Rolled back' },
    ];
    expect(draftFromIncidents(dupes).fixSteps).toEqual(['Enabled failover', 'Rolled back']);
  });
});
