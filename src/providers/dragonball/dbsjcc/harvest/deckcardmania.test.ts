/**
 * Tests for DeckCardMania DBC / JCC set-fiche harvest — ISO-8859-1 decode,
 * série→part mapping, rare/holo lists, named gallery samples only.
 */
import { describe, expect, it } from "vitest";

import {
  decodeDeckcardmaniaHtml,
  deckcardmaniaAbsoluteFileUrl,
  extractNamedCardFromDeckcardmaniaTitle,
  extractSetHintFromDeckcardmaniaTitle,
  normalizeDeckcardmaniaPrinted,
  parseDeckcardmaniaAlbumHtml,
  parseDeckcardmaniaPrintedList,
  preferDeckcardmaniaBigImage,
} from "./deckcardmania";

/**
 * Trimmed from a 2026-09-24 capture of idm=120 (Série 1 FR).
 * Charset on the wire is ISO-8859-1; fixture stored as UTF-8 after decode.
 */
const FIXTURE_SERIE1 = `
<meta charset="ISO-8859-1" />
<title>DragonBall - Série  1 - Super-Saiyans - Français DragonBall</title>
<div id="id_feui" class="feui">
<h1>
DragonBall - Série  1 - Super-Saiyans - Français
</h1>
<img src="files/3/120b.jpg" border=0 alt="DragonBall - Série  1 - Super-Saiyans - Français">
<b>DragonBall - Série  1 - Super-Saiyans - Français</b><br>
Bandaï : D1 à D134<br>
<br>
<b>Première parution : </b>decembre 2005<br>
<div class="g0">
<b>Cartes Rares </b><em>*rar</em><b> : </b>D12, D26, D27, D28, D34, D35, D43, D48, D54, D60, D62, D65, D67, D75, D76, D82, D83, D85, D86, D90, D98, D100, D101, D104, D105, D107, D116, D117, D118, D120
</div>
<div class="g0">
<b>Cartes Holographiques </b><em>*hol</em><b> : </b>D30, D45, D46, D49, D51, D56, D77, D80, D96, D108, D111, D119, D121, D122, D130, D131, D132, D133, D134
</div>
<div class="d2">
Liste des Cartes<br>
<a href="files/3/120_i5b.jpg" target="_blank" title="Liste des Cartes" ><img src="files/3/120_i5s.jpg" border=0 alt="Liste des Cartes"></a>
</div>
<div class="d2">
Dos de cards<br>
<a href="files/3/120_i1b.jpg" target="_blank" title="Dos de cards" ><img src="files/3/120_i1s.jpg" border=0 alt="Dos de cards"></a>
</div>
<div class="d2">
Exemple de cards<br>
<a href="files/3/120_i2b.jpg" target="_blank" title="Exemple de cards" ><img src="files/3/120_i2s.jpg" border=0 alt="Exemple de cards"></a>
</div>
<div class="d2">
Exemple de cards Holographique<br>
<a href="files/3/120_i4b.jpg" target="_blank" title="Exemple de cards Holographique" ><img src="files/3/120_i4s.jpg" border=0 alt="Exemple de cards Holographique"></a>
</div>
</div>
`;

/** Snippet from idm=85 (SP) with clearly named sample faces. */
const FIXTURE_SP_NAMED = `
<h1>DragonBall - Série SP - Cartes à jouer et à Collectionner</h1>
<img src="files/3/85b.jpg" alt="DragonBall - Série SP">
Bandaï : SP01 à SP25<br>
<a href="files/3/85_i3b.jpg" target="_blank" title="Carte SP01" ><img src="files/3/85_i3s.jpg" border=0 alt="Carte SP01"></a>
<a href="files/3/85_i1b.jpg" target="_blank" title="Carte SP04" ><img src="files/3/85_i1s.jpg" border=0 alt="Carte SP04"></a>
<a href="files/3/85_i6b.jpg" target="_blank" title="Carte D-86" ><img src="files/3/85_i6s.jpg" border=0 alt="Carte D-86"></a>
<a href="files/3/85_i2b.jpg" target="_blank" title="Détail du symbole" ><img src="files/3/85_i2s.jpg" border=0 alt="Détail du symbole"></a>
`;

/** Ambiguous variant titles from idm=81 — must NOT become named samples. */
const FIXTURE_VARIANT_TITLES = `
<h1>DragonBall - Série 10 - Guerriers Légendaires - Français</h1>
<img src="files/3/81b.jpg" alt="Série 10">
<a href="files/3/81_i1b.jpg" target="_blank" title="Cartes N°: D 933-1" ><img src="files/3/81_i1s.jpg" alt="Cartes N°: D 933-1"></a>
<a href="files/3/81_i3b.jpg" target="_blank" title="Cartes N°: D 933-3 Holo" ><img src="files/3/81_i3s.jpg" alt="Cartes N°: D 933-3 Holo"></a>
`;

describe("decodeDeckcardmaniaHtml", () => {
  it("decodes ISO-8859-1 — the site serves nothing else", () => {
    // é in latin1 is 0xE9
    const bytes = new Uint8Array([0xe9]);
    expect(decodeDeckcardmaniaHtml(bytes)).toBe("é");
  });
});

describe("deckcardmaniaAbsoluteFileUrl / preferDeckcardmaniaBigImage", () => {
  it("absolutises relative files/ paths", () => {
    expect(deckcardmaniaAbsoluteFileUrl("files/3/120b.jpg")).toBe(
      "https://www.deckcardmania.com/files/3/120b.jpg",
    );
  });

  it("prefers big gallery over thumb", () => {
    expect(
      preferDeckcardmaniaBigImage(
        "https://www.deckcardmania.com/files/3/120_i5s.jpg",
      ),
    ).toBe("https://www.deckcardmania.com/files/3/120_i5b.jpg");
  });
});

describe("extractSetHintFromDeckcardmaniaTitle", () => {
  it("maps Série N → partN for FR JCC 1–10", () => {
    expect(
      extractSetHintFromDeckcardmaniaTitle(
        "DragonBall - Série  1 - Super-Saiyans - Français",
      ),
    ).toEqual({ setHint: "part1", line: "jcc-serie" });
    expect(
      extractSetHintFromDeckcardmaniaTitle(
        "DragonBall - Série 10 - Guerriers Légendaires - Français",
      ),
    ).toEqual({ setHint: "part10", line: "jcc-serie" });
  });

  it("maps SP / Promo lines", () => {
    expect(
      extractSetHintFromDeckcardmaniaTitle(
        "DragonBall - Série SP - Cartes à jouer et à Collectionner",
      ),
    ).toEqual({ setHint: "sp", line: "jcc-sp" });
    expect(
      extractSetHintFromDeckcardmaniaTitle(
        "DragonBall - Série Promo - Français",
      ),
    ).toEqual({ setHint: "promo", line: "jcc-promo" });
  });

  it("leaves Super Séries / DBS CG / Zenzu without a dbsjcc setHint", () => {
    expect(
      extractSetHintFromDeckcardmaniaTitle(
        "DragonBall - Super Série 1 - Goku - Cartes à jouer",
      ),
    ).toEqual({ setHint: null, line: "super-serie" });
    expect(
      extractSetHintFromDeckcardmaniaTitle(
        "DragonBall Super Card Game - Galactic Battle - Français",
      ),
    ).toEqual({ setHint: null, line: "dbs-cg" });
    expect(
      extractSetHintFromDeckcardmaniaTitle(
        "DragonBall Z - Zenzu Blast - Anglais",
      ),
    ).toEqual({ setHint: null, line: "other" });
  });
});

describe("normalizeDeckcardmaniaPrinted / parseDeckcardmaniaPrintedList", () => {
  it("normalises D12 and D-12", () => {
    expect(normalizeDeckcardmaniaPrinted("D12")).toBe("D-12");
    expect(normalizeDeckcardmaniaPrinted("D-12")).toBe("D-12");
    expect(normalizeDeckcardmaniaPrinted("SP01")).toBe("SP-1");
    expect(normalizeDeckcardmaniaPrinted("D504enf")).toBe("D-504");
    expect(normalizeDeckcardmaniaPrinted("D447mai")).toBe("D-447");
  });

  it("parses rare lists and skips variant suffixes", () => {
    expect(
      parseDeckcardmaniaPrintedList("D12, D26, D-30", { assumeDPrefix: true }),
    ).toEqual(["D-12", "D-26", "D-30"]);
    expect(
      parseDeckcardmaniaPrintedList("D-933-1, D12", { assumeDPrefix: true }),
    ).toEqual(["D-12"]);
  });

  it("does not invent D- from bare Super Série integers", () => {
    expect(
      parseDeckcardmaniaPrintedList("190, 191, 192", { assumeDPrefix: false }),
    ).toEqual([]);
    expect(
      parseDeckcardmaniaPrintedList("190, D12", { assumeDPrefix: true }),
    ).toEqual(["D-190", "D-12"]);
  });
});

describe("extractNamedCardFromDeckcardmaniaTitle", () => {
  it("accepts clearly named SP / D cards", () => {
    expect(extractNamedCardFromDeckcardmaniaTitle("Carte SP01")).toEqual({
      printed: "SP-1",
      number: "sp0001",
    });
    expect(extractNamedCardFromDeckcardmaniaTitle("Carte D-86")).toEqual({
      printed: "D-86",
      number: "d0086",
    });
  });

  it("rejects ambiguous variant suffixes and bare Super Série numbers", () => {
    expect(extractNamedCardFromDeckcardmaniaTitle("Cartes N°: D 933-1")).toBeNull();
    expect(extractNamedCardFromDeckcardmaniaTitle("Carte 189-1")).toBeNull();
    expect(extractNamedCardFromDeckcardmaniaTitle("Exemple de cards")).toBeNull();
  });
});

describe("parseDeckcardmaniaAlbumHtml", () => {
  it("parses série 1 packshot, bandai range, rares/holos, gallery kinds", () => {
    const album = parseDeckcardmaniaAlbumHtml(FIXTURE_SERIE1, 120);
    expect(album.title).toContain("Série");
    expect(album.setHint).toBe("part1");
    expect(album.line).toBe("jcc-serie");
    expect(album.bandaiRange).toBe("D1 à D134");
    expect(album.releaseText).toBe("decembre 2005");
    expect(album.packshotUrl).toBe(
      "https://www.deckcardmania.com/files/3/120b.jpg",
    );
    expect(album.rares).toContain("D-12");
    expect(album.rares).toContain("D-120");
    expect(album.holos).toContain("D-30");
    expect(album.holos).toContain("D-134");
    expect(album.gallery.map((g) => g.kind).sort()).toEqual([
      "dos",
      "exemple",
      "exemple",
      "liste",
    ]);
    const dos = album.gallery.find((g) => g.kind === "dos")!;
    expect(dos.url).toBe(
      "https://www.deckcardmania.com/files/3/120_i1b.jpg",
    );
  });

  it("keeps named sample faces and drops non-card gallery noise", () => {
    const album = parseDeckcardmaniaAlbumHtml(FIXTURE_SP_NAMED, 85);
    expect(album.setHint).toBe("sp");
    const named = album.gallery.filter((g) => g.kind === "named");
    expect(named.map((g) => g.printed).sort()).toEqual([
      "D-86",
      "SP-1",
      "SP-4",
    ]);
    expect(album.gallery.some((g) => /symbole/i.test(g.title))).toBe(true);
    expect(
      album.gallery.find((g) => /symbole/i.test(g.title))!.kind,
    ).toBe("other");
  });

  it("does not treat D-933-1 style titles as installable named faces", () => {
    const album = parseDeckcardmaniaAlbumHtml(FIXTURE_VARIANT_TITLES, 81);
    expect(album.setHint).toBe("part10");
    expect(album.gallery.every((g) => g.kind !== "named")).toBe(true);
    expect(album.gallery.every((g) => g.printed === null)).toBe(true);
  });
});
