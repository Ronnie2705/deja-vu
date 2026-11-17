// Renders Déjà Vu's incident memory as a Jira comment (ADF). Pure: no Forge imports.

export const TRIAGE_MARKER = 'Déjà Vu — incident memory';

export interface TriageSummary {
  seenBefore: number;
  mostRecentKey?: string;
  mostRecentDate?: string;
  topExpert?: { name: string; resolved: number };
  runbook?: { title: string; url?: string | null } | null;
  runbookMissing?: boolean;
  topMatches: { key: string }[];
}

type AdfNode = { type: string; text?: string; marks?: unknown[]; attrs?: unknown; content?: AdfNode[] };
const text = (t: string, marks?: unknown[]): AdfNode => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const para = (...content: AdfNode[]): AdfNode => ({ type: 'paragraph', content });

/** Builds an ADF document summarising what Déjà Vu remembers about a new incident. */
export function buildTriageAdf(s: TriageSummary): object {
  const body: AdfNode[] = [];
  body.push(para(text('🔎 '), text(TRIAGE_MARKER, [{ type: 'strong' }])));

  const recent = s.mostRecentKey ? `; most recent ${s.mostRecentKey}${s.mostRecentDate ? ` on ${s.mostRecentDate}` : ''}` : '';
  body.push(para(text(`Seen ${s.seenBefore}× before${recent}.`)));

  if (s.topExpert) {
    body.push(para(text(`${s.topExpert.name} resolved ${s.topExpert.resolved} of them — a good person to pull in.`)));
  }

  if (s.runbook) {
    const link = s.runbook.url
      ? text(s.runbook.title, [{ type: 'link', attrs: { href: s.runbook.url } }])
      : text(s.runbook.title);
    body.push(para(text('Runbook: '), link));
  } else if (s.runbookMissing) {
    body.push(para(text('⚠ No runbook exists for this recurring failure — consider drafting one.', [{ type: 'strong' }])));
  }

  if (s.topMatches.length) {
    body.push(para(text(`Closest past incidents: ${s.topMatches.map((m) => m.key).join(', ')}.`)));
  }

  body.push(para(text('— posted automatically by Déjà Vu. Ask the Déjà Vu agent for details or a runbook draft.', [{ type: 'em' }])));
  return { version: 1, type: 'doc', content: body };
}

export const OPPORTUNITY_MARKER = 'Déjà Vu — runbook opportunity';

export interface RunbookOpportunity {
  service?: string;
  signatures: string[];
  symptoms: string[];
  fixSteps: string[];
  basedOn: string[];
}

/**
 * Builds the comment Déjà Vu posts when a just-resolved incident reveals a
 * recurring failure that still has no runbook — a ready-to-publish draft, so the
 * knowledge base closes its own gaps as incidents resolve.
 */
export function buildRunbookOpportunityAdf(d: RunbookOpportunity, seenBefore: number): object {
  const body: AdfNode[] = [];
  body.push(para(text('✍ '), text(OPPORTUNITY_MARKER, [{ type: 'strong' }])));
  body.push(
    para(
      text(
        `This failure just resolved and has now recurred ${seenBefore}× with no runbook. Here's a draft from how these were actually fixed — reply to the Déjà Vu agent with "publish it" to add it to Confluence.`,
      ),
    ),
  );
  if (d.service) body.push(para(text('Service: '), text(d.service, [{ type: 'strong' }])));
  if (d.signatures.length) body.push(para(text(`Signatures: ${d.signatures.join(', ')}`)));
  if (d.symptoms.length) {
    body.push(para(text('Symptoms:', [{ type: 'strong' }])));
    body.push({ type: 'bulletList', content: d.symptoms.map((s) => ({ type: 'listItem', content: [para(text(s))] })) });
  }
  if (d.fixSteps.length) {
    body.push(para(text('Fix (from past resolutions):', [{ type: 'strong' }])));
    body.push({ type: 'orderedList', content: d.fixSteps.map((s) => ({ type: 'listItem', content: [para(text(s))] })) });
  }
  body.push(para(text(`— drafted automatically by Déjà Vu from ${d.basedOn.join(', ')}. Review before publishing.`, [{ type: 'em' }])));
  return { version: 1, type: 'doc', content: body };
}
