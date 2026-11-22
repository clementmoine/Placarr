import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { prunePokemonCardLangs } from "./pruneCardLangs";

describe("prunePokemonCardLangs", () => {
  it("removes locale trees outside the keep list", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-prune-"));
    const fr = path.join(root, "me5", "fr", "001");
    const de = path.join(root, "me5", "de", "001");
    const en = path.join(root, "sv1", "en", "002");
    mkdirSync(fr, { recursive: true });
    mkdirSync(de, { recursive: true });
    mkdirSync(en, { recursive: true });
    writeFileSync(path.join(fr, "art.webp"), "fr");
    writeFileSync(path.join(de, "art.webp"), "de-bytes");
    writeFileSync(path.join(en, "art.webp"), "en");

    const dry = prunePokemonCardLangs({
      keepLangs: ["fr"],
      cardsRoot: root,
      apply: false,
    });
    expect(dry.removedLangs).toEqual(["de", "en"]);
    expect(dry.removedDirs).toBe(2);
    expect(dry.removedBytes).toBeGreaterThan(0);

    const applied = prunePokemonCardLangs({
      keepLangs: ["fr"],
      cardsRoot: root,
      apply: true,
    });
    expect(applied.removedDirs).toBe(2);
    expect(existsSync(path.join(fr, "art.webp"))).toBe(true);
    expect(existsSync(de)).toBe(false);
    expect(existsSync(en)).toBe(false);
  });

  it("never touches lang-first paper trees (cards/{lang}/{set}/…)", () => {
    // Paper harvests sit lang-first next to Live set-first dumps. Read as
    // set-first, `fr/2012bw` looked like set `fr`, locale `2012bw` — and the
    // whole McDo / paper corpus was deleted at the end of a Live Sync.
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-prune-langfirst-"));
    const paperFr = path.join(root, "fr", "2012bw", "002");
    const paperJa = path.join(root, "ja", "a1", "001");
    const liveDe = path.join(root, "me5", "de", "001");
    // A set-first set whose id looks like a locale (e-Card `ec`).
    const liveEcDe = path.join(root, "ec", "de", "001");
    for (const dir of [paperFr, paperJa, liveDe, liveEcDe]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "art.webp"), "x");
    }

    const out = prunePokemonCardLangs({
      keepLangs: ["en", "fr"],
      cardsRoot: root,
      apply: true,
    });
    expect(out.removedLangs).toEqual(["de"]);
    expect(out.removedDirs).toBe(2);
    expect(existsSync(liveEcDe)).toBe(false);
    expect(existsSync(path.join(paperFr, "art.webp"))).toBe(true);
    expect(existsSync(path.join(paperJa, "art.webp"))).toBe(true);
    expect(existsSync(liveDe)).toBe(false);
  });

  it("no-ops when keep list is empty", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-prune-empty-"));
    mkdirSync(path.join(root, "me5", "fr"), { recursive: true });
    const out = prunePokemonCardLangs({
      keepLangs: [],
      cardsRoot: root,
      apply: true,
    });
    expect(out.removedDirs).toBe(0);
  });
});
