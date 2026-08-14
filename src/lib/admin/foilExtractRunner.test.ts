import { describe, expect, it, vi } from "vitest";
import path from "node:path";

vi.mock("@/lib/runtimeData", () => ({
  dataRoot: () => "/tmp/placarr-data",
}));

import {
  FOIL_EXTRACT_CATALOGUE_TIMEOUT_MS,
  FOIL_EXTRACT_DBS_FACES_TIMEOUT_MS,
  FOIL_EXTRACT_TARGETS,
  foilExtractLabel,
  foilExtractTimeoutMs,
  isFoilExtractTarget,
  normalizeFoilExtractTarget,
  resolveFoilExtractCommand,
} from "./foilExtractRunner";
import { CATALOGUE_PACKS } from "./cataloguePacks";

describe("foilExtractRunner targets", () => {
  it("covers every catalogue pack extract target", () => {
    for (const pack of CATALOGUE_PACKS) {
      expect(isFoilExtractTarget(pack.extractTarget), pack.id).toBe(true);
    }
    expect(FOIL_EXTRACT_TARGETS).toEqual(
      CATALOGUE_PACKS.map((pack) => pack.extractTarget),
    );
  });

  it("exposes one target per pack", () => {
    expect(isFoilExtractTarget("lorcana")).toBe(true);
    expect(isFoilExtractTarget("pokemon")).toBe(true);
    expect(isFoilExtractTarget("naruto")).toBe(true);
    expect(isFoilExtractTarget("dbs-cg")).toBe(true);
    expect(isFoilExtractTarget("dbs-fw")).toBe(true);
    expect(isFoilExtractTarget("lorcana-web")).toBe(true); // legacy alias
    expect(normalizeFoilExtractTarget("lorcana-cards")).toBe("lorcana");
    expect(normalizeFoilExtractTarget("lorcana-mobile")).toBe("lorcana");
    expect(normalizeFoilExtractTarget("naruto-cacg")).toBe("naruto");
    expect(normalizeFoilExtractTarget("dbs/cg")).toBe("dbs-cg");
    expect(normalizeFoilExtractTarget("fusionworld")).toBe("dbs-fw");
    expect(foilExtractLabel("lorcana")).toBe("Lorcana");
    expect(foilExtractLabel("naruto")).toBe("Naruto CCG");
    expect(foilExtractLabel("dbs-cg")).toBe("Dragon Ball Masters");
  });

  it("builds DBS Masters and Fusion World catalogue sync commands", async () => {
    const masters = await resolveFoilExtractCommand("dbs-cg");
    expect(masters.args.some((a) => a.includes(`${path.sep}dbscg${path.sep}cli.ts`) || a.includes("/dbscg/cli.ts"))).toBe(
      true,
    );
    expect(masters.prelude.some((line) => /Deckplanet/i.test(line))).toBe(
      true,
    );
    const fw = await resolveFoilExtractCommand("dbs-fw");
    expect(fw.args.some((a) => a.includes(`${path.sep}dbsfw${path.sep}cli.ts`) || a.includes("/dbsfw/cli.ts"))).toBe(
      true,
    );
  });

  it("builds Naruto Wayback catalogue sync command", async () => {
    const cmd = await resolveFoilExtractCommand("naruto");
    expect(cmd.command).toContain("tsx");
    expect(cmd.args.some((a) => a.endsWith(`${path.sep}narutoccg${path.sep}cli.ts`) || a.includes("/narutoccg/cli.ts"))).toBe(
      true,
    );
    expect(cmd.prelude.some((l) => /Naruto/i.test(l))).toBe(true);
  });

  it("builds a full Lorcana command (web + cards; Unity when APK exists)", async () => {
    const cmd = await resolveFoilExtractCommand("lorcana");
    expect(cmd.command).toContain("tsx");
    expect(
      cmd.args.some((a) => a.includes("src/providers/lorcanatcg/cli.ts")),
    ).toBe(true);
    expect(cmd.args).toEqual(
      expect.arrayContaining(["--providers", "lorcanaweb", "lorcanacards"]),
    );
  });

  it("pokemon catalogue uses a longer worker timeout than inventory", () => {
    expect(foilExtractTimeoutMs("pokemon", "catalogue")).toBe(
      FOIL_EXTRACT_CATALOGUE_TIMEOUT_MS,
    );
    expect(foilExtractTimeoutMs("pokemon", "inventory")).toBeLessThan(
      FOIL_EXTRACT_CATALOGUE_TIMEOUT_MS,
    );
  });

  it("gives Masters a longer timeout for the Deckplanet dump", () => {
    expect(foilExtractTimeoutMs("dbs-cg", "catalogue")).toBe(
      FOIL_EXTRACT_DBS_FACES_TIMEOUT_MS,
    );
    expect(foilExtractTimeoutMs("dbs-fw", "catalogue")).toBeLessThan(
      FOIL_EXTRACT_DBS_FACES_TIMEOUT_MS,
    );
  });

  it("pokemon inventory scrape unions APK/Malie then CDN (all Live langs)", async () => {
    const cmd = await resolveFoilExtractCommand("pokemon");
    expect(cmd.command).toContain("tsx");
    expect(
      cmd.args.some((a) => a.includes("src/providers/pokemontcglive/cli.ts")),
    ).toBe(true);
    expect(cmd.args).toEqual(
      expect.arrayContaining(["--langs", "fr,en,de,it,es,ptbr", "--no-job"]),
    );
    expect(cmd.prelude.some((l) => /inventory/i.test(l))).toBe(true);
    expect(cmd.prelude.some((l) => /Malie/i.test(l))).toBe(true);
  });

  it("pokemon extract passes --refresh-manifests for catalogue scope", async () => {
    const cmd = await resolveFoilExtractCommand("pokemon", {
      scope: "catalogue",
    });
    expect(cmd.args).toContain("--refresh-manifests");
    expect(cmd.prelude.some((l) => /catalogue CDN/i.test(l))).toBe(true);
  });

  it("lorcana extract passes --no-job so child does not cancel worker job", async () => {
    const cmd = await resolveFoilExtractCommand("lorcana");
    expect(cmd.args).toContain("--no-job");
  });
});
