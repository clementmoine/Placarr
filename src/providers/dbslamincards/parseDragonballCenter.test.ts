/**
 * Parse + printKey Dragon Ball Lamincards (DBC).
 */
import { describe, expect, it } from "vitest";

import {
  parseDbcListingCards,
  parseDbcObjectFaces,
  parseDbcRarityTag,
} from "./parseDragonballCenter";
import { lamincardsPrintKey } from "./printKey";

const LISTING_FIXTURE = `
<div class="catalogo_coleccion_objeto_imagen" style="background-image: url(/files/module_dbc/_thumbs/objetos/aaa111.250x250.jpg);"
  onclick="visor('/files/module_dbc/objetos/73/aaa111.jpg', 1, '/files/module_dbc/objetos/73/aaa111.jpg|/files/module_dbc/objetos/99/bbb222.jpg|', true, 30312, 'Lamincard 1', '', '', '');">
</div>
<a class="divlink" href="/catalogo/objeto/30312/lamincard-1">
  <div class="catalogo_coleccion_objeto_info"><span>Lamincard 1</span></div>
</a>
<div class="catalogo_coleccion_objeto_imagen"
  onclick="visor('/files/module_dbc/objetos/74/ag2d114988.jpg', 1, '/files/module_dbc/objetos/74/ag2d114988.jpg|', true, 53870, 'Lamincard 8', 'Silver||777777||S|||', '', '');">
</div>
<a class="divlink" href="/catalogo/objeto/53870/lamincard-8">
  <div class="catalogo_coleccion_objeto_info"><span>Lamincard 8</span></div>
</a>
<a href="/catalogo/objeto/90179/caja-de-sobres">box</a>
`;

const OBJECT_FIXTURE = `
<div id="catalogo_objeto_foto" style="background-image: url(/files/module_dbc/_thumbs/objetos/totd165423.250x250.jpg);"
  onclick="visor('/files/module_dbc/objetos/84/totd165423.jpg', 1, '/files/module_dbc/objetos/84/totd165423.jpg|/files/module_dbc/objetos/99/ch34165595.jpg|');"></div>
`;

describe("parseDbcListingCards", () => {
  it("keeps base + Silver parallels with listing visor faces", () => {
    const cards = parseDbcListingCards(LISTING_FIXTURE);
    expect(cards).toEqual([
      {
        objetoId: "30312",
        slug: "lamincard-1",
        printed: "1",
        number: "0001",
        grouping: null,
        rarityLabel: null,
        pagePath: "/catalogo/objeto/30312/lamincard-1",
        frontPath: "/files/module_dbc/objetos/73/aaa111.jpg",
        backPath: "/files/module_dbc/objetos/99/bbb222.jpg",
      },
      {
        objetoId: "53870",
        slug: "lamincard-8",
        printed: "8",
        number: "0008",
        grouping: "s",
        rarityLabel: "Silver",
        pagePath: "/catalogo/objeto/53870/lamincard-8",
        frontPath: "/files/module_dbc/objetos/74/ag2d114988.jpg",
        backPath: null,
      },
    ]);
  });
});

describe("parseDbcObjectFaces", () => {
  it("reads visor front then back", () => {
    const faces = parseDbcObjectFaces(OBJECT_FIXTURE);
    expect(faces.frontPath).toBe("/files/module_dbc/objetos/84/totd165423.jpg");
    expect(faces.backPath).toBe("/files/module_dbc/objetos/99/ch34165595.jpg");
  });
});

describe("parseDbcRarityTag", () => {
  it("maps Silver / Gold tags", () => {
    expect(parseDbcRarityTag("Silver||777777||S|||")).toEqual({
      grouping: "s",
      label: "Silver",
    });
    expect(parseDbcRarityTag("")).toEqual({ grouping: null, label: null });
  });
});

describe("lamincardsPrintKey", () => {
  it("builds base and Silver keys", () => {
    expect(lamincardsPrintKey("fr2008", "1")).toBe("dbslamincards:fr2008-0001");
    expect(lamincardsPrintKey("fr2008", "8", "s")).toBe(
      "dbslamincards:fr2008-0008-s",
    );
  });
});
