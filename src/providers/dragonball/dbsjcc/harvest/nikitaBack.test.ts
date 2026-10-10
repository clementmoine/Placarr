import { describe, expect, it } from "vitest";

import { nikitaCardBackUrl } from "@/providers/shared/nikita/cardlist";

import {
  NIKITA_DBC_BACK_URL,
  dbsJccNikitaBackCuratedPaths,
} from "./nikitaBack";

describe("dbsjcc nikita pack back", () => {
  it("points at the attested DBC sleeve URL", () => {
    expect(NIKITA_DBC_BACK_URL).toBe(
      "https://tcg-db.nikita.jp/img/card/dbc/back.jpg",
    );
    expect(nikitaCardBackUrl("dbc")).toBe(NIKITA_DBC_BACK_URL);
  });

  it("installs EN and JA as language-qualified curated backs", () => {
    const paths = dbsJccNikitaBackCuratedPaths();
    expect(paths.ja.endsWith("cards/back.ja.jpg")).toBe(true);
    expect(paths.en.endsWith("cards/back.en.jpg")).toBe(true);
  });
});
