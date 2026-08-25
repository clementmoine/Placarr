import { describe, expect, it } from "vitest";

import {
  NARUTO_CARDDASS_FINISHES,
  narutoCarddassEffectPack,
} from "@/effects/narutoccg";

import { japaneseVolumeForNumber } from "./sources/japaneseVolumes";

import {
  formatNarutoReference,
  listNarutoPrintSets,
  lookupNarutoPrint,
  narutoCandidateCardBackUrl,
  searchNarutoPrints,
} from "./searchPrints";

describe("formatNarutoReference", () => {
  it("prints the number the way a collector reads it off the card", () => {
    expect(formatNarutoReference("s5", "ni232")).toBe("NI-232");
    expect(formatNarutoReference("promo", "te030")).toBe("TE-030");
    expect(formatNarutoReference("s28", "n1621")).toBe("N-1621");
    expect(formatNarutoReference("tin1", "nus0097")).toBe("N-US097");
    expect(formatNarutoReference("s3", "n0097-us")).toBe("N-US097");
    expect(formatNarutoReference("s1", "ni0063")).toBe("NI-063");
    expect(formatNarutoReference("promo", "ni063")).toBe("NI-063");
  });

  it("marks a tourney reprint without inventing a second collector number", () => {
    expect(formatNarutoReference("promo", "ni0063-promo")).toBe(
      "NI-063 · promo",
    );
  });

  it("keeps a variant suffix rather than dropping it", () => {
    // `te030-cdf` is a distinct print, not a stray suffix to normalise away.
    expect(formatNarutoReference("promo", "te030-cdf")).toBe("TE-030-cdf");
    expect(formatNarutoReference("promo", "te0030-cdf")).toBe("TE-030-cdf");
  });

  it("passes through a number it cannot parse instead of mangling it", () => {
    expect(formatNarutoReference("s1", "weird")).toBe("weird");
  });
});

/**
 * Two finishes, on every card. Deriving them from the catalogue rarity denied
 * a collector a copy they physically own (`ta158` is filed `commune` and
 * exists in holo), so rarity stays a fact and never gates the choice.
 */
describe("finishes", () => {
  const finishes = (printKey: string) => lookupNarutoPrint(printKey)?.finishes;

  it("offers plain and holo whatever the catalogue rarity says", () => {
    // holo, commune, and the card that proved the rarity untrustworthy.
    for (const key of [
      "naruto:s1-ni001",
      "naruto:s1-cl001",
      "naruto:s4-ta158",
    ]) {
      expect(finishes(key)).toEqual(["normal", "holo"]);
    }
  });

  it("does not turn a promo into a finish — that is how it was handed out", () => {
    const promo = lookupNarutoPrint("naruto:promo-ni023");
    expect(promo?.rarity).toBe("promo");
    expect(promo?.finishes).toEqual(["normal", "holo"]);
  });

  it("marks the plain finish so the renderer lays no foil over it", () => {
    const candidate = lookupNarutoPrint("naruto:s1-ni001");
    expect(candidate?.plainFinishes).toEqual(["normal"]);
    // Always a subset: a finish the picker offers but the renderer cannot
    // classify would silently render as plain.
    for (const plain of candidate?.plainFinishes ?? []) {
      expect(candidate?.finishes).toContain(plain);
    }
  });

  it("stamps the USA sleeve on CCG prints and leaves Carddass to the pack back", () => {
    expect(narutoCandidateCardBackUrl("n1621", "s28")).toBe(
      "/assets/naruto/carddass/cards/back.en.webp",
    );
    expect(narutoCandidateCardBackUrl("n1650", "s28")).toBe(
      "/assets/naruto/carddass/cards/back.en.webp",
    );
    expect(narutoCandidateCardBackUrl("ni001", "s1")).toBeUndefined();
    expect(lookupNarutoPrint("naruto:s1-ni001")?.effectPack).toBe(
      "naruto-carddass",
    );
  });

  it("carries the foil mask, without which every surface renders it flat", () => {
    // The picker, the tile and the detail page all gate on the candidate
    // having one — the pack fallback is never reached.
    expect(lookupNarutoPrint("naruto:s1-ni001")?.foilMaskUrl).toBe(
      "/assets/naruto/carddass/full_foil_mask.webp",
    );
  });

  it("routes every shiny finish to a shader, so none renders flat", () => {
    for (const finish of NARUTO_CARDDASS_FINISHES) {
      expect(
        narutoCarddassEffectPack.resolveCss(finish, null).finishShaderId,
      ).toBeTruthy();
    }
  });
});

/*
  Une clé de tirage est l'identifiant **exact** d'une carte. Coller
  `naruto:ni-0014` dans la recherche ne rendait pourtant rien : la clause SQL
  comparait la clé à la forme **compacte** de la requête — tirets retirés —
  alors que les clés sont stockées avec leurs tirets.
*/
describe("chercher par clé de tirage", () => {
  it("trouve la carte quand on colle sa clé entière", () => {
    const rows = searchNarutoPrints("naruto:ni-0014", { limit: 10 });
    expect(rows.map((row) => row.printKey)).toContain("naruto:ni-0014");
  });

  /*
    La clé se colle telle qu'elle s'écrit, tirets compris — c'est la forme que
    rend le catalogue et celle que porte l'URL. La variante sans tiret n'est pas
    reconnue, et n'a pas à l'être : personne ne la produit.
  */
  it("rend la carte seule, pas ses voisines de numéro", () => {
    expect(searchNarutoPrints("naruto:ni-0014", { limit: 10 })).toHaveLength(1);
  });

  /*
    La référence telle qu'elle est imprimée reste servie en premier : ce que le
    collectionneur tape le plus souvent ne doit pas régresser.
  */
  it("garde la référence imprimée en tête", () => {
    expect(searchNarutoPrints("ni14", { limit: 5 })[0]?.printKey).toBe(
      "naruto:ni-0014",
    );
    expect(searchNarutoPrints("NI-014", { limit: 5 })[0]?.printKey).toBe(
      "naruto:ni-0014",
    );
    // Coleka FR s24 prints NI-1400 on disk n1400 — substring `%n14%` used to
    // surface it first once that print had a French title.
    expect(
      searchNarutoPrints("ni14", { limit: 5 }).map((row) => row.printKey),
    ).not.toContain("naruto:n-1400");
  });
});

/*
  Parcourir un 巻ノ, c'est demander une découpe que le catalogue ne range pas :
  il compte en séries européennes. Le volume se traduit en bornes de numéros, la
  seule chose qui le définisse, et le SQL filtre là-dessus.
*/
describe("parcourir la découpe japonaise", () => {
  /*
    Les deux découpes sont offertes **ensemble**, quelle que soit la langue.
    Elles ne décrivent pas le même objet — le 巻ノ十 recoupe les séries 4 et 5 —
    donc n'en montrer qu'une revenait à cacher l'autre, et à deviner ce que le
    collectionneur cherchait à ranger.
  */
  it("offers both cuts at once, each under its own name", () => {
    const sets = listNarutoPrintSets();
    expect(sets.map((s) => s.id)).toContain("s1");
    expect(sets.map((s) => s.id)).toContain("maki1");
    const cuts = new Set(sets.map((s) => s.group));
    expect(cuts.size).toBe(2);
    expect(sets.find((s) => s.id === "maki1")?.group).not.toBe(
      sets.find((s) => s.id === "s1")?.group,
    );
  });

  it("does not change what it offers when the language changes", () => {
    expect(listNarutoPrintSets("ja").map((s) => s.id)).toEqual(
      listNarutoPrintSets("fr").map((s) => s.id),
    );
  });

  /*
    Chaque découpe dit dans quelles langues elle a **paru**, ce qui laisse le
    filtre de langue retirer celles qui n'existent pas : aucune Série n'est
    jamais sortie en japonais, aucun 巻ノ en français. C'est un fait sur les
    sorties, pas sur nos données — les cartes du 巻ノ一 ont bien un nom
    français, mais le volume, lui, n'a jamais été vendu en France.
  */
  it("says which languages each set shipped in, one by one", () => {
    const sets = listNarutoPrintSets();
    const langs = (id: string) => sets.find((s) => s.id === id)?.languages;
    /*
      Le français s'arrête à la Série 5 — la 6 fut annulée — puis les séries 7
      à 23 et 25–27 sont anglaises seules. Sage's Legacy (s24) et Storm 3 (s28)
      ont reçu une impression française tardive. Une liste en bloc proposait
      « Quest for Power », le set 7 américain, à qui filtrait sur le français.
    */
    expect(langs("s1")).toEqual(["en", "fr", "it"]);
    expect(langs("s7")).toEqual(["en"]);
    expect(langs("s24")).toEqual(["en", "fr"]);
    expect(langs("s28")).toEqual(["en", "fr"]);
  });

  /*
    L'asymétrie qui compte. Les cartes d'un 巻ノ portent souvent un titre
    français — les mêmes numéros ont été réimprimés dans les séries
    européennes — mais aucun volume n'a été vendu en France. La découpe
    japonaise déclare donc `ja` en dur, quand l'européenne se mesure.
  */
  it("never lets a shared printing make a 巻ノ look French", () => {
    const sets = listNarutoPrintSets();
    for (const set of sets.filter((s) => s.group === "巻ノ (Japon)")) {
      expect(set.languages, set.id).toEqual(["ja"]);
    }
    // …et jamais l'inverse : le japonais est retiré des séries européennes.
    for (const set of sets.filter((s) => s.group === "Séries (Europe / US)")) {
      expect(set.languages ?? [], set.id).not.toContain("ja");
    }
  });

  /*
    Dix codes `maki*` sont écrits dans `set_code` — des cartes qu'une passe
    antérieure avait déjà rangées en volumes. Ils sont à la découpe japonaise,
    que ce module calcule de toute façon : les laisser aussi du côté européen
    donnait le même identifiant dans les deux listes.
  */
  it("never offers the same set under two cuts", () => {
    const ids = listNarutoPrintSets().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const eu = listNarutoPrintSets().filter(
      (s) => s.group === "Séries (Europe / US)",
    );
    expect(eu.some((s) => s.id.startsWith("maki"))).toBe(false);
  });

  it("orders the European series by their number, not by their English name", () => {
    const eu = listNarutoPrintSets()
      .filter((s) => s.group === "Séries (Europe / US)")
      .map((s) => s.id);
    expect(eu.slice(0, 5)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });

  it("orders the volumes by their number, not by their kanji", () => {
    const ids = listNarutoPrintSets()
      .map((s) => s.id)
      .filter((id) => id.startsWith("maki"));
    expect(ids.slice(0, 4)).toEqual(["maki1", "maki2", "maki3", "maki4"]);
  });

  /*
    C'est l'identifiant demandé qui dit la découpe, pas la langue : `maki10` est
    un volume japonais qu'on le cherche en japonais ou non.
  */
  it("reads the cut from the set asked for, not from the language", () => {
    const sansLangue = searchNarutoPrints("", { setId: "maki10", limit: 300 });
    const enFrancais = searchNarutoPrints("", {
      setId: "maki10",
      language: "fr",
      limit: 300,
    });
    expect(sansLangue.length).toBe(81);
    expect(enFrancais.length).toBe(81);
  });

  /*
    Quinze des dix-sept volumes tombent exactement sur le décompte annoncé par
    la source. Les deux autres sont **en dessous** — dix cartes nous manquent,
    nommément `ni-365/366`, `te-322/323`, `ta-303`, `ni-389/390`, `te-342/343`,
    `ta-322` — et c'est un trou de catalogue, pas un défaut du filtre.
  */
  it("matches the source's announced counts where the catalogue is complete", () => {
    const announced: Record<string, number> = {
      maki1: 70,
      maki2: 57,
      maki10: 81,
      maki17: 57,
    };
    for (const [setId, count] of Object.entries(announced)) {
      const rows = searchNarutoPrints("", { setId, limit: 300 });
      expect(rows.length, setId).toBe(count);
    }
  });

  /*
    Les quatre bonus PS1 et les promos réutilisent les numéros de base sans être
    ces cartes. La source les compte à part — « 70種類＋P » — et les inclure
    faisait sortir le 巻ノ一 à 78.
  */
  it("keeps reused numbers out of the volume they borrow from", () => {
    const keys = searchNarutoPrints("", {
      setId: "maki1",
      limit: 300,
    }).map((row) => row.printKey);
    expect(keys).toContain("naruto:ni-0001");
    expect(keys).not.toContain("naruto:ni-0001-ps");
    expect(keys).not.toContain("naruto:ni-0023-promo");
  });
});

/*
  Les six numéros que 巻ノ十 et 巻ノ十一 se disputent. Le déducteur rend `null`
  — on ignore à qui ils sont — mais le parcours les montre **des deux côtés**.
  Ce n'est pas une contradiction : « à quel volume appartient cette carte ? »
  n'a pas de réponse attestée, « quelles cartes ce volume peut-il contenir ? »
  en a une. Les cacher les rendrait introuvables à qui les tient en main.
*/
describe("les numéros que deux volumes se disputent", () => {
  const contested = [234, 235, 236, 237, 238, 239];

  it("shows them under both candidate volumes, never under neither", () => {
    for (const setId of ["maki10", "maki11"]) {
      const keys = new Set(
        searchNarutoPrints("", { setId, limit: 300 }).map(
          (row) => row.printKey,
        ),
      );
      for (const n of contested) {
        expect(keys.has(`naruto:ni-0${n}`), `${setId} ni-0${n}`).toBe(true);
      }
    }
  });

  it("still refuses to name one volume when asked directly", () => {
    for (const n of contested) {
      expect(japaneseVolumeForNumber("ni", n)).toBeNull();
    }
  });
});
