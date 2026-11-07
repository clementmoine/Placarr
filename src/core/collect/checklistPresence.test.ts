import { describe, expect, it } from "vitest";

import { checklistSetOwnedKey, isChecklistPrintOwned } from "./checklist";
import {
  checklistCardCountsAsCovered,
  checklistCardCountsAsInHand,
  checklistCardCountsAsMissing,
  partitionChecklistOwnership,
  resolveChecklistCardPresence,
} from "./checklistPresence";

describe("partitionChecklistOwnership", () => {
  it("puts owned/away in owned, past in alreadyHad, wanted in wanted", () => {
    const buckets = partitionChecklistOwnership(
      [
        { printKey: "game:a", setCode: "s1", presence: "owned" },
        { printKey: "game:b", setCode: "s1", presence: "away" },
        { printKey: "game:c", setCode: "s1", presence: "past" },
        { printKey: "game:d", setCode: "s1", presence: "wanted" },
      ],
      { masterSet: false },
    );
    expect([...buckets.owned].sort()).toEqual([
      checklistSetOwnedKey("s1", "game:a"),
      checklistSetOwnedKey("s1", "game:b"),
    ]);
    expect([...buckets.alreadyHad]).toEqual([
      checklistSetOwnedKey("s1", "game:c"),
    ]);
    expect([...buckets.wanted]).toEqual([
      checklistSetOwnedKey("s1", "game:d"),
    ]);
    expect([...buckets.virtual]).toEqual([]);
  });

  it("merges virtual keys and drops them when physically owned/past/wanted", () => {
    const ownedKey = checklistSetOwnedKey("s1", "game:a");
    const pastKey = checklistSetOwnedKey("s1", "game:c");
    const virtKey = checklistSetOwnedKey("s1", "game:v");
    const buckets = partitionChecklistOwnership(
      [
        { printKey: "game:a", setCode: "s1", presence: "owned" },
        { printKey: "game:c", setCode: "s1", presence: "past" },
      ],
      {
        masterSet: false,
        virtualKeys: new Set([ownedKey, pastKey, virtKey]),
      },
    );
    expect([...buckets.owned]).toEqual([ownedKey]);
    expect([...buckets.alreadyHad]).toEqual([pastKey]);
    expect([...buckets.virtual]).toEqual([virtKey]);
  });

  it("gives owned precedence over past/wanted for the same key", () => {
    const key = checklistSetOwnedKey("s1", "game:a");
    const buckets = partitionChecklistOwnership(
      [
        { printKey: "game:a", setCode: "s1", presence: "past" },
        { printKey: "game:a", setCode: "s1", presence: "owned" },
        { printKey: "game:a", setCode: "s1", presence: "wanted" },
      ],
      { masterSet: false },
    );
    expect([...buckets.owned]).toEqual([key]);
    expect([...buckets.alreadyHad]).toEqual([]);
    expect([...buckets.wanted]).toEqual([]);
  });

  it("defaults missing presence to owned", () => {
    const buckets = partitionChecklistOwnership(
      [{ printKey: "game:a", setCode: "s1" }],
      { masterSet: false },
    );
    expect([...buckets.owned]).toEqual([
      checklistSetOwnedKey("s1", "game:a"),
    ]);
  });
});

describe("resolveChecklistCardPresence", () => {
  const print = { setId: "s1", printKey: "game:c", finish: null };
  const empty = {
    owned: new Set<string>(),
    virtual: new Set<string>(),
    alreadyHad: new Set<string>(),
    wanted: new Set<string>(),
  };

  it("resolves owned / past / wanted / virtual / missing", () => {
    const ownedKey = checklistSetOwnedKey("s1", "game:a");
    const pastKey = checklistSetOwnedKey("s1", "game:c");
    const wantedKey = checklistSetOwnedKey("s1", "game:d");
    const virtKey = checklistSetOwnedKey("s1", "game:v");
    expect(
      resolveChecklistCardPresence(
        { setId: "s1", printKey: "game:a", finish: null },
        { ...empty, owned: new Set([ownedKey]) },
        false,
        isChecklistPrintOwned,
      ),
    ).toBe("owned");
    expect(
      resolveChecklistCardPresence(
        print,
        { ...empty, alreadyHad: new Set([pastKey]) },
        false,
        isChecklistPrintOwned,
      ),
    ).toBe("past");
    expect(
      resolveChecklistCardPresence(
        { setId: "s1", printKey: "game:d", finish: null },
        { ...empty, wanted: new Set([wantedKey]) },
        false,
        isChecklistPrintOwned,
      ),
    ).toBe("wanted");
    expect(
      resolveChecklistCardPresence(
        { setId: "s1", printKey: "game:v", finish: null },
        { ...empty, virtual: new Set([virtKey]) },
        false,
        isChecklistPrintOwned,
      ),
    ).toBe("virtual");
    expect(
      resolveChecklistCardPresence(
        { setId: "s1", printKey: "game:z", finish: null },
        empty,
        false,
        isChecklistPrintOwned,
      ),
    ).toBe("missing");
  });

  it("prefers physical past over virtual for the same key", () => {
    const key = checklistSetOwnedKey("s1", "game:c");
    expect(
      resolveChecklistCardPresence(
        print,
        {
          ...empty,
          alreadyHad: new Set([key]),
          virtual: new Set([key]),
        },
        false,
        isChecklistPrintOwned,
      ),
    ).toBe("past");
  });
});

describe("checklistCardCountsAsMissing", () => {
  it("keeps wanted in the buy pool and excludes past / virtual", () => {
    expect(checklistCardCountsAsMissing("missing")).toBe(true);
    expect(checklistCardCountsAsMissing("wanted")).toBe(true);
    expect(checklistCardCountsAsMissing("past")).toBe(false);
    expect(checklistCardCountsAsMissing("owned")).toBe(false);
    expect(checklistCardCountsAsMissing("virtual")).toBe(false);
  });

  it("in-hand vs covered counters", () => {
    expect(checklistCardCountsAsInHand("owned")).toBe(true);
    expect(checklistCardCountsAsInHand("virtual")).toBe(false);
    expect(checklistCardCountsAsCovered("owned")).toBe(true);
    expect(checklistCardCountsAsCovered("virtual")).toBe(true);
    expect(checklistCardCountsAsCovered("past")).toBe(false);
  });
});
