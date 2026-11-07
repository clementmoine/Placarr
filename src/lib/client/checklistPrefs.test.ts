import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CHECKLIST_PREFS,
  parseChecklistPrefs,
  readChecklistPrefs,
  writeChecklistPrefs,
} from "./checklistPrefs";

describe("checklistPrefs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults when raw is missing or garbage", () => {
    expect(parseChecklistPrefs(null)).toEqual(DEFAULT_CHECKLIST_PREFS);
    expect(parseChecklistPrefs("x")).toEqual(DEFAULT_CHECKLIST_PREFS);
    expect(parseChecklistPrefs({})).toEqual(DEFAULT_CHECKLIST_PREFS);
  });

  it("keeps valid booleans and fills the rest", () => {
    expect(parseChecklistPrefs({ showOwned: false, masterSet: true })).toEqual({
      showOwned: false,
      showPast: false,
      showVirtual: true,
      onlyVirtual: false,
      possessionView: "inHand",
      masterSet: true,
      masterSetSuggestDismissed: false,
      alwaysShowFinishLabels: false,
      showPrices: true,
      hideImputedPrices: false,
      hideZeroSealedExpectation: false,
    });
  });

  it("round-trips showPast / showVirtual / possessionView", () => {
    expect(parseChecklistPrefs({ showPast: true })).toMatchObject({
      showPast: true,
    });
    expect(
      parseChecklistPrefs({
        showVirtual: false,
        onlyVirtual: true,
        possessionView: "covered",
      }),
    ).toMatchObject({
      showVirtual: false,
      onlyVirtual: true,
      possessionView: "covered",
    });
    expect(parseChecklistPrefs({ possessionView: "nope" })).toMatchObject({
      possessionView: "inHand",
    });
  });

  it("migrates the previous finishLabelsOnlyWhenAmbiguous flag", () => {
    expect(
      parseChecklistPrefs({ finishLabelsOnlyWhenAmbiguous: true }),
    ).toMatchObject({ alwaysShowFinishLabels: false });
    expect(
      parseChecklistPrefs({ finishLabelsOnlyWhenAmbiguous: false }),
    ).toMatchObject({ alwaysShowFinishLabels: true });
  });

  it("round-trips through localStorage when available", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    const id = "shelf-test-prefs";
    writeChecklistPrefs(id, {
      showOwned: false,
      showPast: true,
      showVirtual: false,
      onlyVirtual: true,
      possessionView: "covered",
      masterSet: true,
      masterSetSuggestDismissed: true,
      alwaysShowFinishLabels: true,
      showPrices: false,
      hideImputedPrices: true,
      hideZeroSealedExpectation: true,
    });
    expect(readChecklistPrefs(id)).toEqual({
      showOwned: false,
      showPast: true,
      showVirtual: false,
      onlyVirtual: true,
      possessionView: "covered",
      masterSet: true,
      masterSetSuggestDismissed: true,
      alwaysShowFinishLabels: true,
      showPrices: false,
      hideImputedPrices: true,
      hideZeroSealedExpectation: true,
    });
  });
});
