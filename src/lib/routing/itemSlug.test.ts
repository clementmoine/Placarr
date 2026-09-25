import { itemLookupSlugs, printKeyItemSlug } from "./slugs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  item: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import {
  allocateUniqueItemSlug,
  isLegacyNumericDuplicateSlug,
  reconcileDuplicateItemSlugsOnShelf,
} from "./itemSlug";

describe("isLegacyNumericDuplicateSlug", () => {
  it("flags a second copy that inherited a numeric suffix", () => {
    expect(
      isLegacyNumericDuplicateSlug({
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted-2",
      }),
    ).toBe(true);
  });

  it("keeps a real sequel title slug intact", () => {
    expect(
      isLegacyNumericDuplicateSlug({
        name: "Need for Speed Most Wanted 2",
        slug: "need-for-speed-most-wanted-2",
      }),
    ).toBe(false);
  });
});

describe("allocateUniqueItemSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the base slug when the shelf is free", async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    await expect(
      allocateUniqueItemSlug("shelf-1", "Need for Speed Most Wanted"),
    ).resolves.toBe("need-for-speed-most-wanted");
  });

  it("suffixes the second copy with -copy-N, not a bare -2", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      { slug: "need-for-speed-most-wanted" },
    ]);

    await expect(
      allocateUniqueItemSlug("shelf-1", "Need for Speed Most Wanted"),
    ).resolves.toBe("need-for-speed-most-wanted-copy-2");
  });

  it("does not steal the slug of a real sequel on the shelf", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      { slug: "need-for-speed-most-wanted-2" },
    ]);

    await expect(
      allocateUniqueItemSlug("shelf-1", "Need for Speed Most Wanted"),
    ).resolves.toBe("need-for-speed-most-wanted");
  });

  it("honours reserved slugs within the same batch", async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    const reserved = new Set(["need-for-speed-most-wanted"]);
    await expect(
      allocateUniqueItemSlug("shelf-1", "Need for Speed Most Wanted", {
        reserved,
      }),
    ).resolves.toBe("need-for-speed-most-wanted-copy-2");
  });
});

describe("reconcileDuplicateItemSlugsOnShelf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => {
      for (const op of ops) await op;
    });
    prismaMock.item.update.mockResolvedValue({});
  });

  it("keeps the oldest copy canonical and suffixes later duplicates", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-1",
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "item-2",
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted",
        createdAt: new Date("2026-02-01"),
      },
    ]);

    await expect(reconcileDuplicateItemSlugsOnShelf("shelf-1")).resolves.toBe(
      1,
    );
    expect(prismaMock.item.update).toHaveBeenCalledWith({
      where: { id: "item-2" },
      data: { slug: "need-for-speed-most-wanted-copy-2" },
    });
  });

  it("migrates legacy numeric duplicate slugs without touching sequel titles", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-1",
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "item-2",
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted-2",
        createdAt: new Date("2026-02-01"),
      },
      {
        id: "item-3",
        name: "Need for Speed Most Wanted 2",
        slug: "need-for-speed-most-wanted-2",
        createdAt: new Date("2026-03-01"),
      },
    ]);

    await expect(reconcileDuplicateItemSlugsOnShelf("shelf-1")).resolves.toBe(
      1,
    );
    expect(prismaMock.item.update).toHaveBeenCalledWith({
      where: { id: "item-2" },
      data: { slug: "need-for-speed-most-wanted-copy-2" },
    });
    expect(prismaMock.item.update).not.toHaveBeenCalledWith({
      where: { id: "item-3" },
      data: expect.anything(),
    });
  });
});

describe("une carte se nomme par sa référence", () => {
  /*
    Deux objets d'une même étagère s'appelaient « Naruto Uzumaki » : l'un est
    `pr-0016` en holo, l'autre `ni-0046` en normal. Le nommage par titre les
    rendait `naruto-uzumaki` et `naruto-uzumaki-copy-2` — et `copy` **affirme**
    que le second est un exemplaire du premier, ce qui est faux : ce sont deux
    cartes différentes.
  */
  it("distingue deux cartes homonymes sans les dire copies l'une de l'autre", () => {
    const a = printKeyItemSlug("naruto:pr-0016", "holo");
    const b = printKeyItemSlug("naruto:ni-0046", "normal");
    expect(a).not.toBe(b);
    expect(a).not.toContain("copy");
    expect(b).not.toContain("copy");
    expect(a).toContain("pr-0016");
    expect(b).toContain("ni-0046");
  });

  it("est la référence, telle qu'elle se lit sur la carte", () => {
    expect(printKeyItemSlug("naruto:cl-0001", null)).toBe("cl-0001");
    expect(printKeyItemSlug("naruto:ni-0046", "normal")).toBe("ni-0046-normal");
  });

  /*
    Sans référence, rien n'est inventé : les objets des autres étagères — un
    jeu, un livre — gardent leur slug par titre.
  */
  it("rend une chaîne vide quand l'objet n'est pas un tirage", () => {
    expect(printKeyItemSlug(null, null)).toBe("");
    expect(printKeyItemSlug("pas-une-cle", null)).toBe("");
  });

  /*
    Les deux formes doivent résoudre : une URL déjà partagée pointe sur
    l'ancien slug par nom, et il ne doit pas mourir.
  */
  it("reconnaît l'ancienne URL comme la nouvelle", () => {
    const slugs = itemLookupSlugs({
      name: "Inari",
      slug: "inari",
      printKey: "naruto:cl-0001",
      variant: null,
    });
    // L'ancienne URL par nom, et la nouvelle par référence.
    expect(slugs).toContain("inari");
    expect(slugs).toContain("cl-0001");
  });
});

/*
  Une clé de tirage vaut pour **toutes** ses localisations : c'est ainsi que les
  sources modèlent une carte, et TCGdex répond `2011bw-1` aussi bien pour Snivy
  que pour Vipélierre. Sans la langue, l'Inari française et l'イナリ japonaise
  sortaient le même slug, et la seconde recevait `-copy-2` — le suffixe
  affirmait qu'elle dupliquait la première. 898 clés Naruto sont concernées.
*/
describe("deux langues d'une même carte ne sont pas des copies", () => {
  it("separates them by language, with no copy suffix in sight", () => {
    const fr = printKeyItemSlug("naruto:cl-0001", "normal", "fr");
    const ja = printKeyItemSlug("naruto:cl-0001", "normal", "ja");
    expect(fr).toBe("cl-0001-fr-normal");
    expect(ja).toBe("cl-0001-ja-normal");
    expect(fr).not.toBe(ja);
    expect(fr).not.toContain("copy");
    expect(ja).not.toContain("copy");
  });

  /*
    Écrite même quand rien ne l'oblige : sinon l'URL de la carte française
    changerait le jour où l'on ajoute la japonaise. Un slug ne dépend pas de ce
    qu'on possède par ailleurs.
  */
  it("writes the language even when nothing collides", () => {
    expect(printKeyItemSlug("lorcana:1-106", null, "fr")).toBe("1-106-fr");
  });

  /** Langue inconnue : l'ancienne forme, qui reste une URL valide. */
  it("falls back to the language-free form when nothing is known", () => {
    expect(printKeyItemSlug("naruto:ni-0046", "normal", null)).toBe(
      "ni-0046-normal",
    );
    expect(printKeyItemSlug("naruto:ni-0046", "normal")).toBe("ni-0046-normal");
  });

  it("keeps answering to the URL a card had before the language arrived", () => {
    const forms = itemLookupSlugs({
      name: "Madame Shijimi",
      slug: "cl-0004-fr-normal",
      printKey: "naruto:cl-0004",
      variant: "normal",
      language: "fr",
    });
    expect(forms).toContain("cl-0004-fr-normal");
    expect(forms).toContain("cl-0004-normal");
    expect(forms).toContain("cl-0004");
  });
});
