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
      masterSet: true,
      masterSetSuggestDismissed: false,
      alwaysShowFinishLabels: false,
      showPrices: true,
      hideZeroSealedExpectation: false,
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
      masterSet: true,
      masterSetSuggestDismissed: true,
      alwaysShowFinishLabels: true,
      showPrices: false,
      hideZeroSealedExpectation: true,
    });
    expect(readChecklistPrefs(id)).toEqual({
      showOwned: false,
      masterSet: true,
      masterSetSuggestDismissed: true,
      alwaysShowFinishLabels: true,
      showPrices: false,
      hideZeroSealedExpectation: true,
    });
  });
});
