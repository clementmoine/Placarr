/**
 * Heroes sealed ingest — Extra Booster / Selection / Namek land in products-index.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";

import { dbhCuratedDir } from "./pack";
import { ingestDbhSealedProducts } from "./sealed";

describe("dbh sealed ingest", () => {
  it("writes Extra Booster / Selection / Namek SKUs with pack size attested", () => {
    const result = ingestDbhSealedProducts();
    expect(result.written).toBeGreaterThanOrEqual(8);

    const index = loadSealedProductsIndex("dragonball/heroes");
    const bySlug = new Map(
      Object.values(index.products).map((p) => [p.slug, p] as const),
    );
    expect([...bySlug.keys()]).toEqual(
      expect.arrayContaining([
        "extra-booster-pack-1",
        "extra-booster-pack-1-box",
        "extra-booster-pack-2",
        "extra-booster-pack-2-box",
        "extra-booster-pack-3",
        "extra-booster-pack-3-box",
        "extra-booster-pack-4",
        "extra-booster-pack-4-box",
        "extra-booster-pack-box",
        "pums3-pack",
        "pums14-pack",
        "big-bang-booster-pack-4",
        "big-bang-booster-pack-4-box",
        "bigbang-star-2-box",
        "super-warrior-gathering-box",
        "booster-selection-pack",
        "booster-selection-pack-box",
        "booster-selection-pack-vol-2",
        "booster-selection-pack-vol-2-box",
        "booster-selection-pack-vol-3",
        "booster-selection-pack-vol-3-box",
        "ultimate-booster-bravery",
        "ultimate-booster-bravery-box",
        "ultimate-booster-power-breakthrough-box",
        "ultimate-booster-new-clash",
        "ultimate-booster-new-clash-box",
        "ultimate-booster-super-warrior",
        "ultimate-booster-super-warrior-box",
        "ultimate-booster-dbh",
        "big-bang-booster-pack-3",
        "big-bang-booster-pack-3-box",
        "big-bang-booster-pack-1",
        "big-bang-booster-pack-1-box",
        "big-bang-booster-pack-2",
        "big-bang-booster-pack-2-box",
        "big-bang-booster-pack-5",
        "big-bang-booster-pack-5-box",
        "big-bang-booster-pack-6-box",
        "big-bang-booster-pack-7-box",
        "big-bang-booster-pack-8",
        "big-bang-booster-pack-8-box",
        "big-bang-booster-pack-9-box",
        "big-bang-booster-pack-10",
        "big-bang-booster-pack-10-box",
        "big-bang-booster-pack-11",
        "big-bang-booster-pack-11-box",
        "big-bang-booster-pack-12",
        "big-bang-booster-pack-12-box",
        "evolution-pack-vol-1",
        "evolution-pack-vol-1-box",
        "evolution-pack-vol-3",
        "evolution-pack-vol-3-box",
        "starter-pack-namek-battle",
        "starter-pack-burst",
        "starter-pack-ultimate-silver",
        "starter-pack-xeno-gold",
        "binder-12th-anniversary-ultra-god",
        "binder-13th-anniversary-cell",
      ]),
    );

    expect(bySlug.get("booster-selection-pack")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("booster-selection-pack-vol-3-box")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("big-bang-booster-pack-4")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("big-bang-booster-pack-12-box")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("evolution-pack-vol-1")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("evolution-pack-vol-3")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("evolution-pack-vol-3")?.packsContained).toBe(1);
    expect(bySlug.get("evolution-pack-vol-3-box")?.packsContained).toBe(20);

    // Dual gallery: booster vs display packshots must be distinct files when both faces exist.
    const hash = (rel: string) =>
      createHash("sha1")
        .update(readFileSync(join(dbhCuratedDir(), "products", rel)))
        .digest("hex");
    expect(hash("toy-let/selection-pack-vol-1.png")).not.toBe(
      hash("toy-let/selection-pack-vol-1-box.png"),
    );
    expect(hash("toy-let/big-bang-mission-ver-3.png")).not.toBe(
      hash("toy-let/big-bang-mission-ver-3-box.png"),
    );
    expect(hash("toy-let/big-bang-mission-ver-7.jpg")).not.toBe(
      hash("toy-let/big-bang-mission-ver-7-box.jpg"),
    );
    expect(hash("toy-let/evolution-pack-vol-1.jpg")).not.toBe(
      hash("toy-let/evolution-pack-vol-1-box.png"),
    );

    // BMT5/8/9 box: Rappcollect. BMT6 still pack-face-only from retailers.
    expect(bySlug.get("big-bang-booster-pack-5-box")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("big-bang-booster-pack-6-box")?.image ?? null).toBeNull();
    expect(bySlug.get("big-bang-booster-pack-6-box")?.packsContained).toBe(20);
    expect(bySlug.get("big-bang-booster-pack-9-box")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("big-bang-booster-pack-1")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("big-bang-booster-pack-1")?.declaredCardCount).toBe(100);
    expect(bySlug.get("big-bang-booster-pack-8-box")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("big-bang-booster-pack-11")?.declaredCardCount).toBe(94);
    expect(bySlug.get("big-bang-booster-pack-5")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("big-bang-booster-pack-7-box")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );

    // Full Ahead Ultimate Boosters — pack faces + Super Warrior display box.
    expect(bySlug.get("ultimate-booster-new-clash")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("ultimate-booster-new-clash")?.cardsPerPack).toBe(3);
    expect(bySlug.get("ultimate-booster-new-clash-box")?.image ?? null).toBeNull();
    expect(bySlug.get("ultimate-booster-new-clash-box")?.packsContained).toBe(20);
    expect(bySlug.get("ultimate-booster-super-warrior")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("ultimate-booster-super-warrior-box")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(hash("fullahead/ultimate-booster-super-warrior.jpg")).not.toBe(
      hash("fullahead/ultimate-booster-super-warrior-box.jpg"),
    );
    expect(bySlug.get("ultimate-booster-dbh")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );

    expect(bySlug.get("starter-pack-ultimate-silver")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );
    expect(bySlug.get("starter-pack-ultimate-silver")?.declaredCardCount).toBe(
      7,
    );
    expect(bySlug.get("starter-pack-xeno-gold")?.image).toMatch(
      /\/assets\/dragonball\/heroes\/products\//,
    );

    const ebp1 = bySlug.get("extra-booster-pack-1");
    expect(ebp1?.cardsPerPack).toBe(3);
    expect(ebp1?.packsContained).toBe(1);
    /*
      `ebp*` / `bps` ne sont pas des set_code catalogue (`h*` / `hg*`) —
      pool loterie honnêtement unknown jusqu'à mapping ou liste attestée.
    */
    expect(ebp1?.randomPoolScope).toBe("unknown");

    const box = bySlug.get("extra-booster-pack-4-box");
    expect(box?.packsContained).toBe(20);
    expect(box?.randomPoolScope).toBe("none");
    expect(box?.image).toMatch(/\/assets\/dragonball\/heroes\/products\//);

    const namek = bySlug.get("starter-pack-namek-battle");
    expect(namek?.image).toMatch(/\/assets\/dragonball\/heroes\/products\//);
  });
});
