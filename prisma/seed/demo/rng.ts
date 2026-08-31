/**
 * A deterministic pseudo-random generator for the demo seed.
 *
 * Determinism is the whole point. `Math.random()` would make every seed run
 * produce a different demo environment, so a screenshot, a bug report and a
 * reconciliation run would each be talking about different data. With a fixed
 * seed the seventieth application is the same application on every machine,
 * and "the plot area on BP/2026/000042 is wrong" is a reproducible statement.
 *
 * mulberry32 — 32-bit, one multiply and three shifts per draw. Not
 * cryptographic, and it does not need to be: nothing here protects anything.
 */
export function makeRng(seed: number) {
  let state = seed >>> 0;

  /** The next float in [0, 1). */
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** An integer in [min, max], both inclusive. */
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  /** A float in [min, max], rounded to `decimals`. */
  const float = (min: number, max: number, decimals = 2): number => {
    const value = min + next() * (max - min);
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  };

  /** One element of a non-empty list. */
  const pick = <T>(items: readonly T[]): T => {
    if (!items.length) throw new Error('rng.pick called with an empty list');
    return items[Math.floor(next() * items.length)]!;
  };

  /** `count` distinct elements, in list order rather than draw order. */
  const sample = <T>(items: readonly T[], count: number): T[] => {
    const pool = [...items];
    const taken: T[] = [];
    const want = Math.min(count, pool.length);
    for (let i = 0; i < want; i += 1) taken.push(pool.splice(Math.floor(next() * pool.length), 1)[0]!);
    return taken;
  };

  /** True with probability `p`. */
  const chance = (p: number): boolean => next() < p;

  return { next, int, float, pick, sample, chance };
}

export type Rng = ReturnType<typeof makeRng>;
