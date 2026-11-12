// BM25 over a small in-memory corpus. Pure: no Forge imports.

export interface Bm25Doc {
  id: string;
  terms: string[];
}

export interface Bm25Options {
  k1?: number;
  b?: number;
}

export class Bm25Index {
  private readonly k1: number;
  private readonly b: number;
  private readonly docs = new Map<string, Map<string, number>>(); // id → term → count
  private readonly lengths = new Map<string, number>();
  private readonly df = new Map<string, number>();
  private avgdl = 0;

  constructor(docs: Bm25Doc[], opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.2;
    this.b = opts.b ?? 0.75;
    let total = 0;
    for (const d of docs) {
      const tf = new Map<string, number>();
      for (const t of d.terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.docs.set(d.id, tf);
      this.lengths.set(d.id, d.terms.length);
      total += d.terms.length;
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgdl = docs.length ? total / docs.length : 0;
  }

  get size(): number {
    return this.docs.size;
  }

  idf(term: string): number {
    const n = this.docs.size;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /**
   * Score one document against weighted query terms.
   * `query` maps term → weight (e.g. 2 for error signatures).
   */
  score(query: Map<string, number>, id: string): number {
    const tf = this.docs.get(id);
    if (!tf || this.avgdl === 0) return 0;
    const dl = this.lengths.get(id) ?? 0;
    let s = 0;
    for (const [term, weight] of query) {
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      const denom = f + this.k1 * (1 - this.b + (this.b * dl) / this.avgdl);
      s += weight * this.idf(term) * ((f * (this.k1 + 1)) / denom);
    }
    return s;
  }
}
