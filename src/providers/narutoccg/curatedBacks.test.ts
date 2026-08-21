import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  curatedCardsDir,
  destBackWebpName,
  listCuratedBackSources,
} from "@/providers/shared/curatedCardsInstall";

import { narutoCuratedDir } from "./curatedPaths";
import { listCuratedReconstructedFaces } from "./installReconstructed";

function listRelFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...listRelFiles(abs, rel));
    else out.push(rel);
  }
  return out.sort();
}

describe("Naruto curated tree", () => {
  const root = narutoCuratedDir();
  const cards = curatedCardsDir(root);

  /*
    `products/` a rejoint l'arbre le 2026-08-20 : les visuels de produit faits
    à la main — badges de série découpés, logo du jeu, emballages photographiés,
    retouches d'un visuel mal cadré par sa source. Ils ne peuvent pas vivre dans
    `staging/`, qui se reconstruit par script et les effacerait sans bruit.
  */
  it("is cards + products + sources only — no markdown, no leftover trees", () => {
    expect(
      readdirSync(root)
        .filter((n) => !n.startsWith("."))
        .sort(),
    ).toEqual(["cards", "products", "sources"]);
    const files = listRelFiles(root);
    expect(files.filter((f) => f.endsWith(".md"))).toEqual([]);
    expect(
      files.some(
        (f) => f.startsWith("en-ccg/") || f.startsWith("reconstructed/"),
      ),
    ).toBe(false);
    expect(files).not.toContain("cards/back.png");
  });

  it("ships one attested verso per language at pack root", () => {
    const dests = readdirSync(cards)
      .map((name) => destBackWebpName(name))
      .filter((name): name is string => Boolean(name))
      .sort();
    expect(dests).toEqual([
      "back.en.webp",
      "back.fr.webp",
      "back.it.webp",
      "back.ja.webp",
    ]);
  });

  /*
    Le pack ne porte plus qu'**un** jeu. Le verso du 「NARUTO 疾風伝 カードゲーム」
    (2007-2009) vivait ici sous `shi/`, faute d'un pack à lui ; il est parti
    avec son jeu le 2026-08-21 et son propre test l'atteste à destination.

    Ce qui reste doit rester **complet** : quatre versos, un par langue, et rien
    d'autre — un cinquième signalerait un second jeu qui se réinstalle.
  */
  it("ships nothing but the four Carddass versos", () => {
    expect(listCuratedBackSources(cards).map((row) => row.destRel)).toEqual([
      "back.en.webp",
      "back.fr.webp",
      "back.it.webp",
      "back.ja.webp",
    ]);
  });

  it("files reconstructed faces under {family}/{id}/{lang}/, not a flat dump", () => {
    const faces = listCuratedReconstructedFaces(cards);
    expect(
      faces.map((f) => `${f.family}/${f.cardId}/${f.lang}`).sort(),
    ).toEqual([
      "jutsu/te0212/fr",
      /*
        Les huit 騎 (guerriers de Gelel), recadrées à la main : les seules
        faces qu'on avait étaient des photos eBay carrées de 1600×1600, où la
        carte n'occupe qu'une partie du cadre.
      */
      "knight/ki0001/ja",
      "knight/ki0002/ja",
      "knight/ki0003/ja",
      "knight/ki0004/ja",
      "knight/ki0005/ja",
      "knight/ki0006/ja",
      "knight/ki0007/ja",
      "knight/ki0008/ja",
      "mission/ta0221/fr",
      "mission/ta0226/fr",
      /*
        Les quatre du bonus PS1, restaurées depuis les photos Mercari : ce sont
        les seules reconstructions japonaises, et les seules dont l'original
        n'est pas un scan officiel abîmé mais une photo de collectionneur —
        aucun scan à plat de ces cartes n'existe.
      */
      "ninja/ni0001-ps/ja",
      "ninja/ni0002-ps/ja",
      "ninja/ni0003-ps/ja",
      "ninja/ni0011-ps/ja",
      "ninja/ni0194/fr",
      "ninja/ni0195/fr",
      "ninja/ni0232/fr",
      "ninja/ni0236/fr",
      "ninja/ni0241/fr",
      "ninja/ni0252/fr",
      "ninja/ni0253/fr",
    ]);
    for (const face of faces) {
      expect(path.basename(face.source)).toMatch(
        /^art\.reconstructed\.(png|webp)$/i,
      );
      expect(
        existsSync(path.join(path.dirname(face.source), "source.jpg")),
      ).toBe(true);
    }
  });
});
