import { describe, expect, it } from "vitest";

import { parseCollexCollectionItems } from "./parseCollection";

const HTML = `
<img src="https://img.collexstash.com/27a4/cover.webp?v=1" alt="Couverture"/>
<img src="https://img.collexstash.com/27a4/items/woody-001.webp?v=1794143642633" alt="001 Woody Cartes Disney Leclerc 2026" title="001 Woody Cartes Disney Leclerc 2026" width="400" height="560"/>
<img src="https://img.collexstash.com/27a4/items/buzz-l-eclair-002.webp?v=17" alt="002 Buzz l&#x27;Éclair Cartes Disney Leclerc 2026"/>
<img src="https://img.collexstash.com/27a4/items/woody-001.webp?v=1794143642633" alt="001 Woody Cartes Disney Leclerc 2026"/>
<img src="https://img.collexstash.com/8e5c/items/woody.webp?v=3" alt="Woody Fixeez Disney Leclerc 2026"/>
<img src="https://img.collexstash.com/8e5c/items/baloo.webp?v=4" alt="Baloo Fixeez Disney Leclerc 2026"/>
<script>self.__next_f.push(["items/rex-005.webp"])</script>
`;

describe("parseCollexCollectionItems", () => {
  it("lit toute la collection dans le flux RSC (pas seulement les vignettes rendues)", () => {
    const payload =
      '<script>self.__next_f.push([1,"[{\\"id\\":\\"a\\",\\"name\\":\\"Petit Fr\\u00e8re\\",\\"itemNumber\\":\\"049\\",\\"slug\\":\\"petit-frere-049\\",\\"imageUrl\\":\\"https://img.collexstash.com/27a4/items/petit-frere-049.webp?v=17\\",\\"ord\\":49},' +
      '{\\"id\\":\\"b\\",\\"name\\":\\"Baloo\\",\\"itemNumber\\":null,\\"slug\\":\\"baloo\\",\\"imageUrl\\":\\"https://img.collexstash.com/8e5c/items/baloo.webp?v=4\\"}]"])</script>';
    expect(parseCollexCollectionItems(payload + HTML)).toEqual([
      {
        slug: "petit-frere-049",
        number: "049",
        name: "Petit Frère",
        imageUrl:
          "https://img.collexstash.com/27a4/items/petit-frere-049.webp?v=17",
      },
      {
        slug: "baloo",
        number: null,
        name: "Baloo",
        imageUrl: "https://img.collexstash.com/8e5c/items/baloo.webp?v=4",
      },
    ]);
  });

  it("lit chaque visuel d'objet une fois, avec numéro, nom et URL d'image", () => {
    expect(parseCollexCollectionItems(HTML)).toEqual([
      {
        slug: "woody-001",
        number: "001",
        name: "Woody",
        imageUrl:
          "https://img.collexstash.com/27a4/items/woody-001.webp?v=1794143642633",
      },
      {
        slug: "buzz-l-eclair-002",
        number: "002",
        name: "Buzz l'Éclair",
        imageUrl:
          "https://img.collexstash.com/27a4/items/buzz-l-eclair-002.webp?v=17",
      },
      {
        slug: "woody",
        number: null,
        name: "Woody",
        imageUrl: "https://img.collexstash.com/8e5c/items/woody.webp?v=3",
      },
      {
        slug: "baloo",
        number: null,
        name: "Baloo",
        imageUrl: "https://img.collexstash.com/8e5c/items/baloo.webp?v=4",
      },
    ]);
  });
});
