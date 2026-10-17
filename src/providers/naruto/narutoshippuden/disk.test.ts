import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { curatedCardsDir, listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";
import { narutoShippudenEffectPack } from "@/effects/narutoshippuden";
import { narutoShippudenAssetsCardUrl, narutoShippudenCuratedDir, normalizeShippudenDiskId } from "./assets";

// —— assets ——
{
  describe("normalizeShippudenDiskId", () => {
    it.each([
      ["gaku", "gaku0038", "gaku0038"],
      ["gaku", "0038", "gaku0038"],
      ["gaku", "38", "gaku0038"],
      ["shi", "shi0043", "shi0043"],
      ["shi", "43", "shi0043"],
      ["mju", "0165", "mju0165"],
    ])("%s + %s → %s", (family, number, want) => {
      expect(normalizeShippudenDiskId(family, number)).toBe(want);
    });
  });

  describe("narutoShippudenAssetsCardUrl", () => {
    it("joins set/lang/diskId — matching packCardDir on disk", () => {
      expect(
        narutoShippudenAssetsCardUrl("gaku", "0038", "ja", "art.suruga.jpg"),
      ).toBe(
        "/assets/naruto/shippuden/cards/gaku/ja/gaku0038/art.suruga.jpg",
      );
      expect(
        narutoShippudenAssetsCardUrl("gaku", "gaku0038", "ja", "art.suruga.jpg"),
      ).toBe(
        "/assets/naruto/shippuden/cards/gaku/ja/gaku0038/art.suruga.jpg",
      );
    });
  });
}

// —— curatedBack ——
{
  /**
   * Le verso du 疾風伝 doit s'installer **par script**, sous le nom que le pack
   * d'effets va chercher.
   *
   * Les deux moitiés comptent, et se sont trompées séparément :
   *
   * - le fichier a d'abord été posé à la main dans `data/`, donc effacé au
   *   premier dossier reconstruit ;
   * - nommé `back.png`, il produisait `back.webp`, que rien ne lit — les dos sont
   *   servis par langue et ce jeu n'existe qu'en japonais.
   */



  describe("verso curé du 疾風伝", () => {
    const cards = curatedCardsDir(narutoShippudenCuratedDir());

    it("ships exactly one verso, at pack root, tagged japanese", () => {
      expect(listCuratedBackSources(cards).map((row) => row.destRel)).toEqual([
        "back.ja.webp",
      ]);
    });

    it("installs under the name the effect pack asks for", () => {
      const [back] = listCuratedBackSources(cards);
      expect(narutoShippudenEffectPack.cardBackUrl).toBe(
        `/assets/naruto/shippuden/cards/${back.destRel}`,
      );
    });

    /*
      Une provenance écrite, parce que ce verso n'a pas de source répétable : le
      site le publie en une image isolée, sans liste à parcourir.
    */
    it("documents where the image came from", () => {
      const doc = path.join(narutoShippudenCuratedDir(), "BACK.md");
      expect(existsSync(doc)).toBe(true);
    });

    /*
      `sources/` a rejoint l'arbre le 2026-08-21 : les deux listes officielles du
      jeu, arrivées avec lui du pack Carddass. Rien d'autre — ce qui se moissonne
      par script vit dans `staging/`, qui se reconstruit et n'est pas versionné.
    */
    it("keeps the tree to cards + sources + the note, nothing staged", () => {
      expect(
        readdirSync(narutoShippudenCuratedDir())
          .filter((name) => !name.startsWith("."))
          .sort(),
      ).toEqual(["BACK.md", "cards", "sources"]);
    });
  });
}
