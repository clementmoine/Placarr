import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  collapseDistinctBackCandidates,
  installDistinctBacks,
  resolveBackAlias,
  sha256Hex,
} from "./discoverDistinctBacks";

describe("discoverDistinctBacks", () => {
  it("collapses identical bytes onto one canonical slug", () => {
    const shared = Buffer.from("distinct-sleeve");
    const { byHash, defaultSlugs } = collapseDistinctBackCandidates(
      [
        { slug: "ssr", bytes: shared },
        { slug: "sr", bytes: shared },
        { slug: "ptr", bytes: shared },
        { slug: "r", bytes: Buffer.from("pack-default") },
      ],
      sha256Hex(Buffer.from("pack-default")),
    );
    expect(defaultSlugs).toContain("r");
    expect(byHash.size).toBe(1);
    const group = [...byHash.values()][0]!;
    expect(group.canonicalSlug).toBe("sr");
    expect(group.keys.sort()).toEqual(["ptr", "sr", "ssr"]);
  });

  it("installs only distinct hashes and prunes default duplicates", () => {
    const root = mkdtempSync(path.join(tmpdir(), "distinct-backs-"));
    const defaultBytes = Buffer.from("DEFAULT-BACK");
    writeFileSync(path.join(root, "back.webp"), defaultBytes);
    writeFileSync(path.join(root, "back.event.webp"), defaultBytes);
    writeFileSync(path.join(root, "back.stage.webp"), defaultBytes);

    const leader = Buffer.from("LEADER-BACK");
    const result = installDistinctBacks(
      [
        { slug: "event", bytes: defaultBytes },
        { slug: "stage", bytes: defaultBytes },
        { slug: "leader", bytes: leader },
        { slug: "don", bytes: Buffer.from("DON-BACK") },
      ],
      { cardsDir: root, pruneDefaultDuplicates: true, ext: "webp", force: true },
    );

    expect(result.skippedDefault.sort()).toEqual(["event", "stage"]);
    expect(result.installed.sort()).toEqual(["don", "leader"]);
    expect(readFileSync(path.join(root, "back.leader.webp")).equals(leader)).toBe(
      true,
    );
    expect(() => readFileSync(path.join(root, "back.event.webp"))).toThrow();
    expect(resolveBackAlias(result.aliases, "leader")).toBe("leader");
  });
});
