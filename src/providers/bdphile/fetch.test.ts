import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  composeBdphileIssueTitle,
  fetchBdphileIssueById,
  fetchBdphileIssueByUrl,
  fetchBdphileMetadata,
  parseBdphileFormatField,
  parseBdphileIssuePage,
  parseBdphileRevueIndexPage,
  parseBdphileRevueIssueLinks,
  pickBdphileIssueLink,
  rankBdphileRevues,
  resetBdphileRevueIndexCache,
} from "./fetch";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

const REVUES = [
  { id: "3", label: "Super Picsou Géant" },
  { id: "4", label: "Super Picsou Géant bis" },
  { id: "469", label: "Super Picsou Geant Hors série" },
  { id: "14", label: "Picsou magazine" },
];

function revueIndexHtml() {
  return REVUES.map(
    (revue) =>
      `<a href="https://www.bdphile.fr/revue/view/${revue.id}/">${revue.label}</a>`,
  ).join("\n");
}

function revueBisListingHtml() {
  return `
    <a href="https://www.bdphile.fr/revue/numero/298/" title="Numéro 65" class="tooltip"><img src="data/revue-298-200.jpg" /></a>
    <a href="https://www.bdphile.fr/revue/numero/308/" title="Numéro 100" class="tooltip"><img src="data/revue-308-200.jpg" /></a>
  `;
}

function issue308Html() {
  return `
    <title>Super Picsou Géant bis Numéro 100 | Bdphile</title>
    <img src="https://static.bdphile.fr/data/revue-308-200.jpg" alt="" class="cover" />
    <a href="https://static.bdphile.fr/images/media/revue/308.jpg">zoom</a>
    <dt>Date de parution</dt><dd>juin 1980</dd>
    <dt>Éditeur</dt><dd></dd>
    <dt>Format</dt><dd>242 pages - 4.9€</dd>
    <dt>ISSN</dt><dd>0242-1234</dd>
    <dt>Périodicité</dt><dd>Mensuelle</dd>
    <h2>Description</h2><div>Sommaire:<br/>-1 Donald contre Fantomiald !</div>
    <h3>Rechercher un numéro</h3>
  `;
}

describe("bdphile fetch", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    resetBdphileRevueIndexCache();
  });

  it("parse l'index des revues (nom + id)", () => {
    expect(parseBdphileRevueIndexPage(revueIndexHtml())).toEqual(REVUES);
  });

  it("cloisonne les revues sœurs bis/hors-série par forme de numérotation", () => {
    // La revue « bis » (forme exacte de la demande) passe devant la principale,
    // qui reste en repli au cas où elle labelliserait « Numéro 100 Bis ».
    expect(
      rankBdphileRevues("Super Picsou Géant n°100bis", REVUES).map(
        (revue) => revue.id,
      ),
    ).toEqual(["4", "3"]);

    expect(rankBdphileRevues("Super Picsou Géant n°7", REVUES)[0]?.id).toBe(
      "3",
    );
    expect(
      rankBdphileRevues("Super Picsou Géant n°7", REVUES).map((r) => r.id),
    ).not.toContain("4");

    expect(
      rankBdphileRevues(
        "Super Picsou Géant - Hors-Série - Picsou - Tome 1",
        REVUES,
      ).map((revue) => revue.id),
    ).toEqual(["469"]);
  });

  it("ne rattache pas Bakuman à Batman / Bat Man (faux ami Levenshtein)", () => {
    const falseFriends = [
      { id: "1", label: "Batman" },
      { id: "2", label: "Bat Man" },
      { id: "3", label: "Blackman" },
    ];
    expect(rankBdphileRevues("Bakuman n°01", falseFriends)).toEqual([]);
  });

  it("résout le numéro numérique dans une revue suffixée (100bis → Numéro 100)", () => {
    const links = parseBdphileRevueIssueLinks(revueBisListingHtml());
    expect(links).toEqual([
      {
        numeroId: "298",
        path: "https://www.bdphile.fr/revue/numero/298/",
        issueNumber: "65",
        horsSerie: false,
      },
      {
        numeroId: "308",
        path: "https://www.bdphile.fr/revue/numero/308/",
        issueNumber: "100",
        horsSerie: false,
      },
    ]);

    expect(
      pickBdphileIssueLink(
        links,
        "Super Picsou Géant n°100bis",
        "Super Picsou Géant bis",
      )?.numeroId,
    ).toBe("308");
    // Sans le suffixe replié, aucun numéro ne colle.
    expect(
      pickBdphileIssueLink(
        links,
        "Super Picsou Géant n°100bis",
        "Super Picsou Géant",
      ),
    ).toBeNull();
  });

  it("un « Numéro HS 5 » ne matche jamais une demande n°5 ordinaire", () => {
    const links = parseBdphileRevueIssueLinks(`
      <a href="https://www.bdphile.fr/revue/numero/900/" title="Numéro HS 5"><img src="x.jpg" /></a>
      <a href="https://www.bdphile.fr/revue/numero/901/" title="Numéro 5"><img src="y.jpg" /></a>
    `);
    expect(links.map((l) => l.horsSerie)).toEqual([true, false]);

    expect(
      pickBdphileIssueLink(
        links,
        "Super Picsou Géant n°5",
        "Super Picsou Géant",
      )?.numeroId,
    ).toBe("901");
  });

  it("saute vers la page contenant le numéro (listes paginées croissantes)", async () => {
    const page = (start: number, numbers: number[], maxStart: number) => `
      ${numbers
        .map(
          (n) =>
            `<a href="https://www.bdphile.fr/revue/numero/${1000 + n}/" title="Numéro ${n}"><img src="c.jpg" /></a>`,
        )
        .join("\n")}
      <a href="https://www.bdphile.fr/revue/view/14/?start=${maxStart}">fin</a>
    `;
    mockedGet.mockImplementation(async (url: string) => {
      if (/\/revue\/(\?start=\d+)?$/.test(url)) {
        return { status: 200, data: revueIndexHtml() };
      }
      if (url.includes("/revue/view/14/?start=546")) {
        return { status: 200, data: page(546, [546, 560, 570], 546) };
      }
      if (url.includes("/revue/view/14/")) {
        return { status: 200, data: page(0, [0, 1, 2, 41], 546) };
      }
      if (url.includes("/revue/numero/1560/")) {
        return {
          status: 200,
          data: `<title>Picsou magazine Numéro 560 | Bdphile</title>
            <img src="https://static.bdphile.fr/images/media/revue/1560.jpg" />`,
        };
      }
      return { status: 404, data: "" };
    });

    const issue = await fetchBdphileMetadata("Picsou Magazine n°560");
    expect(issue?.title).toBe("Picsou magazine n°560");
    expect(issue?.id).toBe("1560");
  });

  it("replie le suffixe de la revue dans le titre composé", () => {
    expect(composeBdphileIssueTitle("Super Picsou Géant bis", "100")).toEqual({
      title: "Super Picsou Géant n°100bis",
      issueNumber: "100bis",
    });
    expect(composeBdphileIssueTitle("Super Picsou Géant", "7")).toEqual({
      title: "Super Picsou Géant n°7",
      issueNumber: "7",
    });
  });

  it("parse le champ Format (pages + tarif catalogue)", () => {
    expect(parseBdphileFormatField("242 pages - 4.9€")).toEqual({
      pageCount: 242,
      priceNewCents: 490,
      formatLabel: "242 pages - 4.9€",
    });
    expect(parseBdphileFormatField("68 pages")).toEqual({
      formatLabel: "68 pages",
      pageCount: 68,
    });
  });

  it("parse la fiche numéro (titre composé, parution, sommaire, cover)", () => {
    const issue = parseBdphileIssuePage(
      issue308Html(),
      "https://www.bdphile.fr/revue/numero/308/",
    );

    expect(issue).toMatchObject({
      id: "308",
      title: "Super Picsou Géant n°100bis",
      issueNumber: "100bis",
      revueName: "Super Picsou Géant bis",
      releaseDate: "juin 1980",
      imageUrl: "https://static.bdphile.fr/images/media/revue/308.jpg",
      pageCount: 242,
      priceNewCents: 490,
      issn: "0242-1234",
      periodicity: "Mensuelle",
      formatLabel: "242 pages - 4.9€",
    });
    expect(issue?.description).toContain("Donald contre Fantomiald");
    expect(issue?.publisher).toBeUndefined();
  });

  it("résout un numéro bis de bout en bout via l'index cache", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (/\/revue\/(\?start=\d+)?$/.test(url)) {
        return { status: 200, data: revueIndexHtml() };
      }
      if (url.includes("/revue/view/4/")) {
        return { status: 200, data: revueBisListingHtml() };
      }
      if (url.includes("/revue/numero/308/")) {
        return { status: 200, data: issue308Html() };
      }
      return { status: 404, data: "" };
    });

    const issue = await fetchBdphileMetadata("Super Picsou Géant n°100bis");
    expect(issue?.id).toBe("308");
    expect(issue?.title).toBe("Super Picsou Géant n°100bis");

    // Une demande sans numéro ne tente rien.
    expect(await fetchBdphileMetadata("Super Picsou Géant")).toBeNull();
  });

  it("rafraîchit une fiche mémorisée par URL / id sans repasser par l'index", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/revue/numero/308/")) {
        return { status: 200, data: issue308Html() };
      }
      return { status: 404, data: "" };
    });

    const byUrl = await fetchBdphileIssueByUrl(
      "https://www.bdphile.fr/revue/numero/308/",
    );
    expect(byUrl?.id).toBe("308");
    expect(byUrl?.title).toBe("Super Picsou Géant n°100bis");

    mockedGet.mockClear();
    const byId = await fetchBdphileIssueById("308");
    expect(byId?.id).toBe("308");
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining("/revue/numero/308/"),
      expect.anything(),
    );
    expect(
      mockedGet.mock.calls.every((call) => {
        const url = String(call[0]);
        return !url.includes("/revue/?") && !/\/revue\/?$/.test(url);
      }),
    ).toBe(true);
  });
});
