import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dataRoot } from "@/lib/runtimeData";

import {
  buildBandaicgEnCardlistLedger,
  buildCarddasJpCardlistLedger,
  loadOfficialChecklistSeed,
  readStagedChecklistPages,
} from "./officialChecklists";
import { NARUTO_PACK_ID } from "../packs";
import { readNarutoCarddassSyncedSource } from "../syncedSources";

const EN_ROW = (printed: string, name: string, rarity: string, pad = "") =>
  `<div class="card_row"><div class="card_col1" title="Card Number">${printed}</div>` +
  `<div class="card_link"><a href="x" class="card_link"${pad}>${name}</a></div>` +
  `<div class="card_col2" title="Card Type">Ninja</div>` +
  `<div class="card_col3" title="Rarity">${rarity}</div></div>`;

const JP_ROW = (mark: string, n: number, name: string, volume: string) =>
  `<tr><td>${mark}-${n}</td>\n<td><a><font color="#000066">${name}</font></a></td>\n<td>${volume}</td></tr>`;

const enSeed = {
  meta: { line: "en-ccg" },
  pages: [
    {
      page: "cardlists_s4.html",
      setCode: "s4",
      timestamp: "20070410010304",
      original: "http://www.bandaicg.com:80/naruto/cardlists_s4.html",
    },
    {
      page: "cardlists_s5.html",
      setCode: "s5",
      timestamp: "20070430044157",
      original: "http://www.bandaicg.com:80/naruto/cardlists_s5.html",
    },
  ],
};

describe("checklist EN bandaicg.com (Wayback)", () => {
  it("donne à chaque carte l'URL Wayback de sa page et garde la première impression", () => {
    const pages = new Map([
      ["cardlists_s4.html", EN_ROW("C-7", "Tsunami", "C")],
      [
        "cardlists_s5.html",
        EN_ROW("C-7", "Tsunami", "C") +
          EN_ROW("J-173", "Severe Leaf Hurricane", "C"),
      ],
    ]);
    const ledger = buildBandaicgEnCardlistLedger(enSeed, pages);
    expect(ledger.cards).toEqual([
      expect.objectContaining({
        number: "c007",
        setCode: "s4",
        name: "Tsunami",
        page: "cardlists_s4.html",
        url: "https://web.archive.org/web/20070410010304/http://www.bandaicg.com:80/naruto/cardlists_s4.html",
      }),
      expect.objectContaining({ number: "j173", setCode: "s5" }),
    ]);
    expect(ledger.source).toBe(
      "https://web.archive.org/web/20070410010304/http://www.bandaicg.com:80/naruto/cardlists_s4.html",
    );
  });

  it("lit la rareté même quand la ligne porte un long balisage (set 12)", () => {
    const pad = ` onmouseover="${"x".repeat(400)}"`;
    const ledger = buildBandaicgEnCardlistLedger(
      {
        meta: {},
        pages: [
          { ...enSeed.pages[0]!, page: "cardlists_s12.php", setCode: "s12" },
        ],
      },
      new Map([
        ["cardlists_s12.php", EN_ROW("N-490", "Naruto Uzumaki", "C", pad)],
      ]),
    );
    expect(ledger.cards[0]).toMatchObject({ number: "n490", rarity: "C" });
  });
});

describe("checklist JP carddas.com (Wayback)", () => {
  const jpSeed = {
    meta: { line: "carddass-jp" },
    pages: [
      {
        page: "cardlist/3rd.shtml",
        fallbackSet: "maki3",
        timestamp: "20121001175057",
        original: "http://www.carddas.com/naruto/cardlist/3rd.shtml",
      },
    ],
    specials: [
      {
        printed: "忍-393",
        number: "ni0393",
        name: "うずまきナルト",
        setCode: "spc2",
        volume: "スペシャルコンボシート2",
        page: "cardlist/card_img/shinobi-393_spc2.gif",
        timestamp: "20071216190435",
        original:
          "http://www.carddas.com/naruto/cardlist/card_img/shinobi-393_spc2.gif",
        attestation: "image",
      },
    ],
  };

  it("prend le set de la page quand le volume n'est pas reconnu, normalise le tilde, ajoute les spéciales", () => {
    const html =
      JP_ROW("依", 1, "イナリ", "巻の参") +
      JP_ROW("術", 349, "金遁・たすけて～の術", "巻ノ参");
    const ledger = buildCarddasJpCardlistLedger(
      jpSeed,
      new Map([["cardlist/3rd.shtml", html]]),
    );
    expect(ledger.cards).toEqual([
      expect.objectContaining({
        number: "cl0001",
        setCode: "maki3",
        url: "https://web.archive.org/web/20121001175057/http://www.carddas.com/naruto/cardlist/3rd.shtml",
      }),
      expect.objectContaining({
        number: "te0349",
        name: "金遁・たすけて〜の術",
      }),
      expect.objectContaining({
        number: "ni0393",
        setCode: "spc2",
        url: "https://web.archive.org/web/20071216190435/http://www.carddas.com/naruto/cardlist/card_img/shinobi-393_spc2.gif",
      }),
    ]);
  });
});

describe("régénération depuis le miroir Wayback local", () => {
  // Vérifié le 2026-11-21 contre les ledgers faits à la main (1 751 EN /
  // 1 010 JP, mêmes set / numéro / nom ; raretés seulement comblées).
  const staging = path.join(dataRoot(), NARUTO_PACK_ID, "staging");
  const hasMirror =
    existsSync(
      path.join(staging, "bandaicg-en", "pages", "cardlists_s1.html"),
    ) &&
    existsSync(
      path.join(
        staging,
        "carddas-jp",
        "www.carddas.com",
        "naruto",
        "cardlist",
        "1st.shtml",
      ),
    );
  const strip = (cards: Array<Record<string, unknown>>) =>
    cards.map((c) => [c.setCode, c.number, c.name].join("|")).sort();

  it.skipIf(!hasMirror)(
    "est idempotente : redonne les cartes du ledger écrit dans data/ (EN + JP)",
    () => {
      const seed = loadOfficialChecklistSeed();
      const pages = readStagedChecklistPages(seed, staging);
      const en = buildBandaicgEnCardlistLedger(
        seed.bandaicgEn,
        pages.bandaicgEn,
      );
      const jp = buildCarddasJpCardlistLedger(seed.carddasJp, pages.carddasJp);
      const previousEn: Array<{ number: string; rarity: string | null }> =
        readNarutoCarddassSyncedSource("bandaicg-en-cardlist.json").cards;
      expect(strip(en.cards)).toEqual(strip(previousEn));
      // Rareté : jamais de valeur changée ; un trou de l'ancien ledger peut
      // être comblé (le parseur lit maintenant les lignes longues du set 12).
      const rarity = new Map(en.cards.map((c) => [c.number, c.rarity]));
      expect(
        previousEn.filter((c) => c.rarity && rarity.get(c.number) !== c.rarity),
      ).toEqual([]);
      expect(strip(jp.cards)).toEqual(
        strip(readNarutoCarddassSyncedSource("carddas-jp-cardlist.json").cards),
      );
      expect(
        en.cards.every((c) => c.url.startsWith("https://web.archive.org/web/")),
      ).toBe(true);
      expect(
        jp.cards.every((c) => c.url.startsWith("https://web.archive.org/web/")),
      ).toBe(true);
    },
  );
});
