import { beforeEach, describe, expect, it } from "vitest";

import {
  CIRCUIT_RESET_SCHEDULE_MS,
  circuitAllowsRequest,
  circuitCooldownMs,
  circuitRetryAfterMs,
  circuitStateOf,
  recordCircuitFailure,
  recordCircuitSuccess,
  resetCircuitBreakersForTests,
} from "./circuitBreaker";
import { setCircuitPersistenceRoot } from "./circuitPersistence";

const MIN = 60_000;

describe("circuitCooldownMs", () => {
  it("climbs the 2 → 5 → 15 → 60 min schedule, capped at the last tier", () => {
    expect(CIRCUIT_RESET_SCHEDULE_MS).toEqual([
      2 * MIN,
      5 * MIN,
      15 * MIN,
      60 * MIN,
    ]);
    expect(circuitCooldownMs(1)).toBe(2 * MIN);
    expect(circuitCooldownMs(2)).toBe(5 * MIN);
    expect(circuitCooldownMs(3)).toBe(15 * MIN);
    expect(circuitCooldownMs(4)).toBe(60 * MIN);
    expect(circuitCooldownMs(9)).toBe(60 * MIN);
  });
});

describe("circuit breaker", () => {
  beforeEach(() => {
    setCircuitPersistenceRoot(null);
    resetCircuitBreakersForTests();
  });

  it("starts closed and lets everything through", () => {
    expect(circuitStateOf("a.test")).toBe("closed");
    expect(circuitAllowsRequest("a.test")).toBe(true);
    expect(circuitRetryAfterMs("a.test")).toBe(0);
  });

  it("opens on failure and fails fast until the cooldown expires", () => {
    const now = 1_000_000;
    recordCircuitFailure("a.test", now);

    expect(circuitStateOf("a.test", now)).toBe("open");
    expect(circuitAllowsRequest("a.test", now)).toBe(false);
    expect(circuitRetryAfterMs("a.test", now)).toBe(2 * MIN);
    // Une clé voisine n'est pas affectée.
    expect(circuitAllowsRequest("b.test", now)).toBe(true);
  });

  it("half-open after the cooldown: one probe, the rest fail fast", () => {
    const now = 1_000_000;
    recordCircuitFailure("a.test", now);
    const after = now + 2 * MIN + 1;

    expect(circuitStateOf("a.test", after)).toBe("half-open");
    expect(circuitAllowsRequest("a.test", after)).toBe(true);
    // La sonde est prise : les suivants attendent son verdict.
    expect(circuitAllowsRequest("a.test", after + 1)).toBe(false);
  });

  it("a successful probe closes the circuit and forgets the openings", () => {
    const now = 1_000_000;
    recordCircuitFailure("a.test", now);
    const after = now + 2 * MIN + 1;
    circuitAllowsRequest("a.test", after);

    recordCircuitSuccess("a.test");

    expect(circuitStateOf("a.test", after)).toBe("closed");
    expect(circuitAllowsRequest("a.test", after)).toBe(true);
    // Le compteur est reparti à zéro : la prochaine ouverture retombe à 2 min.
    recordCircuitFailure("a.test", after);
    expect(circuitRetryAfterMs("a.test", after)).toBe(2 * MIN);
  });

  it("a failed probe reopens with the next reset tier", () => {
    const now = 1_000_000;
    recordCircuitFailure("a.test", now);
    const probe = now + 2 * MIN + 1;
    circuitAllowsRequest("a.test", probe);

    recordCircuitFailure("a.test", probe);

    expect(circuitStateOf("a.test", probe)).toBe("open");
    expect(circuitAllowsRequest("a.test", probe + 1)).toBe(false);
    expect(circuitRetryAfterMs("a.test", probe)).toBe(5 * MIN);
  });

  it("consecutive openings escalate 2 → 5 → 15 → 60 then stay capped", () => {
    let now = 1_000_000;
    for (const expected of [2 * MIN, 5 * MIN, 15 * MIN, 60 * MIN, 60 * MIN]) {
      const { until } = recordCircuitFailure("a.test", now);
      expect(until - now).toBe(expected);
      // La sonde expire et échoue aussitôt : ouverture consécutive suivante.
      now = until + 1;
      expect(circuitAllowsRequest("a.test", now)).toBe(true);
    }
  });
});
