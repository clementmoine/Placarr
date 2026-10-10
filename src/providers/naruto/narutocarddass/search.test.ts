import { describe, expect, it } from "vitest";
import { NARUTO_CARDDASS_FINISHES, narutoCarddassEffectPack } from "@/effects/narutocarddass";
import { narutoSetsUnreleasedInFrench, isNarutoLangPrinted, preferNarutoAppearanceSet } from "./identity";
import { formatNarutoReference, listNarutoPrintSets, listNarutoSetPrints, lookupNarutoPrint, narutoCandidateCardBackUrl, searchNarutoPrints } from "./search";
import { japaneseVolumeForNumber } from "./sources/sealed";

// —— searchPrints ——
{
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
      expect(formatNarutoReference("s1", "ni0019-prerelease")).toBe(
        "NI-019 · prerelease",
      );
    });

    it("prints JA tourney stamps as PR忍 / PR術 (shop / Google form)", () => {
      expect(formatNarutoReference("promo", "ni0065-promo", "ja")).toBe(
        "PR忍-65",
      );
      expect(formatNarutoReference("promo", "ni0284-promo", "ja")).toBe(
        "PR忍-284",
      );
      expect(formatNarutoReference("promo", "te0253-promo", "ja")).toBe(
        "PR術-253",
      );
      expect(formatNarutoReference("promo", "ta0022-promo", "ja")).toBe(
        "PR作-22",
      );
      // Latin FR stays `NI-063 · promo` — European Carddass convention.
      expect(formatNarutoReference("promo", "ni0063-promo", "fr")).toBe(
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

    it("prints the JA card face for ja (Google / Suruga / Mercari)", () => {
      // `NI-349` is a latin transliteration — shops and Google index `忍-349`.
      expect(formatNarutoReference("maki14", "ni0349", "ja")).toBe("忍-349");
      expect(formatNarutoReference("maki1", "ni0003", "ja")).toBe("忍-3");
      expect(formatNarutoReference("maki1", "te0001", "ja")).toBe("術-1");
      expect(formatNarutoReference("promo", "prta0029", "ja")).toBe("PR作-29");
      expect(formatNarutoReference("promo", "prni0013", "ja")).toBe("PR忍-13");
      expect(formatNarutoReference("promo", "prte0001", "ja")).toBe("PR術-1");
      expect(formatNarutoReference("promo", "opni0003", "ja")).toBe("OP忍-3");
      expect(formatNarutoReference("promo", "ni0001-ps", "ja")).toBe(
        "忍-1（PS）",
      );
      // EN CCG has no 忍 face — stay latin even if lang is ja.
      expect(formatNarutoReference("s28", "n1621", "ja")).toBe("N-1621");
      expect(formatNarutoReference("s5", "ni0349", "fr")).toBe("NI-349");
      expect(formatNarutoReference("promo", "can0005", "ja")).toBe("CAN-5");
      expect(formatNarutoReference("promo", "can0006")).toBe("CAN-6");
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
        "naruto:s1-ni0001",
        "naruto:s1-cl0001",
        "naruto:s4-ta0158",
      ]) {
        expect(finishes(key)).toEqual(["normal", "holo"]);
      }
    });

    it("does not turn a promo into a finish — that is how it was handed out", () => {
      const promo = lookupNarutoPrint("naruto:promo-ni0023");
      expect(promo?.rarity).toBe("promo");
      expect(promo?.finishes).toEqual(["normal", "holo"]);
    });

    it("falls back to the retail face when the promo stub has no art", () => {
      const promo = lookupNarutoPrint("naruto:promo-te0034", {
        language: "fr",
      });
      const retail = lookupNarutoPrint("naruto:s1-te0034", { language: "fr" });
      expect(promo?.title).toMatch(/Cataracte/i);
      expect(promo?.imageUrl).toBeTruthy();
      expect(promo?.imageUrl).toBe(retail?.imageUrl);
      expect(promo?.imageUrl).toContain("/jutsu/te0034/fr/");
      expect(promo?.printKey).toMatch(/promo/i);
    });

    it("marks the plain finish so the renderer lays no foil over it", () => {
      const candidate = lookupNarutoPrint("naruto:s1-ni0001");
      expect(candidate?.plainFinishes).toEqual(["normal"]);
      // Always a subset: a finish the picker offers but the renderer cannot
      // classify would silently render as plain.
      for (const plain of candidate?.plainFinishes ?? []) {
        expect(candidate?.finishes).toContain(plain);
      }
    });

    /*
      術-192/348/358 : la cardlist officielle publie deux illustrations d'un
      même numéro (GIF double). Une seule identité — l'illustration B est une
      variante de la copie, avec son propre visuel, pas un second tirage.
    */
    it("offers every finish in illustration B for a double-illustration print", () => {
      // TE-192 is the double-illustration card still present in the index.
      const ja = lookupNarutoPrint("naruto:maki10-te0192", { language: "ja" });
      expect(ja?.finishes).toEqual([
        "normal",
        "holo",
        "normal (illustration B)",
        "holo (illustration B)",
      ]);
      expect(ja?.plainFinishes).toEqual(["normal", "normal (illustration B)"]);
      expect(ja?.variantImageUrls).toEqual({
        "normal (illustration B)": expect.stringContaining(
          "/jutsu/te0192/ja/art.carddas-b.png",
        ),
        "holo (illustration B)": expect.stringContaining(
          "/jutsu/te0192/ja/art.carddas-b.png",
        ),
      });
    });

    it("leaves the neighbouring prints on the single finish axis", () => {
      // TE-358 n'existe qu'en JA (巻ノ十七) — c'est le voisin qui témoin.
      const plain = lookupNarutoPrint("naruto:maki17-te0359", { language: "ja" });
      expect(plain?.finishes).toEqual(["normal", "holo"]);
      expect(plain?.variantImageUrls).toBeUndefined();
    });

    it("stamps the USA sleeve on CCG prints and leaves Carddass to the pack back", () => {
      expect(narutoCandidateCardBackUrl("n1621", "s28")).toBe(
        "/assets/naruto/carddass/cards/back.en.webp",
      );
      expect(narutoCandidateCardBackUrl("n1650", "s28")).toBe(
        "/assets/naruto/carddass/cards/back.en.webp",
      );
      expect(narutoCandidateCardBackUrl("ni001", "s1")).toBeUndefined();
      expect(lookupNarutoPrint("naruto:s1-ni0001")?.effectPack).toBe(
        "naruto-carddass",
      );
    });

    /*
      PR-060 « Clash » est une carte paysage dont la face affichée (scan Drive)
      est couchée : un quart de tour vient du relevé éditorial, pas des pixels.
    */
    it("rotates the landscape Clash promo whose displayed scan lies on its side", () => {
      const clash = lookupNarutoPrint("naruto:promo-pr0060", { language: "en" });
      expect(clash?.landscapePrint).toBe(true);
      expect(clash?.faceQuarterTurns).toBe(1);
    });

    it("leaves ordinary portrait promos upright", () => {
      const plain = lookupNarutoPrint("naruto:promo-pr0061", { language: "en" });
      expect(plain?.faceQuarterTurns).toBeUndefined();
      expect(plain?.landscapeFace).toBeUndefined();
      expect(plain?.landscapePrint).toBeUndefined();
    });

    it("carries the foil mask, without which every surface renders it flat", () => {
      // The picker, the tile and the detail page all gate on the candidate
      // having one — the pack fallback is never reached.
      expect(lookupNarutoPrint("naruto:s1-ni0001")?.foilMaskUrl).toBe(
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
    `naruto:s1-ni0014` dans la recherche ne rendait pourtant rien : la clause SQL
    comparait la clé à la forme **compacte** de la requête — tirets retirés —
    alors que les clés sont stockées avec leurs tirets.
  */
  describe("chercher par clé de tirage", () => {
    it("trouve la carte quand on colle sa clé entière", () => {
      const rows = searchNarutoPrints("naruto:s1-ni0014", { limit: 10 });
      expect(rows.map((row) => row.printKey)).toContain("naruto:s1-ni0014");
    });

    /*
      Checklist papier : NI-049 = S1 **et** S5 — deux clés set-scoped distinctes.
    */
    it("liste NI-049 dans S1 et S5 via clés set-scoped", () => {
      expect(
        listNarutoSetPrints({ setId: "s1", language: "fr" }).some(
          (row) => row.printKey === "naruto:s1-ni0049",
        ),
      ).toBe(true);
      expect(
        listNarutoSetPrints({ setId: "s5", language: "fr" }).some(
          (row) => row.printKey === "naruto:s5-ni0049",
        ),
      ).toBe(true);
    });

    /*
      Starters S2 annoncent des reprints S1 (ex. NI-008). « Série 2 complète »
      doit les exiger aussi — mintés `s2-ni0008` (garantie deck).
    */
    it("includes S1 reprints that S2 starters guarantee in the S2 checklist", () => {
      const s2 = listNarutoSetPrints({ setId: "s2", language: "fr" });
      const keys = new Set(s2.map((row) => row.printKey));
      // Sceller le Maléfice reprints from S1
      expect(keys.has("naruto:s2-ni0008")).toBe(true);
      expect(keys.has("naruto:s2-ni0027")).toBe(true);
      // Détruire Konoha reprints from S1
      expect(keys.has("naruto:s2-ni0014")).toBe(true);
      expect(keys.has("naruto:s2-ni0054")).toBe(true);
    });

    it("lists TA-074 on S2 (deck) and S3 (booster pool reprint, paper poster)", () => {
      expect(
        listNarutoSetPrints({ setId: "s2", language: "fr" }).some(
          (row) => row.printKey === "naruto:s2-ta0074",
        ),
      ).toBe(true);
      expect(
        listNarutoSetPrints({ setId: "s3", language: "fr" }).some(
          (row) => row.printKey === "naruto:s3-ta0074",
        ),
      ).toBe(true);
    });

    it("returns distinct set-scoped keys for TA-074 without set filter", () => {
      const retail = searchNarutoPrints("TA-074", {
        language: "fr",
        limit: 20,
      }).filter((row) => /^naruto:s[23]-ta0074$/.test(row.printKey));
      expect(retail.map((row) => row.printKey).sort()).toEqual([
        "naruto:s2-ta0074",
        "naruto:s3-ta0074",
      ]);
      expect(retail.find((row) => row.setCode === "s2")?.setLabel).toMatch(
        /Series 2|Série 2/i,
      );
      expect(retail.find((row) => row.setCode === "s3")?.setLabel).toMatch(
        /Series 3|Série 3/i,
      );
    });

    it("stamps setCode/setLabel to the filtered series for multi-set reprints", () => {
      const row = searchNarutoPrints("TA-074", {
        setId: "s3",
        language: "fr",
        limit: 20,
      }).find((r) => r.printKey === "naruto:s3-ta0074");
      expect(row?.setCode).toBe("s3");
      expect(row?.setLabel).toMatch(/Series 3|Série 3/i);
    });

    it("finds deck-only S4 reprints in set-filtered search (picker)", () => {
      // NI-050 = garantie starter S4, souvent hors `print_sets` → SQL seul rate.
      expect(
        searchNarutoPrints("NI-050", {
          setId: "s4",
          language: "fr",
          limit: 20,
        }).map((row) => row.printKey),
      ).toContain("naruto:s4-ni0050");
      expect(
        searchNarutoPrints("", {
          setId: "s4",
          language: "fr",
          limit: 5000,
        }).some((row) => row.printKey === "naruto:s4-ni0050"),
      ).toBe(true);
    });

    it("no longer exposes Italian as a catalogue language", () => {
      const rows = listNarutoSetPrints({ setId: "s1", language: "it" });
      expect(rows).toEqual([]);
    });

    /*
      Promo FR mélange shuriken Carddass (`NI-023 · promo`) et PR EU CCG à texte
      français (Day One PR-095, duopack PR-096, PR-100). Un filtre ligne
      carddass-fr les excluait toutes — le préfixe `pr` est classé en-ccg.
    */
    it("lists FR-titled EU CCG PRs alongside Carddass shuriken in Promo", () => {
      const rows = listNarutoSetPrints({ setId: "promo", language: "fr" });
      const keys = new Set(rows.map((row) => row.printKey));
      expect(keys.has("naruto:promo-ni0023")).toBe(true);
      expect(keys.has("naruto:promo-pr0095")).toBe(true);
      expect(keys.has("naruto:promo-pr0096")).toBe(true);
      expect(keys.has("naruto:promo-pr0100")).toBe(true);
      // S6 inserts are Série 6 — not Promo twins.
      expect(keys.has("naruto:promo-ni0232")).toBe(false);
      expect(keys.has("naruto:promo-ta0221")).toBe(false);
      expect(rows.every((row) => row.language === "fr")).toBe(true);
    });

    it("lists Kana S6 FR inserts in a separate s6 chapter, not folded into S5", () => {
      const s6 = listNarutoSetPrints({ setId: "s6", language: "fr" });
      const s6Keys = new Set(s6.map((row) => row.printKey));
      expect(
        listNarutoPrintSets().find((set) => set.id === "s6")?.languages ?? [],
      ).toContain("fr");

      const chapter = [
        "naruto:s6-ni0232",
        "naruto:s6-ni0236",
        "naruto:s6-ni0252",
        "naruto:s6-ni0253",
        "naruto:s6-ta0221",
        "naruto:s6-ta0226",
        "naruto:s6-ta0227", // MIJ reprint (pas les autres blister S5)
      ] as const;
      expect(s6).toHaveLength(chapter.length);
      for (const key of chapter) {
        expect(s6Keys.has(key)).toBe(true);
        const row = s6.find((r) => r.printKey === key);
        expect(row?.setCode).toBe("s6");
        expect(row?.setLabel).toMatch(/Series 6|Série 6/i);
        expect(row?.language).toBe("fr");
      }

      const s5 = listNarutoSetPrints({ setId: "s5", language: "fr" });
      const s5Keys = new Set(s5.map((row) => row.printKey));
      for (const key of chapter) {
        expect(s5Keys.has(key)).toBe(false);
      }
      // Reprints blister sans MIJ — S5 only
      for (const key of [
        "naruto:s5-ni0206",
        "naruto:s5-ni0239",
        "naruto:s5-ni0240",
        "naruto:s5-ta0214",
        "naruto:s5-ta0219",
        "naruto:s5-te0192",
        "naruto:s5-te0205",
        "naruto:s5-te0207",
      ]) {
        expect(s5Keys.has(key)).toBe(true);
        expect(s6Keys.has(key.replace(":s5-", ":s6-"))).toBe(false);
      }
      expect(s6Keys.has("naruto:s6-ni0268")).toBe(false);
      expect(s6Keys.has("naruto:s6-te0191")).toBe(false);
    });

    it("does not mix CCG M-092 into Carddass Série 3 FR", () => {
      const s3 = listNarutoSetPrints({ setId: "s3", language: "fr" });
      expect(s3.map((row) => row.printKey)).not.toContain("naruto:s3-m0092");
      expect(s3.map((row) => row.printKey)).not.toContain("naruto:s3-n0100");
      const s3en = listNarutoSetPrints({ setId: "s3", language: "en" });
      expect(s3en.map((row) => row.printKey)).toContain("naruto:s3-m0092");
      const tp4 = listNarutoSetPrints({ setId: "tp4", language: "en" });
      expect(tp4.map((row) => row.printKey)).toContain("naruto:tp4-m0092");
    });

    it("lists Tempête approche reprints as s11 FR, not s24/s28", () => {
      const rows = listNarutoSetPrints({ setId: "s11", language: "fr" });
      // Coleka `_r16963` = 33 reprints; FR titles expand onto `s11-*` keys.
      expect(rows).toHaveLength(33);
      expect(rows.every((row) => row.printKey.startsWith("naruto:s11-"))).toBe(
        true,
      );
      expect(rows.some((row) => row.printKey.includes("-n135"))).toBe(false);
      expect(listNarutoPrintSets().find((s) => s.id === "s11")).toMatchObject({
        label: "S11 — Série 11 — La Tempête Approche",
        languages: ["en", "fr"],
      });
      expect(listNarutoPrintSets("en").find((s) => s.id === "s1")).toMatchObject({
        label: "S1 — Series 1 — The Path to Hokage",
      });
      expect(listNarutoPrintSets("en").find((s) => s.id === "s6")).toMatchObject({
        label: "S6 — Series 6 — Eternal Rivalry",
      });
      expect(listNarutoPrintSets("en").find((s) => s.id === "s24")).toMatchObject({
        label: "S24 — Series 24 — Sage's Legacy",
      });
      expect(listNarutoPrintSets("en").find((s) => s.id === "promo")).toMatchObject({
        label: "PROMO — Promo (off-series)",
      });
      expect(listNarutoPrintSets("fr").find((s) => s.id === "prerelease")).toMatchObject({
        label: "PRERELEASE — Prerelease (manga)",
        languages: ["fr"],
        sortKey: 0,
      });
      expect(listNarutoPrintSets("it").find((s) => s.id === "s1")).toBeUndefined();
    });

    it("lists manga prerelease cards under the prerelease series, not S1", () => {
      const prerelease = listNarutoSetPrints({ setId: "prerelease", language: "fr" });
      expect(prerelease.length).toBe(10);
      expect(
        prerelease.every((row) => row.printKey.startsWith("naruto:prerelease-")),
      ).toBe(true);
      const s1 = listNarutoSetPrints({ setId: "s1", language: "fr" });
      expect(
        s1.some((row) => row.printKey.startsWith("naruto:prerelease-")),
      ).toBe(false);
    });

    /*
      La clé se colle telle qu'elle s'écrit — une appartenance, pas les voisines.
    */
    it("rend la carte seule, pas ses voisines de numéro", () => {
      const rows = searchNarutoPrints("naruto:s1-ni0014", { limit: 10 });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(new Set(rows.map((row) => row.printKey))).toEqual(
        new Set(["naruto:s1-ni0014"]),
      );
    });

    /*
      La référence telle qu'elle est imprimée reste servie en premier : ce que le
      collectionneur tape le plus souvent ne doit pas régresser.
    */
    it("garde la référence imprimée en tête", () => {
      const first = searchNarutoPrints("ni14", { limit: 5 })[0]?.printKey;
      expect(first).toMatch(/^naruto:(s\d+|maki\d+)-ni0014$/);
      expect(searchNarutoPrints("NI-014", { limit: 5 })[0]?.printKey).toMatch(
        /^naruto:(s\d+|maki\d+)-ni0014$/,
      );
      // Coleka FR s24 prints NI-1400 on disk n1400 — substring `%n14%` used to
      // surface it first once that print had a French title.
      expect(
        searchNarutoPrints("ni14", { limit: 5 }).map((row) => row.printKey),
      ).not.toContain("naruto:s24-n1400");
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
        Le français retail s'arrête à la Série 5 ; la S6 retail est annulée —
        inserts Kana (MIJ 2008) = chapitre checklist `s6` FR (pas le retail).
        Les séries 7 à 23 et 25–27 sont anglaises seules. Sage's Legacy (s24) et
        Storm 3 (s28) ont reçu une impression française tardive.
      */
      expect(langs("s1")).toEqual(["en", "fr"]);
      expect(langs("s6")).toEqual(["en", "fr"]);
      expect(langs("s7")).toEqual(["en"]);
      expect(langs("s24")).toEqual(["en", "fr"]);
      expect(langs("s28")).toEqual(["en", "fr"]);
      expect(langs("s11")).toEqual(["en", "fr"]);
      expect(langs("tp4")).toEqual(["en"]);
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
      expect(eu.slice(0, 6)).toEqual([
        "prerelease",
        "s1",
        "s2",
        "s3",
        "s4",
        "s5",
      ]);
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
      // Set-scoped mint attaches every family in the volume bands (NI/TE/TA…).
      expect(sansLangue.length).toBeGreaterThanOrEqual(81);
      expect(enFrancais.length).toBe(sansLangue.length);
    });

    /*
      Volumes mint one set-scoped key per collector in the numeric bands.
      Complete volumes meet the source count; known gaps (maki17) stay below.
    */
    it("matches the source's announced counts where the catalogue is complete", () => {
      expect(searchNarutoPrints("", { setId: "maki1", limit: 300 }).length).toBe(
        70,
      );
      expect(
        searchNarutoPrints("", { setId: "maki10", limit: 300 }).length,
      ).toBeGreaterThanOrEqual(81);
      // Dix cartes manquent encore (ni-365/366…).
      expect(
        searchNarutoPrints("", { setId: "maki17", limit: 300 }).length,
      ).toBeLessThan(57);
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
      expect(keys).toContain("naruto:maki1-ni0001");
      expect(keys).not.toContain("naruto:maki1-ni0001-ps");
      expect(keys).not.toContain("naruto:promo-ni0023");
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
          expect(
            keys.has(`naruto:${setId}-ni0${n}`),
            `${setId} ni-0${n}`,
          ).toBe(true);
        }
      }
    });

    it("still refuses to name one volume when asked directly", () => {
      for (const n of contested) {
        expect(japaneseVolumeForNumber("ni", n)).toBeNull();
      }
    });
  });
}

// —— printed ——
{
  describe("isNarutoLangPrinted", () => {
    it("marks retail S6 French unprinted (inserts pass via ledger exception)", () => {
      expect(isNarutoLangPrinted("s6", "fr")).toBe(false);
      expect(isNarutoLangPrinted("s6", "it")).toBe(true);
      expect(isNarutoLangPrinted("s1", "fr")).toBe(true);
      expect(isNarutoLangPrinted("s28", "fr")).toBe(true);
      expect(isNarutoLangPrinted("s28", "en")).toBe(true);
    });
  });

  describe("preferNarutoAppearanceSet", () => {
    it("does not let an Italian S6 face replace a French retail series", () => {
      expect(preferNarutoAppearanceSet("s2", "s6")).toBe("s2");
      expect(preferNarutoAppearanceSet("s6", "s2")).toBe("s2");
      expect(preferNarutoAppearanceSet("unknown", "s6")).toBe("s6");
      expect(preferNarutoAppearanceSet("s6", "s6")).toBe("s6");
    });
  });

  /*
    Le fait « annulée en France » vit dans le registre (`released: false` + la
    note `cancelled`), et **une seule fois**. Il était aussi codé en dur ici, et
    le filtre de langue s'apprêtait à en faire une troisième copie : deux d'entre
    elles se seraient tues le jour où un autre set subirait le même sort.
  */
  describe("le registre est la seule source", () => {
    it("reads the cancellation from the ledger, not from a hardcoded set id", () => {
      expect([...narutoSetsUnreleasedInFrench()]).toEqual(["s6"]);
      expect(isNarutoLangPrinted("s6", "fr")).toBe(false);
    });

    /*
      Les cartes existent, imprimées en Italie — « Serie 6 — Rivalità Eterna ».
      L'annulation vaut pour le français seul, jamais pour les autres langues.
    */
    it("cancels the French slot only", () => {
      for (const lang of ["it", "en", "ja"]) {
        expect(isNarutoLangPrinted("s6", lang), lang).toBe(true);
      }
    });
  });
}

