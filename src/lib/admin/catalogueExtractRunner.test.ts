import { describe, expect, it, vi } from "vitest";

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
  autoExtractPolicy,
  lorcanaExtractProviders,
  maybeFetchStoreApkForExtract,
  normalizeCatalogueExtractTarget,
  resolveCatalogueExtractPlan,
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
    expect(isCatalogueExtractTarget("dbs-lamincards")).toBe(true);
    expect(isCatalogueExtractTarget("lorcana-web")).toBe(true); // legacy alias
    expect(normalizeCatalogueExtractTarget("lorcana-cards")).toBe("lorcana");
    expect(normalizeCatalogueExtractTarget("lorcana-mobile")).toBe("lorcana");
    expect(normalizeCatalogueExtractTarget("naruto-cacg")).toBe("naruto");
    expect(normalizeCatalogueExtractTarget("naruto/carddass")).toBe("naruto");
    expect(normalizeCatalogueExtractTarget("naruto/ccg")).toBe("naruto");
    expect(normalizeCatalogueExtractTarget("naruto/en-ccg")).toBe("naruto");
    expect(normalizeCatalogueExtractTarget("dbs/cg")).toBe("dbs-cg");
    expect(normalizeCatalogueExtractTarget("fusionworld")).toBe("dbs-fw");
    expect(normalizeCatalogueExtractTarget("edibas")).toBe("dbs-lamincards");
    expect(normalizeCatalogueExtractTarget("dbzlamincards")).toBe(
      "dbs-lamincards",
    );
    expect(catalogueExtractLabel("lorcana")).toBe("Lorcana");
    expect(isCatalogueExtractTarget("naruto-shippuden")).toBe(true);
    expect(isCatalogueExtractTarget("naruto-ranks")).toBe(true);
    expect(isCatalogueExtractTarget("naruto-ultra")).toBe(true);
    expect(isCatalogueExtractTarget("naruto-mythos")).toBe(true);
    expect(isCatalogueExtractTarget("naruto-kayou")).toBe(true);
    expect(isCatalogueExtractTarget("naruto-data-carddass")).toBe(true);
    expect(normalizeCatalogueExtractTarget("naruto/shippuden")).toBe(
      "naruto-shippuden",
    );
    expect(normalizeCatalogueExtractTarget("ninjaranks")).toBe("naruto-ranks");
    expect(normalizeCatalogueExtractTarget("lamincards")).toBe("naruto-ultra");
    expect(normalizeCatalogueExtractTarget("mythos")).toBe("naruto-mythos");
    expect(normalizeCatalogueExtractTarget("kayou")).toBe("naruto-kayou");
    expect(normalizeCatalogueExtractTarget("narultimate")).toBe(
      "naruto-data-carddass",
    );
    expect(catalogueExtractLabel("naruto")).toBe("Naruto Carddass");
    expect(catalogueExtractLabel("naruto-ranks")).toBe("Naruto Ninja Ranks");
    expect(catalogueExtractLabel("naruto-ultra")).toBe(
      "Naruto Ultra Challenge",
    );
    expect(catalogueExtractLabel("naruto-mythos")).toBe("Naruto Mythos");
    expect(catalogueExtractLabel("naruto-kayou")).toBe("Naruto Kayou");
    expect(catalogueExtractLabel("naruto-data-carddass")).toBe(
      "Naruto Data Carddass",
    );
    expect(catalogueExtractLabel("dbs-cg")).toBe("Dragon Ball Masters");
  });

  it("builds DBS Masters and Fusion World in-process plans", async () => {
    const masters = await resolveCatalogueExtractPlan("dbs-cg");
    expect(masters.target).toBe("dbs-cg");
    expect(masters.prelude.some((line) => /TCG Arena/i.test(line))).toBe(true);
    expect(masters.prelude.some((line) => /--force/.test(line))).toBe(true);
    expect(masters.prelude.some((line) => /produit/i.test(line))).toBe(true);
    const fw = await resolveCatalogueExtractPlan("dbs-fw");
    expect(fw.target).toBe("dbs-fw");
    expect(fw.prelude.some((line) => /produit/i.test(line))).toBe(true);
  });

  it("resumes stepped packs with --skip from completedSteps", async () => {
    const masters = await resolveCatalogueExtractPlan("dbs-cg", {
      completedSteps: ["scrape", "dbscards", "products", "arena"],
    });
    expect(masters.argv).toContain("--skip");
    expect(masters.argv).toContain("scrape,dbscards,products,arena");
    expect(masters.prelude.some((line) => /reprise: --skip/.test(line))).toBe(
      true,
    );

    const naruto = await resolveCatalogueExtractPlan("naruto", {
      completedSteps: ["scrape", "index"],
    });
    expect(naruto.argv).toContain("--skip");
    expect(naruto.argv).toContain("scrape,index");
  });

  it("builds Naruto Wayback catalogue sync plan", async () => {
    const cmd = await resolveCatalogueExtractPlan("naruto");
    expect(cmd.target).toBe("naruto");
    expect(cmd.prelude.some((l) => /Naruto/i.test(l))).toBe(true);
    expect(cmd.prelude.some((l) => /Storm 3/i.test(l))).toBe(true);
  });

  it("builds Naruto side-line catalogue plans", async () => {
    expect((await resolveCatalogueExtractPlan("naruto-shippuden")).target).toBe(
      "naruto-shippuden",
    );
    expect((await resolveCatalogueExtractPlan("naruto-ranks")).target).toBe(
      "naruto-ranks",
    );
    expect((await resolveCatalogueExtractPlan("naruto-ultra")).target).toBe(
      "naruto-ultra",
    );
  });

  it("builds a full Lorcana plan (web + cards; Unity when APK exists)", async () => {
    const cmd = await resolveCatalogueExtractPlan("lorcana");
    expect(cmd.target).toBe("lorcana");
    expect(cmd.argv).toEqual(
      expect.arrayContaining([
        "--providers",
        "lorcanaweb",
        "lorcanacards",
        "lorcanaproducts",
      ]),
    );
  });

  it("Lorcana auto catalogue omits Unity and products", async () => {
    const cmd = await resolveCatalogueExtractPlan("lorcana", {
      skipUnity: true,
      skipProducts: true,
    });
    expect(cmd.argv).toContain("lorcanaweb");
    expect(cmd.argv).toContain("lorcanacards");
    expect(cmd.argv).not.toContain("lorcanamobile");
    expect(cmd.argv).not.toContain("lorcanaproducts");
    expect(cmd.prelude.some((line) => /skip Unity/i.test(line))).toBe(true);
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
    const cmd = await resolveCatalogueExtractPlan("pokemon");
    expect(cmd.target).toBe("pokemon");
    expect(cmd.argv).toEqual(
      expect.arrayContaining(["--langs", "fr,en,de,it,es,ptbr"]),
    );
    expect(cmd.argv).toContain("--products");
    expect(cmd.argv).not.toContain("--no-job");
    expect(cmd.prelude.some((l) => /inventory/i.test(l))).toBe(true);
    expect(cmd.prelude.some((l) => /Malie/i.test(l))).toBe(true);
    expect(cmd.prelude.some((l) => /pkmcards/i.test(l))).toBe(true);
  });

  it("pokemon extract passes --refresh-manifests for catalogue scope", async () => {
    const cmd = await resolveCatalogueExtractPlan("pokemon", {
      scope: "catalogue",
    });
    expect(cmd.argv).toContain("--refresh-manifests");
    expect(cmd.prelude.some((l) => /catalogue CDN/i.test(l))).toBe(true);
  });
});

describe("store APK prefix on extract", () => {
  it("skips packs without androidPackageId", async () => {
    await expect(maybeFetchStoreApkForExtract("naruto")).resolves.toEqual({
      status: "skipped",
    });
  });

  it("auto-sync without a new APK still runs a catalogue-only pass", () => {
    expect(autoExtractPolicy(true, { status: "up-to-date", versionCode: 1 })).toEqual({
      skipUnity: true,
      preferCatalogueScope: true,
      skipProducts: true,
      skipAudits: true,
      skipPaperFaces: true,
    });
    expect(
      autoExtractPolicy(true, { status: "unavailable", reason: "403" }),
    ).toEqual({
      skipUnity: true,
      preferCatalogueScope: true,
      skipProducts: true,
      skipAudits: true,
      skipPaperFaces: true,
    });
    expect(autoExtractPolicy(true, { status: "updated", versionCode: 2 })).toEqual({
      skipUnity: false,
      preferCatalogueScope: false,
      skipProducts: false,
      skipAudits: false,
      skipPaperFaces: false,
    });
    expect(
      autoExtractPolicy(false, { status: "up-to-date", versionCode: 1 }),
    ).toEqual({
      skipUnity: false,
      preferCatalogueScope: false,
      skipProducts: false,
      skipAudits: false,
      skipPaperFaces: false,
    });
  });

  it("omits Lorcana Unity and products when auto-sync skips them", () => {
    expect(
      lorcanaExtractProviders({ hasApk: true, skipUnity: true, skipProducts: true }),
    ).toEqual(["lorcanaweb", "lorcanacards"]);
    expect(lorcanaExtractProviders({ hasApk: true })).toEqual([
      "lorcanaweb",
      "lorcanacards",
      "lorcanaproducts",
      "lorcanamobile",
    ]);
  });

  it("pokemon auto catalogue plan skips products and store audits", async () => {
    const cmd = await resolveCatalogueExtractPlan("pokemon", {
      scope: "catalogue",
      skipProducts: true,
      skipAudits: true,
      skipPaperFaces: true,
    });
    expect(cmd.argv).toContain("--refresh-manifests");
    expect(cmd.argv).toContain("--skip-products");
    expect(cmd.argv).toContain("--skip-paper-faces");
    expect(cmd.argv).not.toContain("--products");
    expect(cmd.argv).toEqual(
      expect.arrayContaining(["--skip-apk-audit", "--skip-store-audit"]),
    );
  });
});

describe("withConsoleTee", () => {
  it("does not recurse when onLog calls console", async () => {
    const { withConsoleTee } = await import("./catalogueExtractRunner");
    const seen: string[] = [];
    await withConsoleTee(
      (line) => {
        seen.push(line);
        // Same pattern as workRunner heartbeat before the fix.
        console.info(`[FoilExtract test] ${line}`);
      },
      async () => {
        console.log("hello");
        console.log("world");
      },
    );
    expect(seen).toEqual(["hello", "world"]);
  });
});
