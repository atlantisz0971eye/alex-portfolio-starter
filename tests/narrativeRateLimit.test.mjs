import assert from "node:assert/strict";
import test from "node:test";
import { NarrativeRateLimiter } from "../app/lib/narrativeRateLimit.ts";

test("limits new generations per visitor and resets the minute window", () => {
  const limiter = new NarrativeRateLimiter();
  for (let i = 0; i < 6; i += 1) assert.deepEqual(limiter.check("visitor-a", 1), { allowed: true });
  assert.deepEqual(limiter.check("visitor-a", 1), { allowed: false, retryAfterSeconds: 60 });
  assert.deepEqual(limiter.check("visitor-b", 1), { allowed: true });
  assert.deepEqual(limiter.check("visitor-a", 60_001), { allowed: true });
});

test("limits daily generations per visitor and per instance", () => {
  const limiter = new NarrativeRateLimiter();
  for (let i = 0; i < 30; i += 1) {
    assert.deepEqual(limiter.check("visitor-a", 1 + i * 60_000), { allowed: true });
  }
  assert.equal(limiter.check("visitor-a", 1 + 30 * 60_000).allowed, false);
  assert.deepEqual(limiter.check("visitor-a", 86_400_001), { allowed: true });

  const sharedLimiter = new NarrativeRateLimiter();
  for (let i = 0; i < 24; i += 1) {
    assert.deepEqual(sharedLimiter.check(`visitor-${i}`, 1), { allowed: true });
  }
  assert.equal(sharedLimiter.check("next-visitor", 1).allowed, false);
  assert.deepEqual(sharedLimiter.check("next-visitor", 60_001), { allowed: true });

  const dailyLimiter = new NarrativeRateLimiter();
  for (let i = 0; i < 120; i += 1) {
    assert.deepEqual(dailyLimiter.check(`visitor-${i}`, 1 + i * 60_000), { allowed: true });
  }
  assert.equal(dailyLimiter.check("next-visitor", 1 + 120 * 60_000).allowed, false);
  assert.deepEqual(dailyLimiter.check("next-visitor", 86_400_001), { allowed: true });
});

test("fails closed for new visitors when its client tracking capacity is exhausted", () => {
  const limiter = new NarrativeRateLimiter({
    perClientMinute: 6,
    perClientDay: 30,
    perInstanceMinute: 24,
    perInstanceDay: 120,
    maxTrackedClients: 1,
  });
  assert.deepEqual(limiter.check("visitor-a", 1), { allowed: true });
  assert.equal(limiter.check("visitor-b", 2).allowed, false);
  assert.deepEqual(limiter.check("visitor-b", 86_400_001), { allowed: true });
});
