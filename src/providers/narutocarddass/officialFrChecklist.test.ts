import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  checklistIdToNumberForms,
  officialFrChecklistSetsForNumber,
  resetOfficialFrChecklistCache,
  syncOfficialFrChecklistAppearances,
} from "./officialFrChecklist";

const dirs: string[] = [];

afterEach(() => {
  resetOfficialFrChecklistCache();
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("checklistIdToNumberForms", () => {
  it("couvre les paddings disque pour NI-049", () => {
    expect(checklistIdToNumberForms("ni049")).toEqual(
      expect.arrayContaining(["ni49", "ni049", "ni0049"]),
    );
  });
});

describe("officialFrChecklistSetsForNumber", () => {
  it("liste S1 et S5 pour NI-049 (checklist papier)", () => {
    expect(officialFrChecklistSetsForNumber("ni0049")).toEqual(["s1", "s5"]);
  });
});

describe("syncOfficialFrChecklistAppearances", () => {
  it("écrit s1+s5 sur le disque pour ni0049", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-fr-check-"));
    dirs.push(root);
    const file = path.join(root, "appearances.json");
    writeFileSync(
      file,
      `${JSON.stringify({
        generatedAt: "2026-01-01T00:00:00.000Z",
        appearances: { ni0049: { fr: "s5", ja: "maki3" } },
      })}\n`,
    );

    const changed = syncOfficialFrChecklistAppearances(root);
    expect(changed).toBeGreaterThan(0);
    expect(existsSync(file)).toBe(true);

    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      appearances: Record<string, Record<string, string | string[]>>;
    };
    expect(raw.appearances.ni0049?.fr).toEqual(["s1", "s5"]);
    expect(raw.appearances.ni0049?.ja).toBe("maki3");
  });
});
