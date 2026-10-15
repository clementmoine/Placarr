import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import type { DeckcardmaniaLedger } from "../harvest/deckcardmania";
import { installDbsJccSuperSerieMembership } from "./superSerieMembership";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

describe("installDbsJccSuperSerieMembership", () => {
  it("links SS checklist D- refs onto existing partN prints via print_sets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dbsjcc-ss-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);

    const index = createLocalPrintsIndex("dragonball/jcc");
    index.writePrints([
      {
        printKey: "dbsjcc:part1-d0001",
        setCode: "part1",
        number: "d0001",
        cardType: "card",
        titles: [{ lang: "fr", fullName: "Goku", rarity: null }],
      },
      {
        printKey: "dbsjcc:part2-d0189a",
        setCode: "part2",
        number: "d0189a",
        cardType: "card",
        titles: [{ lang: "fr", fullName: "Variant", rarity: null }],
      },
    ]);

    const ledgerPath = path.join(root, "deckcardmania.json");
    const ledger: DeckcardmaniaLedger = {
      source: "test",
      observed: "2026-10-15",
      ingest: "set-fiches",
      crawl: false,
      note: "test",
      hub: "https://example.test",
      listed: 1,
      albums: [
        {
          idm: 7,
          title: "DragonBall - Super Série 1 - Goku",
          albumUrl: "https://example.test/7",
          setHint: "ss1",
          line: "super-serie",
          bandaiRange: null,
          releaseText: "juillet 2009",
          rares: [],
          holos: ["D-17"],
          checklist: ["D-1", "D-189a"],
          packshotUrl: null,
          gallery: [],
        },
      ],
    };
    fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

    const report = installDbsJccSuperSerieMembership(index, { ledgerPath });
    expect(report).toMatchObject({
      albums: 1,
      listed: 2,
      linked: 2,
      missing: 0,
    });

    const sets = index.listSets().map((s) => s.id).sort();
    expect(sets).toContain("ss1");
    expect(sets).toContain("part1");
  });
});
