// The server's rate limits, in memory, so a restart resets them (a named limit in auth/index.ts).
// Two kinds, because they answer different questions:
// - SlidingWindowLimit: at most `max` hits per key in a window, keyed by client address. Sign-in,
//   register, joins and public seats use it (auth/index.ts, server.ts).
// - TokenBucket: up to `capacity` actions at once, then one more every `refillEveryMs`. Arena chat
//   uses it per sender and per arena (chat.ts). A sliding window cannot say "5 at once, then 1
//   every 3 s": 5 per 15 s lets the burst through and then makes the sixth line wait up to 15 s.
//
// The refill is a time per token, not tokens per second: 1/3 token per second is not exact in
// floating point, so 3 seconds would add 0.9999999999999999 tokens and the promised wait would
// fail by a hair. 3000 ms per token is exact.

import type { Clock } from "./timers.ts";

export type LimitCheck = { readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number };

export class SlidingWindowLimit {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  /** Whether one more hit for `key` fits in the window. It records nothing. */
  check(key: string): LimitCheck {
    const recent = this.recent(key);
    if (recent.length < this.max) return { ok: true };
    // The window frees a slot when the oldest hit in it leaves.
    const oldest = recent[recent.length - this.max] ?? this.now();
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000)) };
  }

  /** Records a hit and returns its time, so the caller can release that hit. */
  record(key: string): number {
    const at = this.now();
    this.hits.set(key, [...this.recent(key), at]);
    return at;
  }

  /** Removes one hit recorded at `at`, for a hit that turned out not to count (a login that succeeded). */
  release(key: string, at: number): void {
    const list = this.hits.get(key);
    if (list === undefined) return;
    const index = list.lastIndexOf(at);
    if (index !== -1) list.splice(index, 1);
    if (list.length === 0) this.hits.delete(key);
  }

  /** Drops keys without a hit in the window, so many one-time keys do not fill memory. */
  sweep(): void {
    for (const key of [...this.hits.keys()]) {
      const recent = this.recent(key);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    return (this.hits.get(key) ?? []).filter((at) => at > since);
  }
}

export type BucketAnswer = { readonly allowed: true } | { readonly allowed: false; readonly waitMs: number };

export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillEveryMs: number,
    private readonly now: Clock,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || !(refillEveryMs > 0)) {
      throw new Error("A token bucket needs a whole capacity of at least 1 and a refill time above 0.");
    }
    this.tokens = capacity;
    this.updatedAt = now();
  }

  /** Whether one action may happen now, without spending a token. With two buckets, check both before taking from either. */
  check(): BucketAnswer {
    this.refill();
    if (this.tokens >= 1) return { allowed: true };
    return { allowed: false, waitMs: Math.ceil((1 - this.tokens) * this.refillEveryMs) };
  }

  /** Spends one token. Throws when none is there, because the caller must check first. */
  take(): void {
    this.refill();
    if (this.tokens < 1) throw new Error("take() without a token: call check() first.");
    this.tokens -= 1;
  }

  private refill(): void {
    const now = this.now();
    // A clock that steps back must not add tokens or lose them.
    const elapsedMs = Math.max(0, now - this.updatedAt);
    this.tokens = Math.min(this.capacity, this.tokens + elapsedMs / this.refillEveryMs);
    this.updatedAt = now;
  }
}
