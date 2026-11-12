import { describe, it, expect } from 'vitest';
import { tokenize, tokenizeDetailed } from '../src/core/tokenize';

describe('tokenize', () => {
  it('keeps service names and status codes, drops stopwords', () => {
    expect(tokenize('HTTP 502 from payments-api')).toEqual(['http', '502', 'payments-api']);
  });

  it('normalises plurals so 502s matches 502 and timeouts matches timeout', () => {
    expect(tokenize('502s and timeouts')).toEqual(['502', 'timeout']);
  });

  it('flags error signatures', () => {
    const sig = tokenizeDetailed('ETIMEDOUT calling PayRail, got 504').filter((t) => t.signature).map((t) => t.term);
    expect(sig).toEqual(['etimedout', '504']);
  });
});
