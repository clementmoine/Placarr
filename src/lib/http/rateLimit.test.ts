import { beforeEach, describe, expect, it } from "vitest";

import {
  clientIpFrom,
  consumeRateLimit,
  resetRateLimitsForTests,
} from "./rateLimit";

const WINDOW = { limit: 3, windowMs: 60_000 };

describe("consumeRateLimit", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it("allows up to the limit, then refuses", () => {
    const now = 1_000;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(
        consumeRateLimit("a", { ...WINDOW, now }).allowed,
        `#${attempt}`,
      ).toBe(true);
    }

    const refused = consumeRateLimit("a", { ...WINDOW, now });
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(60);
  });

  it("counts each key separately", () => {
    const now = 1_000;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      consumeRateLimit("a", { ...WINDOW, now });
    }

    expect(consumeRateLimit("a", { ...WINDOW, now }).allowed).toBe(false);
    expect(consumeRateLimit("b", { ...WINDOW, now }).allowed).toBe(true);
  });

  it("reopens once the window has passed", () => {
    const now = 1_000;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      consumeRateLimit("a", { ...WINDOW, now });
    }
    expect(consumeRateLimit("a", { ...WINDOW, now }).allowed).toBe(false);

    expect(
      consumeRateLimit("a", { ...WINDOW, now: now + 60_001 }).allowed,
    ).toBe(true);
  });

  it("shrinks the retry hint as the window drains", () => {
    const now = 1_000;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      consumeRateLimit("a", { ...WINDOW, now });
    }

    const late = consumeRateLimit("a", { ...WINDOW, now: now + 45_000 });
    expect(late.allowed).toBe(false);
    expect(late.retryAfterSeconds).toBe(15);
  });
});

describe("clientIpFrom", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
    expect(clientIpFrom(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
