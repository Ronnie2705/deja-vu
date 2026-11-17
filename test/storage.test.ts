import { describe, it, expect } from 'vitest';
import { runbookStorageBody, type RunbookDoc } from '../src/core/runbook';

const base: RunbookDoc = {
  title: 'Déjà Vu draft: payments-api ETIMEDOUT',
  service: 'payments-api',
  symptoms: ['Card payments failing: PayRail timeout', 'PayRail timeouts causing declined payments'],
  signatures: ['ETIMEDOUT'],
  fixSteps: ['Enabled failover to the backup provider until PayRail recovered.'],
  owner: 'Maya Chen',
  basedOn: ['PAY-31', 'PAY-36'],
};

describe('runbookStorageBody', () => {
  it('renders grounded sections with the source incidents stamped on top', () => {
    const html = runbookStorageBody(base);
    expect(html).toContain('Auto-drafted by');
    expect(html).toContain('PAY-31, PAY-36');
    expect(html).toContain('<h2>Service</h2><p>payments-api</p>');
    expect(html).toContain('<h2>Error signatures</h2><p>ETIMEDOUT</p>');
    expect(html).toContain('<li>Card payments failing: PayRail timeout</li>');
    expect(html).toContain('<ol><li>Enabled failover to the backup provider until PayRail recovered.</li></ol>');
    expect(html).toContain('<h2>Suggested owner</h2><p>Maya Chen</p>');
  });

  it('escapes HTML so incident text can never inject markup', () => {
    const html = runbookStorageBody({ ...base, symptoms: ['<script>alert(1)</script> & "bad"'] });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;bad&quot;');
  });

  it('omits empty sections instead of leaving blank headings', () => {
    const html = runbookStorageBody({ title: 't', symptoms: [], signatures: [], fixSteps: [], owner: null, basedOn: [] });
    expect(html).not.toContain('<h2>Service</h2>');
    expect(html).not.toContain('<h2>Fix</h2>');
    expect(html).toContain('Auto-drafted by');
  });
});
