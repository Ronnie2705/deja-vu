import { describe, it, expect } from 'vitest';
import { focusToCluster, type RankedIncident } from '../src/core/rank';

const m = (key: string, score: number): RankedIncident => ({
  incident: { key, summary: key },
  score,
  text: score,
  sameService: true,
  recency: 0,
});

describe('focusToCluster (draft source selection)', () => {
  it('keeps the strong cluster and drops the weak tail', () => {
    const matches = [m('E1', 0.94), m('E2', 0.63), m('E3', 0.58), m('A8', 0.30), m('B6', 0.22)];
    const keep = focusToCluster(matches, { ratio: 0.6, minKeep: 3, cap: 6 }).map((x) => x.incident.key);
    expect(keep).toEqual(['E1', 'E2', 'E3']); // 0.94*0.6 = 0.564 → A8/B6 fall away
  });

  it('never returns fewer than minKeep, even if only the top is strong', () => {
    const matches = [m('E1', 0.94), m('E2', 0.40), m('E3', 0.38), m('A8', 0.36)];
    const keep = focusToCluster(matches, { ratio: 0.6, minKeep: 3 }).map((x) => x.incident.key);
    expect(keep).toEqual(['E1', 'E2', 'E3']);
  });

  it('caps the set so a draft never pulls a long tail', () => {
    const matches = Array.from({ length: 10 }, (_, i) => m(`X${i}`, 0.9 - i * 0.01));
    expect(focusToCluster(matches, { cap: 6 }).length).toBe(6);
  });

  it('passes through when there are only a few matches', () => {
    const matches = [m('E1', 0.9), m('E2', 0.8)];
    expect(focusToCluster(matches).map((x) => x.incident.key)).toEqual(['E1', 'E2']);
  });
});
