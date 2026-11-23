import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyLeclercFinishes,
  LECLERC_LEDGER_SOURCES,
  leclercCardsByColekaItemOrder,
  leclercFinishRarity,
  leclercOperationFromAnnouncement,
  mergeLeclercChecklistCards,
  syncLeclercLedgers,
  type LeclercLedgerSyncDeps,
} from "./ledgerSync";

const MICRO =
  "https://www.coleka.com/fr/figurines-de-collection/petites-figurines/stikeez-popz/micropopz-star-wars-leclerc";
const LISTING = `${MICRO}_r2836`;
const FIGURINES = [
  "Snowtrooper",
  "Finn",
  "Esprit d&#039;Anakin",
  "Dark Vador",
  "Stormtrooper",
  "Esprit de Yoda",
  "Chewbacca",
  "Rey",
  "Wampa",
  "Amiral Ackbar",
  "Kit Fisto",
  "Max Rebo",
  "Hologramme de l&#039;Empereur",
  "Battle Droid",
  "Dark Maul",
  "Pilote de Tie Fighter",
  "Jawa",
  "Garde Royal de l&#039;Empereur",
  "Yoda",
  "Biker Scout",
  "Jar Jar Binks",
  "C-3PO",
  "Death Star Gunner",
  "Kylo Ren",
  "Esprit d&#039;Obi-Wan",
];

function k5(id: number, title: string, slug: string): string {
  return `<article class="k5" data-id="${id}">
  <a class="k5-lien" href="/fr/figurines-de-collection/petites-figurines/stikeez-popz/micropopz-star-wars-leclerc/${slug}_i${id}">
    <div class="k5-img"><img src="https://thumbs.coleka.com/media/item/201710/23/micropopz-star-wars-leclerc-${slug}_250x250.webp" alt=""></div>
    <div class="k5-corps"><h3>${title}</h3><p>2017</p></div>
  </a></article>`;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&#039;/g, "-")
    .replace(/[^a-z0-9]+/g, "-");
}

/** Listing MicroPopz : 25 figurines (ordre d'affichage ≠ ordre des fiches) + 3 SKU. */
function micropopzListing(count = 25): string {
  const tiles = FIGURINES.slice(0, count).map((name, i) =>
    k5(153671 + i, name, slug(name)),
  );
  tiles.reverse();
  tiles.unshift(k5(761758, "Pochette", "pochette"));
  tiles.push(k5(153696, "Coffret Collector", "coffret-collector"));
  tiles.push(k5(153697, "Cardbox Lunettes VR", "cardbox-lunettes-vr"));
  return `<html><body>${tiles.join("\n")}</body></html>`;
}

function itemPage(price: string): string {
  return `<html>${"x".repeat(400)}<dl><dt>Date de sortie</dt><dd>24 octobre 2017<span class="hid" itemprop="releaseDate">2017-10-24</span></dd><dt>Prix dans le commerce</dt><dd>${price} ()</dd></dl></html>`;
}

const ANNOUNCEMENT = `<html><aside>du 1 janvier au 2 février</aside><article class="post-68946">
<p>Chaque figurine vous sera offerte dans un sachet opaque tous les 30 € d&#8217;achat, du 24 octobre au 9 décembre.</p></article></html>`;

const PANINI = `<div class="g0">
<b>Images Brillantes </b><em>*bri</em><b> : </b>17, 30
</div><div class="g0">
<b>Images Pailletées </b><em>*pail</em><b> : </b>21
</div><div class="d2"><div class="g0">Opération du 3 novembre au 20 décembre 2020<br>
Recevez 1 pochette de 4 images et 2 cartes : par tranche de 30€ d'achats<br>
Album Collector de 50 pages glacées: 1,99€</div></div>`;

function legacyTile(ref: string, name: string, id: number): string {
  return `<li class="col-md-4 col-xs-6 col-lg-3"><a href="/fr/stickers/marvel-2020/${name.toLowerCase()}_i${id}">
  <img src="https://thumbs.coleka.com/media/item/2020/sticker-${ref}_250x250.webp" />
  <h3 class="product-title">${name}</h3><span class="ref">Ref. ${ref}</span></a></li>`;
}

function tmpDeps(
  pages: Record<string, string | null>,
  extra: Partial<LeclercLedgerSyncDeps> = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), "leclerc-ledgers-"));
  const sources = path.join(root, "sources");
  mkdirSync(sources, { recursive: true });
  const requested: string[] = [];
  const deps: Partial<LeclercLedgerSyncDeps> = {
    fetchColekaPage: async (url) => {
      requested.push(url);
      const html = pages[url];
      return html ? { html, citationUrl: url } : null;
    },
    fetchPaninimania: async (url) => pages[url] ?? null,
    fetchText: async (url) => pages[url] ?? null,
    stagingDir: (setCode) => path.join(root, setCode, "staging"),
    readSource: (name) => path.join(sources, name),
    writeSource: (name) => path.join(sources, name),
    today: () => "2026-11-22",
    ...extra,
  };
  const read = (name: string) =>
    JSON.parse(readFileSync(path.join(sources, name), "utf8"));
  return { root, sources, deps, read, requested };
}

describe("leclercFinishRarity", () => {
  it("dérive le slug de finition du libellé Paninimania", () => {
    expect(leclercFinishRarity("Images Brillantes")).toBe("brillante");
    expect(leclercFinishRarity("Images Pailletées")).toBe("pailletee");
    expect(leclercFinishRarity("Images Argentées")).toBe("argentee");
  });
});

describe("leclercCardsByColekaItemOrder", () => {
  it("numérote par ordre de fiche, hors SKU scellés, seulement si complet", () => {
    const items = [
      {
        id: "12",
        href: "/x/b_i12",
        title: "B",
        ref: null,
        thumbUrl: "https://thumbs.coleka.com/media/item/b_250x250.webp",
      },
      { id: "11", href: "/x/a_i11", title: "A", ref: null, thumbUrl: null },
      {
        id: "99",
        href: "/x/pochette_i99",
        title: "Pochette",
        ref: null,
        thumbUrl: null,
      },
    ];
    const cards = leclercCardsByColekaItemOrder(items, {
      excludeHrefs: ["https://www.coleka.com/x/pochette_i99"],
      expectedCount: 2,
    });
    expect(cards).toEqual([
      {
        number: "001",
        name: "A",
        kind: "card",
        href: "https://www.coleka.com/x/a_i11",
      },
      {
        number: "002",
        name: "B",
        kind: "card",
        href: "https://www.coleka.com/x/b_i12",
        faceUrl: "https://thumbs.coleka.com/media/item/b.webp",
      },
    ]);
    expect(
      leclercCardsByColekaItemOrder(items, {
        excludeHrefs: [],
        expectedCount: 2,
      }),
    ).toBeNull();
  });
});

describe("merge + finitions", () => {
  it("garde les cartes non relues ; les finitions relues font foi", () => {
    const merged = mergeLeclercChecklistCards(
      [
        { number: "001", name: "OLD", rarity: "brillante", aka: ["x"] },
        { number: "c01", name: "HULK", rarity: "stale" },
      ],
      [{ number: "001", name: "GAMORA", href: "h" }],
    );
    expect(merged).toEqual([
      {
        number: "001",
        name: "GAMORA",
        href: "h",
        aka: ["x"],
        rarity: "brillante",
      },
      { number: "c01", name: "HULK", rarity: "stale" },
    ]);
    const finished = applyLeclercFinishes(
      merged,
      [{ label: "Images Pailletées", code: "pail", numbers: ["1"] }],
      (raw) => raw.padStart(3, "0"),
    );
    expect(finished.map((c) => [c.number, c.rarity])).toEqual([
      ["001", "pailletee"],
      ["c01", undefined],
    ]);
  });
});

describe("leclercOperationFromAnnouncement", () => {
  it("lit la période dans l'article (pas la barre latérale), année de l'URL", () => {
    expect(
      leclercOperationFromAnnouncement(
        ANNOUNCEMENT,
        "https://www.mintinbox.net/2017/10/16/leclerc-star-wars-micropopz/",
      ),
    ).toEqual({
      start: "2017-10-24",
      end: "2017-12-09",
      thresholdEur: 30,
      source:
        "https://www.mintinbox.net/2017/10/16/leclerc-star-wars-micropopz/",
    });
  });
});

describe("LECLERC_LEDGER_SOURCES", () => {
  it("déclare des pages publiques profondes (jamais une page d'accueil)", () => {
    expect(Object.keys(LECLERC_LEDGER_SOURCES).sort()).toEqual([
      "marvel20",
      "sw17",
      "sw19",
    ]);
    for (const spec of Object.values(LECLERC_LEDGER_SOURCES)) {
      for (const url of [
        spec.paninimania,
        spec.announcement,
        spec.numberingSource?.url,
        ...(spec.sealed?.products.map((p) => p.colekaItem) ?? []),
      ]) {
        if (!url) continue;
        const u = new URL(url);
        expect(u.pathname.length + u.search.length).toBeGreaterThan(2);
        // Une image nue n'est pas une citation ouvrable : on cite la page.
        expect(u.pathname).not.toMatch(/\.(?:jpe?g|png|webp)$/i);
      }
    }
  });
});

describe("syncLeclercLedgers — sw17 (fiches sans Ref.)", () => {
  const pages = {
    [LISTING]: micropopzListing(),
    [`${MICRO}/coffret-collector_i153696`]: itemPage("1,99 €"),
    [`${MICRO}/cardbox-lunettes-vr_i153697`]: itemPage("2,99 €"),
    "https://www.mintinbox.net/2017/10/16/leclerc-star-wars-micropopz/":
      ANNOUNCEMENT,
  };

  it("produit checklist, bloc CDN et scellés sourcés", async () => {
    const { deps, read, sources, requested } = tmpDeps(pages);
    writeFileSync(
      path.join(sources, "coleka-cdn-faces.json"),
      JSON.stringify({
        source: "s",
        sourceId: "coleka",
        lang: "fr",
        sets: { marvel21: { "001": "u" } },
      }),
    );
    const report = await syncLeclercLedgers("sw17", deps);
    expect(report?.skipped).toEqual([]);

    const checklist = read("leclerc-sw17-checklist.json");
    expect(checklist.url).toBe(LISTING);
    expect(checklist.set).toEqual({
      code: "sw17",
      label: "2017 Star Wars: MicroPopz",
      year: 2017,
      franchise: "Star Wars",
    });
    expect(checklist.cards).toHaveLength(25);
    expect(checklist.cards[0]).toEqual({
      number: "001",
      name: "Snowtrooper",
      kind: "card",
      href: `${MICRO}/snowtrooper_i153671`,
    });
    expect(checklist.cards[12].name).toBe("Hologramme de l'Empereur");
    expect(checklist.cards[24].number).toBe("025");
    expect(checklist.numbering).toMatchObject({ printed: false });
    expect(checklist.operation).toMatchObject({
      start: "2017-10-24",
      end: "2017-12-09",
      thresholdEur: 30,
      packSize: 1,
      albumEur: 1.99,
    });
    expect(checklist.operation.sources.albumEur).toBe(
      `${MICRO}/coffret-collector_i153696`,
    );

    const cdn = read("coleka-cdn-faces.json");
    expect(cdn.sets.marvel21).toEqual({ "001": "u" });
    expect(Object.keys(cdn.sets.sw17)).toHaveLength(25);
    expect(cdn.sets.sw17["001"]).toBe(
      "https://thumbs.coleka.com/media/item/201710/23/micropopz-star-wars-leclerc-snowtrooper.webp",
    );

    const sealed = read("leclerc-sw17-sealed.json");
    expect(sealed).toMatchObject({
      sourceId: "leclerc",
      lang: "fr",
      setCode: "sw17",
      observed: "2026-11-22",
    });
    const bySlug = Object.fromEntries(
      sealed.products.map((p: { slug: string }) => [p.slug, p]),
    );
    expect(bySlug["collector-album"]).toMatchObject({
      name: "Coffret Collector Faucon Millenium — Star Wars MicroPopz",
      declaredCardCount: 25,
      priceCents: 199,
      packComposition: "none",
      citations: { priceCents: `${MICRO}/coffret-collector_i153696` },
    });
    expect(bySlug.pochette).toMatchObject({
      cardsPerPack: 1,
      priceCents: null,
    });
    expect(bySlug["lunettes-vr"]).toMatchObject({
      kind: "ephemera",
      priceCents: 299,
    });
    // La fiche pochette n'est pas relue pour son prix (offerte, pas vendue).
    expect(requested).not.toContain(`${MICRO}/pochette_i761758`);
  });

  it("n'écrit pas de checklist quand le listing est incomplet", async () => {
    const { deps, sources } = tmpDeps({
      ...pages,
      [LISTING]: micropopzListing(24),
    });
    const report = await syncLeclercLedgers("sw17", deps);
    expect(report?.checklist).toBeNull();
    expect(report?.skipped[0]).toMatch(/incomplet/);
    expect(existsSync(path.join(sources, "leclerc-sw17-checklist.json"))).toBe(
      false,
    );
    expect(existsSync(path.join(sources, "coleka-cdn-faces.json"))).toBe(false);
  });

  it("garde un prix attesté quand la fiche ne se relit pas", async () => {
    const { deps, sources, read } = tmpDeps({
      ...pages,
      [`${MICRO}/coffret-collector_i153696`]: null,
    });
    writeFileSync(
      path.join(sources, "leclerc-sw17-sealed.json"),
      JSON.stringify({
        products: [{ slug: "collector-album", priceCents: 199 }],
      }),
    );
    const report = await syncLeclercLedgers("sw17", deps);
    expect(report?.skipped).toContain("fiche collector-album illisible");
    const sealed = read("leclerc-sw17-sealed.json");
    expect(sealed.products[0].priceCents).toBe(199);
  });
});

describe("syncLeclercLedgers — marvel20 (Ref. + finitions Paninimania)", () => {
  const PANINI_URL = LECLERC_LEDGER_SOURCES.marvel20!.paninimania!;

  it("checklist depuis les dumps staging + finitions Paninimania", async () => {
    const { deps, root, read } = tmpDeps({ [PANINI_URL]: PANINI });
    const staging = path.join(root, "marvel20", "staging");
    mkdirSync(staging, { recursive: true });
    writeFileSync(
      path.join(staging, "listing-nbpp.html"),
      [
        legacyTile("001", "GAMORA", 1),
        legacyTile("017", "BLACK", 17),
        legacyTile("021", "VISION", 21),
      ].join("\n"),
    );
    const report = await syncLeclercLedgers("marvel20", deps);
    expect(report?.checklist).toMatchObject({ cards: 3, rarities: 2 });
    const checklist = read("leclerc-marvel20-checklist.json");
    expect(
      checklist.cards.map((c: { number: string; rarity?: string }) => [
        c.number,
        c.rarity,
      ]),
    ).toEqual([
      ["001", undefined],
      ["017", "brillante"],
      ["021", "pailletee"],
    ]);
    expect(checklist.raritySource).toMatchObject({
      url: PANINI_URL,
      fetchedAt: "2026-11-22",
    });
    expect(checklist.operation).toMatchObject({
      start: "2020-11-03",
      end: "2020-12-20",
      packSize: 4,
      thresholdEur: 30,
      albumEur: 1.99,
      albumTitle: "Deviens un Héros",
      source: PANINI_URL,
    });
  });

  it("Paninimania injoignable : finitions déjà attestées inchangées", async () => {
    const { deps, sources, read } = tmpDeps({});
    writeFileSync(
      path.join(sources, "leclerc-marvel20-checklist.json"),
      JSON.stringify({
        source: "s",
        url: "u",
        set: { code: "marvel20" },
        raritySource: { url: PANINI_URL, fetchedAt: "2026-11-22", note: "n" },
        cards: [{ number: "017", name: "BLACK", rarity: "brillante" }],
      }),
    );
    const report = await syncLeclercLedgers("marvel20", deps);
    expect(report?.skipped).toContain(
      "Paninimania injoignable — finitions inchangées",
    );
    // Rien de relu : le ledger n'est pas réécrit.
    expect(report?.checklist).toBeNull();
    expect(read("leclerc-marvel20-checklist.json").cards[0].rarity).toBe(
      "brillante",
    );
  });

  it("hors liste déclarée : pas d'étape", async () => {
    expect(await syncLeclercLedgers("marvel21", tmpDeps({}).deps)).toBeNull();
  });
});
