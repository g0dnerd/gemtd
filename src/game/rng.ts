/**
 * Deterministic, seedable PRNG: mulberry32.
 * Used for the random-draw pool and any other reproducible randomness.
 */

export class RNG {
  private state: number;

  constructor(seed: number) {
    // Force to unsigned 32-bit
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Pick from a weighted array of [item, weight] tuples. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= w;
      if (r <= 0) return item;
    }
    return entries[entries.length - 1][0];
  }

  /** Pick uniformly from an array. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}
