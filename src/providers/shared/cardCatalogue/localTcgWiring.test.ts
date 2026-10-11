/**
 * Wiring auto — a local_catalog TCG module must be hub + effect wired.
 * Growth (new sets/cards/sealed after Sync) uses ProviderModule surfaces;
 * a brand-new pack still needs registry + CATALOGUE_PACKS + effects import
 * until hub derivation lands — this guard fails loud when any link is missing.
 *
 * @see docs/tcg_new_pack.md
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import { getEffectPack } from "@/core/render/foil/backend";
import {
  CATALOGUE_PACKS,
  cataloguePackForDataPack,
} from "@/lib/admin/cataloguePacks";
import type { ProviderModule } from "@/types/providerModule";

import "@/effects";

function localCatalogTcgModules(): ProviderModule[] {
  return PROVIDER_MODULES.filter(
    (mdl) =>
      mdl.info.supplyMode === "local_catalog" &&
      mdl.info.types.includes("tcg") &&
      Boolean(mdl.catalog?.dataPack),
  );
}

describe("local TCG wiring (hub + effect)", () => {
  it("every local_catalog TCG module resolves a CATALOGUE_PACKS hub entry", () => {
    const missing: string[] = [];
    for (const mdl of localCatalogTcgModules()) {
      const dataPack = mdl.catalog!.dataPack;
      if (!cataloguePackForDataPack(dataPack)) {
        missing.push(`${mdl.info.id} → ${dataPack}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every CATALOGUE_PACKS entry has a local_catalog TCG owner", () => {
    const owned = new Set(
      localCatalogTcgModules().map((mdl) => mdl.catalog!.dataPack),
    );
    const orphan = CATALOGUE_PACKS.map((pack) => pack.id).filter(
      (id) => !owned.has(id),
    );
    expect(orphan).toEqual([]);
  });

  it("every local_catalog TCG module declares a registered effectPack", () => {
    const broken: string[] = [];
    for (const mdl of localCatalogTcgModules()) {
      const effectPack = mdl.catalog?.effectPack;
      if (!effectPack) {
        broken.push(`${mdl.info.id}: missing catalog.effectPack`);
        continue;
      }
      if (!getEffectPack(effectPack)) {
        broken.push(
          `${mdl.info.id}: effectPack "${effectPack}" not registered`,
        );
      }
    }
    expect(broken).toEqual([]);
  });

  it("effects/index.ts side-imports every effects/*/index.ts pack", () => {
    const effectsRoot = path.join(process.cwd(), "src/effects");
    const indexText = readFileSync(
      path.join(effectsRoot, "index.ts"),
      "utf8",
    );
    const dirs = readdirSync(effectsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) =>
        existsSync(path.join(effectsRoot, name, "index.ts")),
      )
      .sort();
    const missing = dirs.filter(
      (name) => !indexText.includes(`@/effects/${name}`),
    );
    expect(missing).toEqual([]);
  });
});
