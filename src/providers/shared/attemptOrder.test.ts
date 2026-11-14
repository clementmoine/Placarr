import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadAttemptOrder,
  rankAttempts,
  recordAttempt,
  saveAttemptOrder,
} from "./attemptOrder";

const shapeOf = (url: string) =>
  url.includes("/original/") ? "legacy" : "set";

describe("rankAttempts", () => {
  it("leaves an unobserved key exactly as it was", () => {
    const ledger = { tally: {}, dirty: false };
    const urls = ["/cards/fr/bt1/a.webp", "/cards/original/a.webp"];
    expect(rankAttempts(ledger, "dbscards:fr:bt1", urls, shapeOf)).toEqual(
      urls,
    );
  });

  it("puts the shape that has been answering first", () => {
    const ledger = { tally: {}, dirty: false };
    recordAttempt(ledger, "dbscards:fr:sd15", "legacy", true);
    recordAttempt(ledger, "dbscards:fr:sd15", "set", false);
    const urls = ["/cards/fr/sd15/a.webp", "/cards/original/a.webp"];
    expect(
      rankAttempts(ledger, "dbscards:fr:sd15", urls, shapeOf)[0],
    ).toContain("/original/");
  });

  it("keeps every candidate — it reorders, it does not filter", () => {
    // A card is never lost to a wrong guess: the losing shape stays in the
    // list, just later.
    const ledger = { tally: {}, dirty: false };
    recordAttempt(ledger, "k", "legacy", true);
    const urls = ["/cards/fr/bt1/a.webp", "/cards/original/a.webp"];
    expect(rankAttempts(ledger, "k", urls, shapeOf)).toHaveLength(2);
  });

  it("does not let one key teach another", () => {
    const ledger = { tally: {}, dirty: false };
    recordAttempt(ledger, "dbscards:fr:sd15", "legacy", true);
    const urls = ["/cards/fr/bt30/a.webp", "/cards/original/a.webp"];
    expect(rankAttempts(ledger, "dbscards:fr:bt30", urls, shapeOf)).toEqual(
      urls,
    );
  });

  it("prefers a shape seen once over one never seen", () => {
    // Hits minus misses, not a ratio: 1/1 must beat unobserved, and 50/50 must
    // beat 1/1 rather than tie with it.
    const ledger = { tally: {}, dirty: false };
    recordAttempt(ledger, "k", "legacy", true);
    const urls = ["/cards/fr/bt1/a.webp", "/cards/original/a.webp"];
    expect(rankAttempts(ledger, "k", urls, shapeOf)[0]).toContain("/original/");
  });
});

describe("persistence", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "attempt-order-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("survives the run that learned it", () => {
    const ledger = loadAttemptOrder(tmp, "faces");
    recordAttempt(ledger, "dbscards:fr:bt17", "legacy", true);
    saveAttemptOrder(tmp, "faces", ledger);

    const reloaded = loadAttemptOrder(tmp, "faces");
    const urls = ["/cards/fr/bt17/a.webp", "/cards/original/a.webp"];
    expect(
      rankAttempts(reloaded, "dbscards:fr:bt17", urls, shapeOf)[0],
    ).toContain("/original/");
  });

  it("writes nothing when it learned nothing", () => {
    const ledger = loadAttemptOrder(tmp, "faces");
    saveAttemptOrder(tmp, "faces", ledger);
    expect(loadAttemptOrder(tmp, "faces").tally).toEqual({});
  });
});
