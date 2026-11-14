import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  circuitAllowsRequest,
  circuitRetryAfterMs,
  circuitStateOf,
  recordCircuitFailure,
  recordCircuitSuccess,
  resetCircuitBreakersForTests,
} from "./circuitBreaker";
import {
  circuitPersistencePath,
  setCircuitPersistenceRoot,
} from "./circuitPersistence";

const MIN = 60_000;

describe("circuit breaker persistence", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "placarr-circuit-"));
    setCircuitPersistenceRoot(root);
    resetCircuitBreakersForTests();
  });

  afterEach(() => {
    setCircuitPersistenceRoot(null);
    resetCircuitBreakersForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it("writes a ledger file on failure", () => {
    const now = 1_000_000;
    recordCircuitFailure("cdn.example", now);
    const file = circuitPersistencePath("cdn.example");
    expect(file).toBeTruthy();
    const raw = JSON.parse(readFileSync(file!, "utf8")) as {
      until: string;
      openings: number;
    };
    expect(raw.openings).toBe(1);
    expect(Date.parse(raw.until)).toBe(now + 2 * MIN);
  });

  it("survives a memory reset (process restart)", () => {
    const now = 1_000_000;
    recordCircuitFailure("cdn.example", now);
    resetCircuitBreakersForTests();

    expect(circuitStateOf("cdn.example", now)).toBe("open");
    expect(circuitAllowsRequest("cdn.example", now)).toBe(false);
    expect(circuitRetryAfterMs("cdn.example", now)).toBe(2 * MIN);
  });

  it("clears the ledger on success", () => {
    const now = 1_000_000;
    recordCircuitFailure("cdn.example", now);
    recordCircuitSuccess("cdn.example");
    resetCircuitBreakersForTests();

    expect(circuitStateOf("cdn.example", now)).toBe("closed");
    expect(circuitPersistencePath("cdn.example")).toBeTruthy();
    expect(() =>
      readFileSync(circuitPersistencePath("cdn.example")!, "utf8"),
    ).toThrow();
  });

  it("keeps openings across restart so the next ban escalates", () => {
    const now = 1_000_000;
    recordCircuitFailure("cdn.example", now);
    resetCircuitBreakersForTests();
    const { until } = recordCircuitFailure("cdn.example", now + 1);
    expect(until - (now + 1)).toBe(5 * MIN);
  });
});
