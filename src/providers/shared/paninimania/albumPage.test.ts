import { describe, expect, it } from "vitest";

import {
  decodePaninimaniaHtml,
  parsePaninimaniaAlbumFacts,
  parsePaninimaniaFinishes,
} from "./albumPage";

/** Gabarit de fiche album (idm=7013, relevé 2026-11-22), raccourci. */
const PAGE = `
<b>Articles divers :</b><br>
 - Pochette de 4 stickers<br>
</div></div><br>
<div class="g0">
<b>Images Brillantes </b><em>*bri</em><b> : </b>17, 30, 50, 92
</div>
<br>
<div class="g0">
<b>Images Paillet&eacute;es </b><em>*pail</em><b> : </b>21, 48, 60, 108
</div>
<div class="d2"><div class="g0">
Enseigne: Leclerc<br>Opération du 3 novembre au 20 décembre 2020<br><br>
<B>Recevez 1 pochette de 4 images et 2 cartes</B> :<br><br>
- A chaque passage en caisse par tranche de 30€ d'achats<br>
Album Collector de 50 pages glacées: 1,99€
</div></div>`;

describe("parsePaninimaniaFinishes", () => {
  it("lit chaque bloc « Images … *code : n, n »", () => {
    const html = PAGE.replace("&eacute;", "é");
    expect(parsePaninimaniaFinishes(html)).toEqual([
      {
        label: "Images Brillantes",
        code: "bri",
        numbers: ["17", "30", "50", "92"],
      },
      {
        label: "Images Pailletées",
        code: "pail",
        numbers: ["21", "48", "60", "108"],
      },
    ]);
  });

  it("rend [] sans bloc de finitions", () => {
    expect(parsePaninimaniaFinishes("<div class='g0'>rien</div>")).toEqual([]);
  });
});

describe("parsePaninimaniaAlbumFacts", () => {
  it("lit période, seuil, prix de l'album et taille de pochette", () => {
    const facts = parsePaninimaniaAlbumFacts(PAGE.replace("&eacute;", "é"));
    expect(facts.operation).toEqual({ start: "2020-11-03", end: "2020-12-20" });
    expect(facts.thresholdEur).toBe(30);
    expect(facts.albumEur).toBe(1.99);
    expect(facts.packSize).toBe(4);
    expect(facts.finishes).toHaveLength(2);
  });
});

describe("decodePaninimaniaHtml", () => {
  it("décode le Windows-1252 servi (accents, €)", () => {
    const bytes = Uint8Array.from([
      0x50, 0x61, 0x69, 0x6c, 0x6c, 0x65, 0x74, 0xe9, 0x65, 0x73, 0x20, 0x33,
      0x30, 0x80,
    ]);
    expect(decodePaninimaniaHtml(bytes)).toBe("Pailletées 30€");
  });
});
