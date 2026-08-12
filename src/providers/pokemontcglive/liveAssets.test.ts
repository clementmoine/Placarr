import { describe, expect, it } from "vitest";

import "@/effects/pokemon/liveCardsIndex";
import { buildPokemonLiveAttachments } from "./liveAssets";
import { pokemontcgliveModule } from "./index";

describe("pokemontcglive", () => {
  it("stamps tcglive-front from the local Live dump", () => {
    const attachments = buildPokemonLiveAttachments({
      printKey: "pokemon:sv03.5-006",
      language: "fr",
      name: "Dracaufeu-ex",
      title: "Dracaufeu-ex",
    });
    expect(attachments.some((a) => a.role === "tcglive-front")).toBe(true);
    expect(attachments.every((a) => a.source === "pokemontcglive")).toBe(true);
    expect(attachments[0]?.url).toContain("/assets/pokemon/");
  });

  it("resolves cover metadata from printKey when Live art exists", async () => {
    const adapter = pokemontcgliveModule.createMetadataAdapter!();
    const result = await adapter.resolve({
      name: "Dracaufeu-ex",
      printKey: "pokemon:sv03.5-006",
      type: "tcg",
    });
    expect(result?.attachments?.some((a) => a.role === "tcglive-front")).toBe(
      true,
    );
    expect(result?.externalIds?.pokemontcglive).toBe("pokemon:sv03.5-006");
  });
});
