import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearSoftbanState,
  readSoftbanState,
  recordSoftbanFailure,
  softbanAllows,
  softbanCircuitState,
  softbanRemainingMs,
  softbanStatePath,
  writeSoftbanState,
} from "./softban";

const MIN = 60_000;

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "placarr-softban-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("legacy format", () => {
  it("reads a cooldown written before the breaker (no openings field)", () => {
    const now = 1_000_000;
    writeSoftbanState(tmp, {
      until: new Date(now + 30_000),
      reason: "legacy",
      name: "faces",
    });

    expect(softbanRemainingMs(tmp, now, "faces")).toBe(30_000);
    expect(readSoftbanState(tmp, "faces")?.openings).toBeUndefined();
    expect(softbanCircuitState(tmp, "faces", now)).toBe("open");
  });
});

describe("circuit breaker persisté", () => {
  it("is closed with no ledger on disk", () => {
    expect(softbanCircuitState(tmp, "faces")).toBe("closed");
    expect(softbanAllows(tmp, "faces")).toBe(true);
  });

  it("opens on failure and fails fast until the cooldown expires", () => {
    const now = 1_000_000;
    recordSoftbanFailure(tmp, { reason: "403 en rafale", name: "faces", now });

    expect(softbanCircuitState(tmp, "faces", now)).toBe("open");
    expect(softbanAllows(tmp, "faces", now)).toBe(false);
    expect(softbanRemainingMs(tmp, now, "faces")).toBe(2 * MIN);
  });

  it("escalates the reset 2 → 5 → 15 → 60 min on consecutive openings", () => {
    let now = 1_000_000;
    for (const expected of [2 * MIN, 5 * MIN, 15 * MIN, 60 * MIN, 60 * MIN]) {
      const state = recordSoftbanFailure(tmp, {
        reason: "sonde repoussée",
        name: "faces",
        now,
      });
      expect(Date.parse(state.until) - now).toBe(expected);
      // La sonde expire puis échoue aussitôt : ouverture consécutive suivante.
      now = Date.parse(state.until) + 1;
      expect(softbanCircuitState(tmp, "faces", now)).toBe("half-open");
      expect(softbanAllows(tmp, "faces", now)).toBe(true);
    }
    expect(readSoftbanState(tmp, "faces")?.openings).toBe(5);
  });

  it("a clean run (clearSoftbanState) resets the escalation", () => {
    const now = 1_000_000;
    recordSoftbanFailure(tmp, { reason: "ban", name: "faces", now });
    recordSoftbanFailure(tmp, {
      reason: "sonde repoussée",
      name: "faces",
      now: now + 2 * MIN + 1,
    });

    clearSoftbanState(tmp, "faces");

    expect(softbanCircuitState(tmp, "faces")).toBe("closed");
    const state = recordSoftbanFailure(tmp, {
      reason: "ban suivant",
      name: "faces",
      now,
    });
    // Compteur reparti à zéro : premier palier, pas le troisième.
    expect(state.openings).toBe(1);
    expect(Date.parse(state.until) - now).toBe(2 * MIN);
  });

  it("an expired ledger reads as half-open, not as a block", () => {
    const now = 1_000_000;
    recordSoftbanFailure(tmp, { reason: "ban", name: "faces", now });

    const after = now + 2 * MIN + 1;
    expect(softbanRemainingMs(tmp, after, "faces")).toBe(0);
    expect(softbanCircuitState(tmp, "faces", after)).toBe("half-open");
    expect(softbanAllows(tmp, "faces", after)).toBe(true);
  });

  it("honours a custom reset schedule", () => {
    const now = 1_000_000;
    const state = recordSoftbanFailure(tmp, {
      reason: "ban",
      name: "faces",
      now,
      scheduleMs: [60_000, 120_000],
    });
    expect(Date.parse(state.until) - now).toBe(60_000);

    const second = recordSoftbanFailure(tmp, {
      reason: "encore",
      name: "faces",
      now: now + 61_000,
      scheduleMs: [60_000, 120_000],
    });
    expect(Date.parse(second.until) - (now + 61_000)).toBe(120_000);
  });

  it("writes to the same <name>-softban-until.json ledger as before", () => {
    recordSoftbanFailure(tmp, { reason: "ban", name: "faces" });
    const file = softbanStatePath(tmp, "faces");
    expect(file.endsWith(path.join("logs", "faces-softban-until.json"))).toBe(
      true,
    );
    const raw = JSON.parse(readFileSync(file, "utf8"));
    expect(raw).toMatchObject({ reason: "ban", openings: 1 });
  });
});

describe("writeSoftbanState", () => {
  it("persists openings when given", () => {
    const file = softbanStatePath(tmp, "cdn");
    writeSoftbanState(tmp, {
      until: new Date(Date.now() + 1_000),
      reason: "manuel",
      openings: 3,
    });
    expect(JSON.parse(readFileSync(file, "utf8")).openings).toBe(3);
  });
});
