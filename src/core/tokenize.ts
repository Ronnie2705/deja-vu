// Turns incident text into comparable tokens. Pure: no Forge imports.

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'is', 'it',
  'its', 'of', 'on', 'or', 'the', 'to', 'was', 'were', 'with', 'after', 'before', 'during',
  'right', 'about', 'into', 'than', 'then', 'this', 'that', 'some', 'all', 'not', 'no',
]);

export interface Token {
  term: string;
  /** Error signatures (status codes, error constants) count double in ranking. */
  signature: boolean;
}

/** Lightweight normalisation so "timeouts" matches "timeout" and "502s" matches "502". */
function normalise(term: string): string {
  if (/^\d{3}s$/.test(term)) return term.slice(0, 3);
  if (term.length > 4 && term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1);
  return term;
}

/** True for things that look like an error signature in the original text. */
function isSignature(raw: string): boolean {
  if (/^[1-5]\d{2}s?$/.test(raw)) return true; // HTTP status codes
  if (/^[A-Z][A-Z_]{4,}$/.test(raw)) return true; // ETIMEDOUT, NXDOMAIN, FATAL
  if (/^x509$/i.test(raw)) return true;
  return false;
}

export function tokenizeDetailed(text: string): Token[] {
  const raws = text.split(/[^A-Za-z0-9_.-]+/).map((r) => r.replace(/^[.-]+|[.-]+$/g, ''));
  const out: Token[] = [];
  for (const raw of raws) {
    if (raw.length < 2) continue;
    const term = normalise(raw.toLowerCase());
    if (STOPWORDS.has(term)) continue;
    out.push({ term, signature: isSignature(raw) });
  }
  return out;
}

export function tokenize(text: string): string[] {
  return tokenizeDetailed(text).map((t) => t.term);
}
