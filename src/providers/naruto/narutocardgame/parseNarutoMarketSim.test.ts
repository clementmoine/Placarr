import { describe, expect, it } from "vitest";

import {
  narutoMarketSimFaceUrl,
  narutoMarketSimIdentity,
  narutoMarketSimPlayUrl,
  parseNarutoMarketSimCards,
} from "./parseNarutoMarketSim";

const SAMPLE = `
<script>
window.NM_SIM_CARDS = {"N-001":{"name":"Naruto Uzumaki","img":"/uploads/naruto-card-game-n-001-v20260809.webp?v=abc","text":"[Activate]","traits":"Wind","url":"/fr/cards/naruto-uzumaki-leader-n-001"},"N-017":{"name":"Orochimaru","img":"/uploads/gencon-n-orochimaru.webp?v=1","text":"Snake","traits":"Special","url":"/fr/cards/orochimaru-gen-con"},"C-001":{"name":"Chakra Card","img":"/uploads/naruto-card-game-c-001-v20260809.webp","text":"Flip","traits":"","url":"/fr/cards/chakra-card-c-001"}}; window.NM_SIM_T = {"title":"Sim"};
</script>
`;

describe("parseNarutoMarketSim", () => {
  it("builds locale play URLs", () => {
    expect(narutoMarketSimPlayUrl("fr")).toBe(
      "https://narutomarket.com/fr/play",
    );
    expect(narutoMarketSimPlayUrl("ja")).toBe(
      "https://narutomarket.com/ja/play",
    );
  });

  it("maps printed codes to demo identity", () => {
    expect(narutoMarketSimIdentity("N-001")).toEqual({
      setCode: "demo",
      number: "n001",
    });
    expect(narutoMarketSimIdentity("C-001")).toEqual({
      setCode: "demo",
      number: "c001",
    });
    expect(narutoMarketSimIdentity("")).toBeNull();
  });

  it("strips cache-busters from face URLs", () => {
    expect(
      narutoMarketSimFaceUrl(
        "/uploads/naruto-card-game-n-001-v20260809.webp?v=abc",
      ),
    ).toBe(
      "https://narutomarket.com/uploads/naruto-card-game-n-001-v20260809.webp",
    );
  });

  it("parses NM_SIM_CARDS blob", () => {
    const cards = parseNarutoMarketSimCards(SAMPLE);
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.code)).toEqual(["C-001", "N-001", "N-017"]);
    expect(cards.find((c) => c.code === "N-017")).toMatchObject({
      name: "Orochimaru",
      imagePath: "/uploads/gencon-n-orochimaru.webp?v=1",
      pagePath: "/fr/cards/orochimaru-gen-con",
    });
  });

  it("returns empty on missing blob", () => {
    expect(parseNarutoMarketSimCards("<html></html>")).toEqual([]);
  });
});
