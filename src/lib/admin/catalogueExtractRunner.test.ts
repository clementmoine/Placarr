import { describe, expect, it, vi } from "vitest";
import path from "node:path";

vi.mock("@/lib/runtimeData", () => ({
  dataRoot: () => "/tmp/placarr-data",
}));

import {
  CATALOGUE_EXTRACT_FULL_TIMEOUT_MS,
  CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS,
  CATALOGUE_EXTRACT_TARGETS,
  catalogueExtractLabel,
  catalogueExtractTimeoutMs,
  isCatalogueExtractTarget,
  normalizeCatalogueExtractTarget,
  resolveCatalogueExtractCommand,
} from "./catalogueExtractRunner";
import { CATALOGUE_PACKS } from "./cataloguePacks";

describe("catalogueExtractRunner targets", () => {
  it("covers every catalogue pack extract target", () => {
    for (const pack of CATALOGUE_PACKS) {
      expect(isCatalogueExtractTarget(pack.extractTarget), pack.id).toBe(true);
    }
    expect(CATALOGUE_EXTRACT_TARGETS).toEqual([
      ...new Set(CATALOGUE_PACKS.map((pack) => pack.extractTarget)),
    ]);
  });

  it("exposes one target per pack", () => {
    expect(isCatalogueExtractTarget("lorcana")).toBe(true);
    expect(isCatalogueExtractTarget("pokemon")).toBe(true);
    expect(isCatalogueExtractTarget("naruto")).toBe(true);
    expect(isCatalogueExtractTarget("dbs-cg")).toBe(true);
    expect(isCatalogueExtractTarget("dbs-fw")).toBe(true);
    expect(isCatalogueExtractTarget("lorcana-web")).toBe(true); // legacy alias
    expect(normalizeCatalogueExtractTarget("lorcana-cards")).toBe("lorcana");
    expect(normalizeCatalogueExtractTarget("lorcana-mobile")).toBe("lorcana");
    expect(normalizeCatalogueExtractTarget("naruto-cacg")).toBe("naruto");
    expect(normalizeCatalogueExtractTarget("naruto/carddass")).toBe("naruto");
    expect(normalizeCatalogueExtractTarget("naruto/ccg")).toBe("naruto");
    expect(normalizeCatalogueExtractTarget("naruto/en-ccg")).toBe("naruto");
    expect(normalizeCatalogueExtractTarget("dbs/cg")).toBe("dbs-cg");
    expect(normalizeCatalogueExtractTarget("fusionworld")).toBe("dbs-fw");
    expect(catalogueExtractLabel("lorcana")).toBe("Lorcana");
    expect(isCatalogueExtractTarget("naruto-shippuden")).toBe(true);
    expect(isCatalogueExtractTarget("naruto-ranks")).toBe(true);
    expect(isCatalogueExtractTarget("naruto-ultra")).toBe(true);
    expect(normalizeCatalogueExtractTarget("naruto/shippuden")).toBe(
      "naruto-shippuden",
    );
    expect(normalizeCatalogueExtractTarget("ninjaranks")).toBe("naruto-ranks");
    expect(normalizeCatalogueExtractTarget("lamincards")).toBe("naruto-ultra");
    expect(catalogueExtractLabel("naruto")).toBe("Naruto Carddass");
    expect(catalogueExtractLabel("naruto-ranks")).toBe("Naruto Ninja Ranks");
    expect(catalogueExtractLabel("naruto-ultra")).toBe(
      "Naruto Ultra Challenge",
    );
    expect(catalogueExtractLabel("dbs-cg")).toBe("Dragon Ball Masters");
  });

  it("builds DBS Masters and Fusion World catalogue sync commands", async () => {
    const masters = await resolveCatalogueExtractCommand("dbs-cg");
    expect(
      masters.args.some(
        (a) =>
          a.includes(`${path.sep}dbscg${path.sep}cli.ts`) ||
          a.includes("/dbscg/cli.ts"),
      ),
    ).toBe(true);
    // Clone EN dump, HTTP FR faces; existing files skipped unless --force.
    expect(masters.prelude.some((line) => /TCG Arena/i.test(line))).toBe(true);
    expect(masters.prelude.some((line) => /--force/.test(line))).toBe(true);
    expect(masters.prelude.some((line) => /produit/i.test(line))).toBe(true);
    const fw = await resolveCatalogueExtractCommand("dbs-fw");
    expect(
      fw.args.some(
        (a) =>
          a.includes(`${path.sep}dbsfw${path.sep}cli.ts`) ||
          a.includes("/dbsfw/cli.ts"),
      ),
    ).toBe(true);
    expect(fw.prelude.some((line) => /produit/i.test(line))).toBe(true);
  });

  it("builds Naruto Wayback catalogue sync command", async () => {
    const cmd = await resolveCatalogueExtractCommand("naruto");
    expect(cmd.command).toContain("tsx");
    expect(
      cmd.args.some(
        (a) =>
          a.endsWith(`${path.sep}narutoccg${path.sep}cli.ts`) ||
          a.includes("/narutoccg/cli.ts"),
      ),
    ).toBe(true);
    expect(cmd.prelude.some((l) => /Naruto/i.test(l))).toBe(true);
    expect(cmd.prelude.some((l) => /Storm 3/i.test(l))).toBe(true);
  });

  it("builds Naruto side-line catalogue commands, not the Pokémon fallback", async () => {
    const shippuden = await resolveCatalogueExtractCommand("naruto-shippuden");
    expect(
      shippuden.args.some(
        (a) =>
          a.includes(`${path.sep}narutoshippuden${path.sep}cli.ts`) ||
          a.includes("/narutoshippuden/cli.ts"),
      ),
    ).toBe(true);
    const ranks = await resolveCatalogueExtractCommand("naruto-ranks");
    expect(
      ranks.args.some(
        (a) =>
          a.includes(`${path.sep}narutoranks${path.sep}cli.ts`) ||
          a.includes("/narutoranks/cli.ts"),
      ),
    ).toBe(true);
    const ultra = await resolveCatalogueExtractCommand("naruto-ultra");
    expect(
      ultra.args.some(
        (a) =>
          a.includes(`${path.sep}narutoultra${path.sep}cli.ts`) ||
          a.includes("/narutoultra/cli.ts"),
      ),
    ).toBe(true);
  });

  it("builds a full Lorcana command (web + cards; Unity when APK exists)", async () => {
    const cmd = await resolveCatalogueExtractCommand("lorcana");
    expect(cmd.command).toContain("tsx");
    expect(
      cmd.args.some((a) => a.includes("src/providers/lorcanatcg/cli.ts")),
    ).toBe(true);
    expect(cmd.args).toEqual(
      expect.arrayContaining([
        "--providers",
        "lorcanaweb",
        "lorcanacards",
        "lorcanaproducts",
      ]),
    );
  });

  it("pokemon catalogue uses a longer worker timeout than inventory", () => {
    expect(catalogueExtractTimeoutMs("pokemon", "catalogue")).toBe(
      CATALOGUE_EXTRACT_FULL_TIMEOUT_MS,
    );
    expect(catalogueExtractTimeoutMs("pokemon", "inventory")).toBeLessThan(
      CATALOGUE_EXTRACT_FULL_TIMEOUT_MS,
    );
  });

  it("gives Masters a longer timeout for the Arena clone + faces", () => {
    expect(catalogueExtractTimeoutMs("dbs-cg", "catalogue")).toBe(
      CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS,
    );
    expect(catalogueExtractTimeoutMs("dbs-fw", "catalogue")).toBeLessThan(
      CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS,
    );
  });

  it("pokemon inventory scrape unions APK/Malie then CDN (all Live langs)", async () => {
    const cmd = await resolveCatalogueExtractCommand("pokemon");
    expect(cmd.command).toContain("tsx");
    expect(
      cmd.args.some((a) => a.includes("src/providers/pokemontcglive/cli.ts")),
    ).toBe(true);
    expect(cmd.args).toEqual(
      expect.arrayContaining(["--langs", "fr,en,de,it,es,ptbr", "--no-job"]),
    );
    expect(cmd.args).toContain("--products");
    expect(cmd.prelude.some((l) => /inventory/i.test(l))).toBe(true);
    expect(cmd.prelude.some((l) => /Malie/i.test(l))).toBe(true);
    expect(cmd.prelude.some((l) => /pkmcards/i.test(l))).toBe(true);
  });

  it("pokemon extract passes --refresh-manifests for catalogue scope", async () => {
    const cmd = await resolveCatalogueExtractCommand("pokemon", {
      scope: "catalogue",
    });
    expect(cmd.args).toContain("--refresh-manifests");
    expect(cmd.prelude.some((l) => /catalogue CDN/i.test(l))).toBe(true);
  });

  it("lorcana extract passes --no-job so child does not cancel worker job", async () => {
    const cmd = await resolveCatalogueExtractCommand("lorcana");
    expect(cmd.args).toContain("--no-job");
  });
});
