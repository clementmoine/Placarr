import { describe, expect, it } from "vitest";

import "@/effects/pokemon/liveCardsIndex";
import { buildPokemonLiveAttachments } from "./liveAssets";
import { pokemontcgliveModule } from "../index";

describe("pokemontcglive", () => {
  it("exposes disk face gallery (or Live front fallback) for a known print", () => {
    const attachments = buildPokemonLiveAttachments({
      printKey: "pokemon:sv03.5-006",
      language: "fr",
      name: "Dracaufeu-ex",
      title: "Dracaufeu-ex",
    });
    expect(attachments.length).toBeGreaterThan(0);
    expect(attachments.every((a) => a.source === "pokemontcglive")).toBe(true);
    expect(attachments[0]?.url).toContain("/assets/pokemon/");
    expect(
      attachments.some(
        (a) =>
          a.role === "tcglive-front" ||
          (a.role?.startsWith("pokemon-face-") ?? false),
      ),
    ).toBe(true);
  });

  it("resolves cover metadata from printKey when Live art exists", async () => {
    const adapter = pokemontcgliveModule.createMetadataAdapter!();
    if (!adapter)
      throw new Error("pokemontcglive: pas d'adaptateur de métadonnées");
    const result = await adapter.resolve({
      name: "Dracaufeu-ex",
      printKey: "pokemon:sv03.5-006",
      type: "tcg",
    });
    expect(result?.attachments?.length).toBeGreaterThan(0);
    expect(result?.externalIds?.pokemontcglive).toBe("pokemon:sv03.5-006");
    expect(result?.imageUrl).toBeTruthy();
  });
});
