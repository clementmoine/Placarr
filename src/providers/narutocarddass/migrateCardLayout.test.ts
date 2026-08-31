import { describe, expect, it } from "vitest";

import {
  planNarutoCardMove,
  planNarutoCanonicalDiskRename,
} from "./migrateCardLayout";
import { narutoDiskCardId } from "./collectorIdentity";

describe("planNarutoCardMove", () => {
  it("lifts series folders onto family / printed id / lang", () => {
    expect(planNarutoCardMove("s1", "fr", "ni001")).toEqual({
      fromRel: "s1/fr/ni001",
      toRel: "ninja/ni0001/fr",
      appearanceSet: "s1",
      lang: "fr",
      diskId: "ni0001",
      family: "ninja",
    });
    expect(planNarutoCardMove("s1", "en", "n001")?.toRel).toBe(
      "ninja/n0001/en",
    );
    expect(planNarutoCardMove("s28", "fr", "n1650")?.toRel).toBe(
      "ninja/n1650/fr",
    );
    expect(planNarutoCardMove("s6", "it", "ta226")?.toRel).toBe(
      "mission/ta0226/it",
    );
    expect(planNarutoCardMove("s6", "jap", "ni255")?.lang).toBe("ja");
    expect(planNarutoCardMove("promo", "fr", "ni023")?.toRel).toBe(
      "ninja/ni0023-promo/fr",
    );
    expect(planNarutoCardMove("promo", "fr", "pr011")?.toRel).toBe(
      "promo/pr0011/fr",
    );
    expect(planNarutoCardMove("promo", "ja", "prni0001")?.toRel).toBe(
      "promo/prni0001/ja",
    );
    expect(narutoDiskCardId("PR-忍-1", "promo")).toBe("prni0001");
    expect(planNarutoCardMove("s6", "en", "n0097-us")?.toRel).toBe(
      "ninja/nus0097/en",
    );
  });

  it("renames a leftover n0097-us folder onto the US prefix", () => {
    expect(planNarutoCanonicalDiskRename("ninja", "n0097-us", "en")).toEqual({
      fromRel: "ninja/n0097-us/en",
      toRel: "ninja/nus0097/en",
      appearanceSet: "ninja",
      lang: "en",
      diskId: "nus0097",
      family: "ninja",
    });
    expect(planNarutoCanonicalDiskRename("ninja", "nus0097", "en")).toBeNull();
  });

  it("lifts leftover PR忍 scans out of the ninja folder onto promo/", () => {
    expect(planNarutoCanonicalDiskRename("ninja", "prni0006", "ja")).toEqual({
      fromRel: "ninja/prni0006/ja",
      toRel: "promo/prni0006/ja",
      appearanceSet: "promo",
      lang: "ja",
      diskId: "prni0006",
      family: "promo",
    });
  });

  it("lifts 幕 / 忍者学校 out of ninja/ onto their prefix folder", () => {
    expect(planNarutoCanonicalDiskRename("ninja", "gaku0001", "ja")).toEqual({
      fromRel: "ninja/gaku0001/ja",
      toRel: "gaku/gaku0001/ja",
      appearanceSet: "gaku",
      lang: "ja",
      diskId: "gaku0001",
      family: "gaku",
    });
    expect(planNarutoCanonicalDiskRename("ninja", "shi0001", "ja")).toEqual({
      fromRel: "ninja/shi0001/ja",
      toRel: "shi/shi0001/ja",
      appearanceSet: "shi",
      lang: "ja",
      diskId: "shi0001",
      family: "shi",
    });
    expect(planNarutoCanonicalDiskRename("jutsu", "mju0062", "ja")).toEqual({
      fromRel: "jutsu/mju0062/ja",
      toRel: "mju/mju0062/ja",
      appearanceSet: "mju",
      lang: "ja",
      diskId: "mju0062",
      family: "mju",
    });
  });

  it("does not re-plan a tree that is already family-first", () => {
    expect(planNarutoCardMove("ninja", "fr", "ni0001")).toBeNull();
  });
});
