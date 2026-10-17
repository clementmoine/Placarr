import { describe, expect, it } from "vitest";

import { lddbFormatById } from "./formats";
import {
  isLddbBlockedHtml,
  lddbHitListCoversQuery,
  lddbSiblingTitles,
  normalizeLddbImdbId,
  parseLddbSearchHits,
  parseLddbTitlePage,
  pickBestLddbHit,
} from "./parse";

const SEARCH_HTML = `
<html><body>
<table>
<tr>
  <td><a href="/laserdisc/24721/12436-AS/Toy-Story">Toy Story (1995)</a></td>
  <td>USA</td>
</tr>
<tr>
  <td><a href="/laserdisc/31200/PILF-2322/Toy-Story-2">Toy Story 2 (1999)</a></td>
  <td>Japan</td>
</tr>
<tr>
  <td><a href="/hddvd/00006/61101155/40-Year-Old-Virgin-The">40 Year Old Virgin, The (2005)</a></td>
</tr>
</table>
<img src="/cover/ld/24701-24800/thumb/24721.jpg" />
</body></html>
`;

/** Live LDDb UPC rows: anchor = catalog ref, title in <b> + year span. */
const UPC_SEARCH_HTML = `
<html><body>
<table>
<tr id="tr" class="contents_0">
  <td><a href="https://www.lddb.com/laserdisc/33828/22/7610/Toy-Story">22/7610</a></td>
  <td><b>Toy Story</b><span id="year_33828"> (1995)</span></td>
</tr>
<tr>
  <td><a href="https://www.lddb.com/laserdisc/shop/44949/VAL-3021/Peter-Paul">VAL-3021</a></td>
</tr>
</table>
</body></html>
`;

const THUMB_ONLY_DETAIL_HTML = `
<html><body>
<h2 class="lddb">Toy Story (1995) [22/7610]</h2>
<img src="/cover/ld/33801-33900/thumb/33828.jpg" />
<img src="/cover/ld/33801-33900/thumb/33828_back.jpg" />
</body></html>
`;

const DETAIL_HTML = `
<html><body>
<h2 class="lddb">Toy Story (1995) [12436 AS]</h2>
<table>
  <tr><td class="field">Reference&nbsp;</td><td class="data">12436 AS</td></tr>
  <tr><td class="field">Country&nbsp;</td><td class="data">USA</td></tr>
  <tr><td class="field">Video&nbsp;</td><td class="data">NTSC</td></tr>
  <tr><td class="field">Specs&nbsp;</td><td class="data">LBX/SRD</td></tr>
  <tr><td class="field">Category&nbsp;</td><td class="data"><a href="/category/animation">Animation</a></td></tr>
  <tr><td class="field">UPC&nbsp;</td><td class="data">786936012436</td></tr>
  <tr><td class="field">IMDb&nbsp;</td><td class="data"><a href="https://www.imdb.com/title/tt0114709/">tt0114709</a></td></tr>
</table>
<img src="/cover/ld/24701-24800/24721.jpg" />
<img src="/cover/ld/24701-24800/24721_back.jpg" />
</body></html>
`;

const CED_DETAIL_HTML = `
<html><body>
<h2 class="lddb">2001: A Space Odyssey (1968) [MD100002]</h2>
<table>
  <tr><td class="field">Country&nbsp;</td><td class="data">USA</td></tr>
  <tr><td class="field">Category&nbsp;</td><td class="data">Sci-Fi</td></tr>
</table>
<img src="/cover/ced/00001-00100/00007.jpg" />
</body></html>
`;

describe("isLddbBlockedHtml", () => {
  it("detects Anubis challenge pages", () => {
    expect(
      isLddbBlockedHtml("<title>Making sure you're not a bot!</title>"),
    ).toBe(true);
    expect(isLddbBlockedHtml(SEARCH_HTML)).toBe(false);
  });
});

describe("parseLddbSearchHits", () => {
  it("extracts title links across catalog formats", () => {
    const hits = parseLddbSearchHits(SEARCH_HTML);
    expect(hits).toHaveLength(3);
    expect(hits[0]).toMatchObject({
      id: "24721",
      format: "ld",
      title: "Toy Story",
      year: 1995,
      country: "USA",
      url: "https://www.lddb.com/laserdisc/24721/12436-AS/Toy-Story",
    });
    expect(hits[1]).toMatchObject({
      id: "31200",
      country: "Japan",
    });
    expect(hits[2]).toMatchObject({
      id: "00006",
      format: "hddvd",
    });
  });

  it("can filter to one format", () => {
    const hits = parseLddbSearchHits(SEARCH_HTML, lddbFormatById("ld"));
    expect(hits.every((h) => h.format === "ld")).toBe(true);
    expect(hits).toHaveLength(2);
  });

  it("returns empty on Anubis HTML", () => {
    expect(
      parseLddbSearchHits("<html>Making sure you're not a bot!</html>"),
    ).toEqual([]);
  });

  it("reads UPC rows where the anchor is only the catalog reference", () => {
    const hits = parseLddbSearchHits(UPC_SEARCH_HTML);
    expect(hits).toEqual([
      expect.objectContaining({
        id: "33828",
        format: "ld",
        title: "Toy Story",
        year: 1995,
        url: "https://www.lddb.com/laserdisc/33828/22/7610/Toy-Story",
      }),
    ]);
  });
});

describe("parseLddbTitlePage", () => {
  it("reads title, barcode, covers and IMDb", () => {
    const title = parseLddbTitlePage(
      DETAIL_HTML,
      "https://www.lddb.com/laserdisc/24721/12436-AS/Toy-Story",
    );
    expect(title).toMatchObject({
      id: "24721",
      format: "ld",
      formatLabel: "LaserDisc",
      title: "Toy Story",
      year: 1995,
      reference: "12436 AS",
      country: "USA",
      barcode: "786936012436",
      imdbId: "tt0114709",
      frontUrl: "https://www.lddb.com/cover/ld/24701-24800/24721.jpg",
      backUrl: "https://www.lddb.com/cover/ld/24701-24800/24721_back.jpg",
    });
  });

  it("parses CED detail pages", () => {
    const title = parseLddbTitlePage(
      CED_DETAIL_HTML,
      "https://www.lddb.com/ced/00007/MD100002/2001:-A-Space-Odyssey",
    );
    expect(title).toMatchObject({
      id: "00007",
      format: "ced",
      formatLabel: "CED",
      title: "2001: A Space Odyssey",
      frontUrl: "https://www.lddb.com/cover/ced/00001-00100/00007.jpg",
    });
  });

  it("prefers full-size covers when the page only embeds thumbs", () => {
    const title = parseLddbTitlePage(
      THUMB_ONLY_DETAIL_HTML,
      "https://www.lddb.com/laserdisc/33828/22/7610/Toy-Story",
    );
    expect(title).toMatchObject({
      frontUrl: "https://www.lddb.com/cover/ld/33801-33900/33828.jpg",
      backUrl: "https://www.lddb.com/cover/ld/33801-33900/33828_back.jpg",
      thumbUrl: "https://www.lddb.com/cover/ld/33801-33900/thumb/33828.jpg",
    });
  });

  it("does not invent cover URLs when the detail page has no artwork", () => {
    const title = parseLddbTitlePage(
      `<html><body>
        <h2 class="lddb">Nightmare Before Christmas, The (1993) [EE 1172]</h2>
        <table>
          <tr><td class="field">Country&nbsp;</td><td class="data">Europe</td></tr>
          <tr><td class="field">UPC&nbsp;</td><td class="data">5014381003070</td></tr>
        </table>
      </body></html>`,
      "https://www.lddb.com/laserdisc/27959/EE-1172/Nightmare-Before-Christmas-The",
    );
    expect(title).toMatchObject({
      id: "27959",
      title: "Nightmare Before Christmas, The",
      country: "Europe",
    });
    expect(title?.frontUrl).toBeUndefined();
    expect(title?.backUrl).toBeUndefined();
    expect(title?.thumbUrl).toBeUndefined();
  });
});

describe("parseLddbSearchHits thumbs", () => {
  it("only sets thumbUrl when the search HTML embeds that cover", () => {
    const withThumb = parseLddbSearchHits(SEARCH_HTML);
    expect(withThumb.find((h) => h.id === "24721")?.thumbUrl).toContain(
      "24721.jpg",
    );
    expect(withThumb.find((h) => h.id === "31200")?.thumbUrl).toBeUndefined();

    const upcOnly = parseLddbSearchHits(UPC_SEARCH_HTML);
    expect(upcOnly[0]?.thumbUrl).toBeUndefined();
  });
});

describe("pickBestLddbHit", () => {
  it("prefers the closest title token match", () => {
    const hits = parseLddbSearchHits(SEARCH_HTML, lddbFormatById("ld"));
    expect(pickBestLddbHit(hits, "Toy Story")?.id).toBe("24721");
    expect(pickBestLddbHit(hits, "Toy Story 2")?.id).toBe("31200");
  });

  it("skips Cancelled SKUs so a released sibling wins (Nightmare FR)", () => {
    // Live LDDb shape: cancelled FR title 27959 + released 27958 (22/4193).
    const html = `
<html><body><table>
<tr id="tr" class="contents_0" valign="top">
  <td nowrap="" id="collwish_27959" style="display:none"></td>
  <td><a href="https://www.lddb.com/laserdisc/27959/1419374/Etrange-Noel-de-Monsieur-Jack-L">1419374</a></td>
  <td><span id="27959" style="display: none;">&nbsp;</span></td>
  <td><b>Etrange Noël de Monsieur Jack, L'</b><span id="year_27959"> (1993)</span></td>
  <td align="center">LBX/SRD</td>
  <td align="center"><b>Cancelled</b></td>
  <td align="center">PAL</td>
  <td align="center">France</td>
</tr>
<tr id="tr" class="contents_1" valign="top">
  <td nowrap="" id="collwish_27958" style="display:none"></td>
  <td><a href="https://www.lddb.com/laserdisc/27958/22/4193/Nightmare-Before-Christmas-The">22/4193</a></td>
  <td><span id="27958" style="display: none;">&nbsp;</span></td>
  <td><b>Nightmare Before Christmas, The</b><span id="year_27958"> (1993)</span></td>
  <td align="center">LBX/SRD</td>
  <td align="center"><b>1995-11-14</b></td>
  <td align="center">PAL</td>
  <td align="center">France</td>
</tr>
</table></body></html>`;
    const hits = parseLddbSearchHits(html, lddbFormatById("ld"));
    expect(hits.find((h) => h.id === "27959")).toMatchObject({
      cancelled: true,
      country: "France",
    });
    expect(hits.find((h) => h.id === "27958")).toMatchObject({
      country: "France",
    });
    expect(hits.find((h) => h.id === "27958")?.cancelled).toBeUndefined();
    // French query would otherwise prefer 27959 on title tokens alone.
    expect(
      pickBestLddbHit(hits, "L'Etrange Noel de Monsieur Jack")?.id,
    ).toBe("27958");
    expect(pickBestLddbHit(hits, "Nightmare Before Christmas")?.id).toBe(
      "27958",
    );
  });

  it("returns null when every hit is Cancelled", () => {
    const html = `
<html><body><table>
<tr id="tr" class="contents_0">
  <td id="collwish_27959"></td>
  <td><a href="https://www.lddb.com/laserdisc/27959/1419374/Etrange-Noel">1419374</a></td>
  <td><b>Etrange Noel</b><span id="year_27959"> (1993)</span></td>
  <td><b>Cancelled</b></td>
</tr>
</table></body></html>`;
    expect(pickBestLddbHit(parseLddbSearchHits(html), "Etrange Noel")).toBeNull();
  });
});

describe("normalizeLddbImdbId", () => {
  it("strips tt and zero-pads to 7 digits for LDDb paths", () => {
    expect(normalizeLddbImdbId("tt0107688")).toBe("0107688");
    expect(normalizeLddbImdbId("0107688")).toBe("0107688");
    expect(normalizeLddbImdbId("107688")).toBe("0107688");
    expect(normalizeLddbImdbId("tt1375666")).toBe("1375666");
    expect(normalizeLddbImdbId("")).toBeNull();
    expect(normalizeLddbImdbId("not-an-id")).toBeNull();
  });
});

describe("lddbHitListCoversQuery / siblings", () => {
  const nightmareHits = parseLddbSearchHits(
    `
<html><body><table>
<tr id="tr" class="contents_0" valign="top">
  <td nowrap="" id="collwish_27959" style="display:none"></td>
  <td><a href="https://www.lddb.com/laserdisc/27959/1419374/Etrange-Noel-de-Monsieur-Jack-L">1419374</a></td>
  <td><span id="27959" style="display: none;">&nbsp;</span></td>
  <td><b>Etrange Noël de Monsieur Jack, L'</b><span id="year_27959"> (1993)</span></td>
  <td align="center">LBX/SRD</td>
  <td align="center"><b>Cancelled</b></td>
  <td align="center">PAL</td>
  <td align="center">France</td>
</tr>
<tr id="tr" class="contents_1" valign="top">
  <td nowrap="" id="collwish_27958" style="display:none"></td>
  <td><a href="https://www.lddb.com/laserdisc/27958/22/4193/Nightmare-Before-Christmas-The">22/4193</a></td>
  <td><span id="27958" style="display: none;">&nbsp;</span></td>
  <td><b>Nightmare Before Christmas, The</b><span id="year_27958"> (1993)</span></td>
  <td align="center">LBX/SRD</td>
  <td align="center"><b>1995-11-14</b></td>
  <td align="center">PAL</td>
  <td align="center">France</td>
</tr>
</table></body></html>`,
    lddbFormatById("ld"),
  );

  it("covers truncated FR Affiche query via Cancelled sibling title", () => {
    // Live LDDb URL: search=L'Étrange+Noël+de+monsieur+Jac&sort=title
    expect(
      lddbHitListCoversQuery("L'Étrange Noël de monsieur Jac", nightmareHits),
    ).toBe(true);
    expect(
      lddbHitListCoversQuery("L'Étrange Noël de Monsieur Jack", nightmareHits),
    ).toBe(true);
  });

  it("exposes Cancelled FR title as sibling alias of released EN row", () => {
    expect(lddbSiblingTitles(nightmareHits, "27958")).toEqual([
      "Etrange Noël de Monsieur Jack, L'",
    ]);
  });

  it("rejects unrelated queries against the same hit list", () => {
    expect(lddbHitListCoversQuery("Toy Story", nightmareHits)).toBe(false);
    expect(lddbHitListCoversQuery("Jac", nightmareHits)).toBe(false);
  });

  it("IMDb search rows + FR Affiche title still prefer released 27958", () => {
    // Shape of https://www.lddb.com/search/IMDb/0107688
    expect(
      pickBestLddbHit(
        nightmareHits,
        "L'Étrange Noël de monsieur Jac",
      )?.id,
    ).toBe("27958");
  });
});

describe("parseLddbTitlePage cancelled", () => {
  it("refuses a detail page whose Released field is Cancelled", () => {
    expect(
      parseLddbTitlePage(
        `<html><body>
          <h2 class="lddb">Etrange Noël de Monsieur Jack, L' (1993) [1419374]</h2>
          <table>
            <tr><td class="field">Country&nbsp;</td><td class="data">France</td></tr>
            <tr><td class="field">Released&nbsp;</td><td class="data">Cancelled</td></tr>
          </table>
          <img src="/cover/ld/27901-28000/27959.jpg" />
        </body></html>`,
        "https://www.lddb.com/laserdisc/27959/1419374/Etrange-Noel-de-Monsieur-Jack-L",
      ),
    ).toBeNull();
  });
});
