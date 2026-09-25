import { describe, expect, it } from "vitest";

import { digitalOnlySetIds } from "./digitalOnly";
import {
  listTcgdexLocalSets,
  searchTcgdexRows,
  tcgdexBlockAwareSortKeys,
  tcgdexEraKey,
  tcgdexSetDisplayLabel,
  tcgdexWithinBlockKind,
} from "./indexStore";

/**
 * Le pack Pokémon a été bâti pour extraire le foil du client TCG Live : son
 * stockage local disait *comment une carte brille*, jamais *comment elle
 * s'appelle*. Mesuré le 2026-08-20 — `cards-index.json` tient 93 777 entrées et
 * **zéro nom**. L'identité venait de l'API, donc chaque recherche sortait sur
 * le réseau.
 *
 * Ces tests s'appuient sur le catalogue moissonné : ils se sautent d'eux-mêmes
 * quand il n'existe pas, plutôt que d'échouer sur une absence de données.
 */
const localSets = listTcgdexLocalSets("fr");
const hasCatalogue = localSets.length > 0;

describe.skipIf(!hasCatalogue)("catalogue Pokémon local", () => {
  it("trouve par nom, sans réseau", () => {
    const rows = searchTcgdexRows("pikachu", { limit: 5 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => /pikachu/i.test(row.name))).toBe(true);
  });

  /*
    Une extension seule est une question complète : c'est ainsi qu'on parcourt
    un set sans savoir quoi y chercher.
  */
  it("parcourt une extension sans mot-clé", () => {
    const browsed = searchTcgdexRows("", {
      setId: localSets[0]!.id,
      limit: 10,
    });
    expect(browsed.length).toBeGreaterThan(0);
    expect(
      browsed.every(
        (row) => row.setId.toLowerCase() === localSets[0]!.id.toLowerCase(),
      ),
    ).toBe(true);
  });

  /*
    Une étagère tient du carton. Les sets 100 % numériques — Pokémon TCG Pocket
    — n'entrent pas au catalogue. Le filtre existait côté recherche distante ;
    la première moisson locale l'a oublié, et « pikachu » a rendu des cartes
    Pocket. Il vit désormais **à la moisson**, pour qu'aucun chemin de lecture
    n'ait à s'en souvenir.
  */
  it("ne garde aucun set exclu (Pocket, Jumbo)", async () => {
    const excluded = await digitalOnlySetIds();
    const kept = localSets.filter((set) => excluded.has(set.id.toLowerCase()));
    expect(kept).toEqual([]);
    // Jumbo is announced remotely but must not linger as « Sans catalogue ».
    expect(excluded.has("jumbo")).toBe(true);
  });

  it("nomme les extensions dans la langue demandée", () => {
    const fr = new Map(listTcgdexLocalSets("fr").map((s) => [s.id, s.label]));
    const en = new Map(listTcgdexLocalSets("en").map((s) => [s.id, s.label]));
    const differing = [...fr.entries()].filter(
      ([id, label]) => en.get(id) && en.get(id) !== label,
    );
    expect(differing.length).toBeGreaterThan(0);
  });

  it("ne liste pas les extensions d'une autre langue (JP hors FR)", () => {
    const frIds = new Set(listTcgdexLocalSets("fr").map((s) => s.id));
    const ja = listTcgdexLocalSets("ja");
    expect(ja.length).toBeGreaterThan(0);
    // JP-only expansions must not pollute the FR checklist as « Sans catalogue ».
    expect(frIds.has("sv1s")).toBe(false);
    expect(frIds.has("m1l")).toBe(false);
    expect(ja.some((s) => s.id === "sv1s" || s.id === "m1l")).toBe(true);
  });

  it("trie par sortie de bloc, puis date dans le bloc (pas de POP au milieu d'EX)", () => {
    const sets = listTcgdexLocalSets("fr");
    const indexOf = (id: string) => sets.findIndex((s) => s.id === id);
    const base1 = indexOf("base1");
    const me01 = indexOf("me01");
    const me055 = indexOf("me05.5");
    const mcdo2011 = indexOf("2011bw");
    expect(base1).toBeGreaterThanOrEqual(0);
    expect(me01).toBeGreaterThan(base1);
    expect(me055).toBeGreaterThan(me01);
    // McDo 2011 (2011) ne doit plus précéder le Set de Base (1999) via « 2011… ».
    if (mcdo2011 >= 0) expect(mcdo2011).toBeGreaterThan(base1);
    expect(sets.find((s) => s.id === "me01")?.sortKey).toEqual(
      expect.any(Number),
    );

    // Bloc EX contigu : aucun set hors ère `ex` entre le 1er et le dernier EX.
    const exSpan = sets
      .map((s, i) => ({ id: s.id, i, era: tcgdexEraKey(s.id) }))
      .filter((row) => row.era === "ex");
    expect(exSpan.length).toBeGreaterThan(2);
    const first = exSpan[0]!.i;
    const last = exSpan[exSpan.length - 1]!.i;
    for (let i = first; i <= last; i++) {
      expect(tcgdexEraKey(sets[i]!.id)).toBe("ex");
    }
    // POP (sorti pendant EX en chrono pur) vient après le bloc EX entier.
    const pop1 = indexOf("pop1");
    if (pop1 >= 0) expect(pop1).toBeGreaterThan(last);

    // Dans un bloc : extensions → promos → énergies.
    const sv = sets
      .map((s, i) => ({ id: s.id, i, era: tcgdexEraKey(s.id) }))
      .filter((row) => row.era === "sv");
    expect(sv.length).toBeGreaterThan(3);
    const svIds = sv.map((row) => row.id);
    const svpAt = svIds.indexOf("svp");
    const sveAt = svIds.indexOf("sve");
    const lastMain = Math.max(
      ...svIds
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => tcgdexWithinBlockKind(id) === "main")
        .map(({ i }) => i),
    );
    if (svpAt >= 0) expect(svpAt).toBeGreaterThan(lastMain);
    if (sveAt >= 0) {
      expect(sveAt).toBe(svIds.length - 1);
      if (svpAt >= 0) expect(sveAt).toBeGreaterThan(svpAt);
    }
  });

  it("libellé = bloc — extension, McDo rattaché à l'ère de l'id", () => {
    const byId = new Map(listTcgdexLocalSets("fr").map((s) => [s.id, s.label]));
    expect(byId.get("sv08.5")).toBe(
      "Écarlate et Violet — Évolutions Prismatiques",
    );
    expect(byId.get("sv08")).toBe(
      "Écarlate et Violet — Étincelles Déferlantes",
    );
    expect(byId.get("2024sv")).toBe(
      "Écarlate et Violet — Collection McDonald's 2024",
    );
    // Set nommé comme son bloc : pas de double.
    expect(byId.get("sv01")).toBe("Écarlate et Violet");
    // « Set de Base » = le bloc lui-même.
    expect(byId.get("base1")).toBe("Base");
    // Préfixe d'ère → tiret cadratin, pas la phrase collée TCGdex.
    expect(byId.get("neo1")).toBe("Neo — Genesis");
    expect(byId.get("ex1")).toBe("EX — Rubis & Saphir");
    expect(byId.get("pop1")).toBe("POP — Série 1");
    expect(byId.get("sve")).toBe("Écarlate et Violet — Énergie");
    // Promos / kits : code d'ère retiré (déjà dans le bloc).
    expect(byId.get("bwp")).toBe("Noir & Blanc — Promo");
    expect(byId.get("swshp")).toBe("Épée et Bouclier — Promo");
    expect(byId.get("tk-bw-z")).toBe(
      "Noir & Blanc — Kit du Dresseur (Zoroark)",
    );
    expect(byId.get("tk-ex-latia")).toBe("EX — Kit du Dresseur (Latias)");
    expect(byId.get("tk-xy-n")).toBe("XY — Kit du Dresseur (Bruyverne)");
    expect(byId.get("tk-hs-g")).toBe(
      "HeartGold SoulSilver — Kit du Dresseur (Léviator)",
    );
    expect(byId.get("xyp")).toBe("XY — Promo");
    expect(byId.get("dpp")).toBe("Diamant & Perle — Promo");
    // Espace manquant côté TCGdex.
    expect(byId.get("me05.5c")).toBe(
      "Méga-Évolution — Collection Classique 30ᵉ Anniversaire",
    );
    // Galerie legacy `swsh9tg` masquée au profit de `swsh9.5tg`.
    expect(byId.has("swsh9tg")).toBe(false);
    expect(byId.get("swsh9.5tg")).toBe(
      "Épée et Bouclier — Stars Étincelantes Galerie de Dresseurs",
    );
  });

  /*
    Le tiret sépare le set du numéro dans une `printKey`. Un identifiant qui en
    contient — `tk-ex-latia`, `P-A` — n'en produit pas, et ces cartes ne sont
    donc adressables par aucun chemin. La moisson les compte à part plutôt que
    de les mêler aux vraies pannes.
  */
  it("ne stocke que des clés de tirage lisibles", () => {
    const rows = searchTcgdexRows("pikachu", { limit: 20 });
    expect(
      rows.every((row) => /^pokemon:[^:]+-[^-]+$/.test(row.printKey)),
    ).toBe(true);
  });
});

describe("tcgdexSetDisplayLabel", () => {
  it("compose bloc — set et dédoublonne", () => {
    expect(
      tcgdexSetDisplayLabel({
        setId: "sv08.5",
        name: "Évolutions Prismatiques",
        serieName: "Écarlate et Violet",
      }),
    ).toBe("Écarlate et Violet — Évolutions Prismatiques");
    expect(
      tcgdexSetDisplayLabel({
        setId: "sv01",
        name: "Écarlate et Violet",
        serieName: "Écarlate et Violet",
      }),
    ).toBe("Écarlate et Violet");
    expect(
      tcgdexSetDisplayLabel({
        setId: "base1",
        name: "Set de Base",
        serieName: "Base",
      }),
    ).toBe("Base");
    expect(
      tcgdexSetDisplayLabel({
        setId: "neo1",
        name: "Neo Genesis",
        serieName: "Neo",
      }),
    ).toBe("Neo — Genesis");
    expect(
      tcgdexSetDisplayLabel({
        setId: "ex1",
        name: "EX Rubis & Saphir",
        serieName: "EX",
      }),
    ).toBe("EX — Rubis & Saphir");
    expect(
      tcgdexSetDisplayLabel({
        setId: "pop1",
        name: "POP Série 1",
        serieName: "POP",
      }),
    ).toBe("POP — Série 1");
  });

  it("retire les codes d'ère redondants des promos et kits", () => {
    expect(
      tcgdexSetDisplayLabel({
        setId: "bwp",
        name: "Promo BW",
        serieName: "Noir & Blanc",
        eraSerie: "Noir & Blanc",
      }),
    ).toBe("Noir & Blanc — Promo");
    expect(
      tcgdexSetDisplayLabel({
        setId: "swshp",
        name: "Promo SWSH",
        serieName: "Épée et Bouclier",
        eraSerie: "Épée et Bouclier",
      }),
    ).toBe("Épée et Bouclier — Promo");
    expect(
      tcgdexSetDisplayLabel({
        setId: "mep",
        name: "MEP Black Star Promos",
        serieName: "Méga-Évolution",
        eraSerie: "Méga-Évolution",
      }),
    ).toBe("Méga-Évolution — Black Star Promos");
    expect(
      tcgdexSetDisplayLabel({
        setId: "svp",
        name: "SVP Black Star Promos",
        serieName: "Écarlate et Violet",
        eraSerie: "Écarlate et Violet",
      }),
    ).toBe("Écarlate et Violet — Black Star Promos");
    expect(
      tcgdexSetDisplayLabel({
        setId: "tk-bw-z",
        name: "BW Kit du dresseur (Zoroark)",
        serieName: "Kits du dresseur",
        eraSerie: "Noir & Blanc",
      }),
    ).toBe("Noir & Blanc — Kit du Dresseur (Zoroark)");
    expect(
      tcgdexSetDisplayLabel({
        setId: "tk-ex-latia",
        name: "EX Kit dresseur (Latias)",
        serieName: "Kits du dresseur",
        eraSerie: "EX",
      }),
    ).toBe("EX — Kit du Dresseur (Latias)");
  });

  it("préfère l'ère observée au seau McDo TCGdex", () => {
    expect(
      tcgdexSetDisplayLabel({
        setId: "2024sv",
        name: "Collection McDonald's 2024",
        serieName: "Collection McDonald's",
        eraSerie: "Écarlate et Violet",
      }),
    ).toBe("Écarlate et Violet — Collection McDonald's 2024");
  });

  it("extrait la clé d'ère des ids principaux, McDo, kits, promos et énergies", () => {
    expect(tcgdexEraKey("sv08.5")).toBe("sv");
    expect(tcgdexEraKey("2024sv")).toBe("sv");
    expect(tcgdexEraKey("2018sm-fr")).toBe("sm");
    expect(tcgdexEraKey("me05.5")).toBe("me");
    expect(tcgdexEraKey("tk-ex-latia")).toBe("ex");
    expect(tcgdexEraKey("tk-xy-n")).toBe("xy");
    expect(tcgdexEraKey("tk-hs-g")).toBe("hgss");
    expect(tcgdexEraKey("bwp")).toBe("bw");
    expect(tcgdexEraKey("swshp")).toBe("swsh");
    expect(tcgdexEraKey("hgssp")).toBe("hgss");
    expect(tcgdexEraKey("sve")).toBe("sv");
    expect(tcgdexEraKey("mee")).toBe("me");
    expect(tcgdexEraKey("exu")).toBe("ex");
    expect(tcgdexEraKey("pop1")).toBe("pop");
    expect(tcgdexEraKey("np")).toBe("np");
    expect(tcgdexEraKey("neo1")).toBe("neo");
  });

  it("classe promos et énergies pour les pousser en fin de bloc", () => {
    expect(tcgdexWithinBlockKind("sv01")).toBe("main");
    expect(tcgdexWithinBlockKind("bwp")).toBe("promo");
    expect(tcgdexWithinBlockKind("svp")).toBe("promo");
    expect(tcgdexWithinBlockKind("sve")).toBe("energy");
    expect(tcgdexWithinBlockKind("mee")).toBe("energy");
    expect(tcgdexWithinBlockKind("tk-ex-latia")).toBe("main");
  });

  it("encode bloc-then-set sort keys without interleaving eras", () => {
    const keys = tcgdexBlockAwareSortKeys([
      { setId: "ex1", releasedAt: "2003-06-18" },
      { setId: "ex2", releasedAt: "2003-09-18" },
      { setId: "pop1", releasedAt: "2004-09-01" },
      { setId: "ex8", releasedAt: "2005-02-01" },
    ]);
    expect(keys.get("ex1")!).toBeLessThan(keys.get("ex2")!);
    expect(keys.get("ex2")!).toBeLessThan(keys.get("ex8")!);
    // pop1 date is between ex2 and ex8, but block order keeps all EX first.
    expect(keys.get("ex8")!).toBeLessThan(keys.get("pop1")!);
  });

  it("places promos then energies after main sets inside a block", () => {
    const keys = tcgdexBlockAwareSortKeys([
      { setId: "sv01", releasedAt: "2023-03-31", name: "Écarlate et Violet" },
      {
        setId: "svp",
        releasedAt: "2023-01-01",
        name: "SVP Black Star Promos",
      },
      { setId: "sve", releasedAt: "2023-03-31", name: "Énergie" },
      {
        setId: "sv02",
        releasedAt: "2023-06-01",
        name: "Évolutions à Paldea",
      },
    ]);
    expect(keys.get("sv01")!).toBeLessThan(keys.get("sv02")!);
    expect(keys.get("sv02")!).toBeLessThan(keys.get("svp")!);
    expect(keys.get("svp")!).toBeLessThan(keys.get("sve")!);
  });
});
