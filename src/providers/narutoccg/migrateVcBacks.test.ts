import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { migrateNarutoVcBacksToCorrectedArt } from "./scrapeCards";

/**
 * carddass.fr saved `-vc` (version corrigée) faces as `back.jpg` inside the
 * card folder. The migration renames those to `art.corrected.*` — but it used
 * to walk from `cards/` and rename every `back.*` it met, including the pack
 * back this pipeline installs one step earlier. Every run turned the verso into
 * a stray `art.corrected.webp`, leaving the card with nothing to flip to.
 */
function scaffold(): string {
  const root = mkdtempSync(path.join(tmpdir(), "naruto-vc-"));
  const cards = path.join(root, "cards");
  const card = path.join(cards, "s5", "fr", "ni232");
  mkdirSync(card, { recursive: true });
  mkdirSync(path.join(cards, "s5"), { recursive: true });
  writeFileSync(path.join(cards, "back.webp"), "pack-back");
  writeFileSync(path.join(cards, "s5", "back.webp"), "set-back");
  writeFileSync(path.join(card, "back.jpg"), "errata-face");
  return root;
}

describe("migrateNarutoVcBacksToCorrectedArt", () => {
  it("renames the mislabelled errata face inside a card folder", () => {
    const root = scaffold();
    expect(migrateNarutoVcBacksToCorrectedArt(root)).toBe(1);
    const card = path.join(root, "cards", "s5", "fr", "ni232");
    expect(existsSync(path.join(card, "art.corrected.jpg"))).toBe(true);
    expect(existsSync(path.join(card, "back.jpg"))).toBe(false);
  });

  it("leaves the pack back and the set verso alone", () => {
    const root = scaffold();
    migrateNarutoVcBacksToCorrectedArt(root);
    // Both are real versos, and the pack back is what the card flips to.
    expect(existsSync(path.join(root, "cards", "back.webp"))).toBe(true);
    expect(existsSync(path.join(root, "cards", "s5", "back.webp"))).toBe(true);
    expect(existsSync(path.join(root, "cards", "art.corrected.webp"))).toBe(
      false,
    );
  });
});
