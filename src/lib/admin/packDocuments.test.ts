import { describe, expect, it } from "vitest";

import {
  classifyPackDocument,
  documentRelativePath,
  documentThumbRelativePath,
  slugifyDocumentStem,
} from "./packDocuments";

describe("slugifyDocumentStem", () => {
  it("normalizes filenames", () => {
    expect(slugifyDocumentStem("SWSH10_Rulebook_EN.pdf")).toBe(
      "swsh10_rulebook_en",
    );
    expect(slugifyDocumentStem("Disney%20Lorcana%20CORE_2026_FR.pdf")).toBe(
      "disney_lorcana_core_2026_fr",
    );
  });
});

describe("classifyPackDocument", () => {
  it.each([
    {
      url: "https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/rulebook/swsh10_rulebook_en.pdf",
      lang: "en",
      kind: "rulebook",
    },
    {
      url: "https://assets.pokemon.com/assets/cms2-fr-fr/pdf/trading-card-game/rulebook/xy01_rulebook_fr.pdf",
      lang: "fr",
      kind: "rulebook",
    },
    {
      url: "https://assets.pokemon.com/assets/cms2-nl-nl/pdf/trading-card-game/rulebook/swsh1_rulebook_nl.pdf",
      lang: "nl",
      kind: "rulebook",
    },
    {
      url: "https://assets.pokemon.com/assets/cms-fr-fr/pdf/op/Pokemon_TCG_Penalty_Guidelines_FR.pdf",
      lang: "fr",
      kind: "penalty",
    },
    {
      url: "https://assets.pokemon.com/assets/cms/pdf/tcg/carddex/Rising_Rivals.pdf",
      lang: "en",
      kind: "checklist",
    },
    {
      url: "https://files.disneylorcana.com/Hyperia-set-notes_FR.pdf",
      lang: "fr",
      kind: "set_notes",
    },
    {
      url: "https://files.disneylorcana.com/Attack-of-the-Vine_OP-Kit-Instructions_EN.pdf",
      lang: "en",
      kind: "op",
    },
    {
      url: "https://brand.ravensburger-group.com/d/e1vhRSQ7WeNy/downloads#/set-assets/hyperia-city-1",
      lang: "und",
      kind: "brand",
    },
  ] as const)("$kind / $lang ← $url", ({ url, lang, kind }) => {
    const got = classifyPackDocument(url);
    expect(got.lang).toBe(lang);
    expect(got.kind).toBe(kind);
    expect(got.filename).toMatch(/\.\w+$/);
  });

  it("does not treat French 'de' in titles as German", () => {
    const got = classifyPackDocument(
      "https://disneylorcana.fr/wp-content/uploads/2023/05/Disney-Lorcana-guide-de-demarrage.pdf",
    );
    expect(got.lang).toBe("fr");
  });

  it.each([
    {
      url: "https://assets.pokemon.com/assets/cms/pdf/tcg/carddex/POP_Series_2.pdf",
      lang: "en",
    },
    {
      url: "https://assets.pokemon.com/assets/cms2/pdf/video-game/sword-shield/Galar_Tour_Brochure_US.pdf",
      lang: "en",
    },
    {
      url: "https://files.disneylorcana.com/CRUpdate_EN_Oct-2026.pdf",
      lang: "en",
    },
    {
      url: "https://files.disneylorcana.com/CRUpdate_FR_Oct-2026.pdf",
      lang: "fr",
    },
    {
      url: "https://files.disneylorcana.com/CORE%20-%20Lore%20Guide%20Document.pdf",
      lang: "en",
    },
  ] as const)("defaults unmarked CDN docs — $lang ← $url", ({ url, lang }) => {
    expect(classifyPackDocument(url).lang).toBe(lang);
  });

  it("respects curated hints", () => {
    const got = classifyPackDocument(
      "https://example.test/mystery.bin",
      { lang: "it", kind: "other", title: "Mystery" },
    );
    expect(got).toMatchObject({
      lang: "it",
      kind: "other",
      title: "Mystery",
    });
  });

  it("builds documents/{lang}/{kind}/{file} relative paths", () => {
    const got = classifyPackDocument(
      "https://files.disneylorcana.com/Winterspell_SetReleaseNotes_EN.pdf",
    );
    expect(documentRelativePath(got.lang, got.kind, got.filename)).toBe(
      "en/set_notes/winterspell_setreleasenotes_en.pdf",
    );
  });
});

describe("documentThumbRelativePath", () => {
  it("maps a PDF to a sibling .thumb.webp", () => {
    expect(
      documentThumbRelativePath("fr/rulebook/regles_naruto_sc.pdf"),
    ).toBe("fr/rulebook/regles_naruto_sc.thumb.webp");
  });

  it("rejects thumbs-of-thumbs and bad paths", () => {
    expect(
      documentThumbRelativePath("fr/rulebook/regles.thumb.webp"),
    ).toBeNull();
    expect(documentThumbRelativePath("../x.pdf")).toBeNull();
  });
});
