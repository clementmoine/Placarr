import { describe, expect, it } from "vitest";

import dig from "../curated/sources/youtube-gaps-web-hunt-2026-08-29.json";
import sets from "../curated/sources/sets.json";
import checklist from "../curated/sources/carddass-fr-checklist.json";

describe("youtube-gaps-web-hunt", () => {
  it("closes the Supplication S2 ghost against S3 TA-108", () => {
    const finding = dig.findings.find((row) => row.id === "supplication-not-s2-ghost");
    expect(finding?.status).toBe("resolved");
    expect(checklist.sets.s3.ids).toContain("ta108");
    expect(checklist.sets.s3.names?.ta108 ?? checklist.sets.s2.names).toBeTruthy();
    expect(
      (checklist.sets.s3.names as Record<string, string> | undefined)?.ta108,
    ).toBe("Supplication");
    expect(
      (sets.sets.s2.collectorCount as { checklistGhost?: string }).checklistGhost,
    ).toBeUndefined();
  });

  it("keeps early FR displays blocked on packshot; Pack Découverte + Hobby tin have art", () => {
    expect(dig.stillBlockedOnPackshot).toEqual(
      expect.arrayContaining(["display-s1…s5"]),
    );
    expect(dig.stillBlockedOnPackshot).not.toContain("pack-decouverte");
    expect(dig.stillBlockedOnPackshot).not.toContain("tin-box-hobby");
    const hobby = dig.findings.find((row) => row.id === "tin-box-hobby");
    expect(hobby?.status).toBe("minted");
    expect(hobby?.renamedFrom).toBe("tin-box-obi");
    expect(hobby?.sku).toBe("tin-box-hobby");
  });
});
