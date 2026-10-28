import { describe, expect, it } from "vitest";

import { nikitaCardBackUrl } from "@/providers/shared/nikita/cardlist";

import {
  NIKITA_DBC_BACK_URL,
  dbsJccNikitaBackDataPaths,
} from "./nikitaBack";

describe("dbsjcc nikita pack back", () => {
  it("points at the attested DBC sleeve URL", () => {
    expect(NIKITA_DBC_BACK_URL).toBe(
      "https://tcg-db.nikita.jp/img/card/dbc/back.jpg",
    );
    expect(nikitaCardBackUrl("dbc")).toBe(NIKITA_DBC_BACK_URL);
  });

  it("installs EN and JA under data cards as language-qualified webp", () => {
    const paths = dbsJccNikitaBackDataPaths();
    expect(paths.ja).toMatch(/[/\\]data[/\\]dragonball[/\\]jcc[/\\]cards[/\\]back\.ja\.webp$/);
    expect(paths.en).toMatch(/[/\\]data[/\\]dragonball[/\\]jcc[/\\]cards[/\\]back\.en\.webp$/);
    expect(paths.ja).not.toMatch(/curated/);
  });
});
