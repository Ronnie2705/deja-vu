import { describe, it, expect } from 'vitest';
import { buildTriageAdf, TRIAGE_MARKER, buildRunbookOpportunityAdf, OPPORTUNITY_MARKER, type TriageSummary } from '../src/core/triageComment';

// Flatten all text nodes in an ADF doc for easy assertions.
function allText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(allText).join(' ');
}
function links(node: any): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  const walk = (n: any) => {
    if (n?.type === 'text') {
      const link = (n.marks ?? []).find((m: any) => m.type === 'link');
      if (link) out.push({ text: n.text, href: link.attrs.href });
    }
    (n?.content ?? []).forEach(walk);
  };
  walk(node);
  return out;
}

const base: TriageSummary = {
  seenBefore: 8,
  mostRecentKey: 'PAY-9',
  mostRecentDate: '2026-10-27',
  topExpert: { name: 'Maya Chen', resolved: 6 },
  runbook: { title: 'Rollback payments-api', url: 'https://x/wiki/pages/1' },
  runbookMissing: false,
  topMatches: [{ key: 'PAY-9' }, { key: 'PAY-2' }, { key: 'PAY-5' }],
};

describe('buildTriageAdf', () => {
  it('produces a valid ADF doc with the memory summary', () => {
    const doc = buildTriageAdf(base) as any;
    expect(doc.type).toBe('doc');
    expect(doc.version).toBe(1);
    const t = allText(doc);
    expect(t).toContain(TRIAGE_MARKER);
    expect(t).toContain('Seen 8× before');
    expect(t).toContain('most recent PAY-9 on 2026-10-27');
    expect(t).toContain('Maya Chen resolved 6');
    expect(t).toContain('PAY-9, PAY-2, PAY-5');
  });

  it('links the runbook when a url is present', () => {
    const ls = links(buildTriageAdf(base));
    expect(ls).toContainEqual({ text: 'Rollback payments-api', href: 'https://x/wiki/pages/1' });
  });

  it('warns when a recurring failure has no runbook', () => {
    const doc = buildTriageAdf({ ...base, runbook: null, runbookMissing: true });
    expect(allText(doc)).toContain('No runbook exists for this recurring failure');
    expect(links(doc)).toHaveLength(0);
  });

  it('omits the expert and runbook lines when there is no data for them', () => {
    const doc = buildTriageAdf({ seenBefore: 1, mostRecentKey: 'PAY-3', topMatches: [{ key: 'PAY-3' }] });
    const t = allText(doc);
    expect(t).toContain('Seen 1× before');
    expect(t).not.toContain('resolved');
    expect(t).not.toContain('Runbook:');
  });
});

describe('buildRunbookOpportunityAdf', () => {
  const draft = {
    service: 'ledger-db',
    signatures: ['POOL_TIMEOUT'],
    symptoms: ['ledger-db pool exhausted at peak', 'too many connections'],
    fixSteps: ['Raised the connection pool ceiling and added backpressure.'],
    basedOn: ['PAY-14', 'PAY-18', 'PAY-22'],
  };

  it('frames the recurrence and carries the grounded draft', () => {
    const t = allText(buildRunbookOpportunityAdf(draft, 7));
    expect(t).toContain(OPPORTUNITY_MARKER);
    expect(t).toContain('recurred 7× with no runbook');
    expect(t).toContain('ledger-db');
    expect(t).toContain('ledger-db pool exhausted at peak');
    expect(t).toContain('Raised the connection pool ceiling');
    expect(t).toContain('PAY-14, PAY-18, PAY-22');
  });

  it('produces a valid ADF doc with bullet and ordered lists', () => {
    const doc = buildRunbookOpportunityAdf(draft, 5) as any;
    expect(doc.type).toBe('doc');
    const types = doc.content.map((n: any) => n.type);
    expect(types).toContain('bulletList');
    expect(types).toContain('orderedList');
  });
});
