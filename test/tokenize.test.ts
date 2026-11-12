import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/core/tokenize';

describe('tokenize', () => {
  it('keeps service names and status codes', () => {
    expect(tokenize('HTTP 502 from payments-api')).toEqual([
      'http', '502', 'from', 'payments-api',
    ]);
  });
});
