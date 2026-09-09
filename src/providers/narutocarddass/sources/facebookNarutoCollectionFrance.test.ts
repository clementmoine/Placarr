import { describe, expect, it } from "vitest";

import dig from "../curated/sources/facebook-naruto-collection-france-2026-09-02.json";

describe("facebook Naruto Collection France dig", () => {
  it("links Victor Husson group to Collection Naruto YT cross-ref", () => {
    expect(dig.group.url).toMatch(/805799330361374/);
    expect(dig.crossRefs.youtube).toContain("collection-naruto-youtube");
    expect(dig.group.adminVoice).toMatch(/Victor Husson/i);
  });

  it("documents NI-236 via DVD vol. 15 with fixed mapping", () => {
    const channel = dig.distributionChannels.find(
      (c) => c.id === "kana-dvd-naruto-vol15",
    );
    expect(channel?.fixedMapping).toBe(true);
    expect(channel?.randomPool).toBe(false);
    expect(channel?.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: "ni236", serie: 6 }),
      ]),
    );
    expect(channel?.stickerText).toMatch(/série 6/i);
  });

  it("records Jordan thread permalink and Made in Japan identification", () => {
    const post = dig.posts.find((p) => p.id === "jordan-blue-back-made-in-japan");
    expect(post?.permalink).toContain("permalink/1248487462759223");
    const victor = post?.thread?.find((t) => t.author === "Victor Husson");
    expect(victor?.claim).toMatch(/made in japan/i);
    expect(victor?.claim).toMatch(/série 6/i);
    expect(victor?.claim).toMatch(/Shippuden/i);
  });

  it("records Shippuden vol.21 promo channel from Victor comment", () => {
    const channel = dig.distributionChannels.find(
      (c) => c.id === "kana-dvd-shippuden-vol21",
    );
    expect(channel?.permalink).toContain("1228068058134497");
    expect(channel?.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: "pr100", name: "Naruto Uzumaki" }),
      ]),
    );
  });

  it("archives user packshot DVD/game insert table", () => {
    expect(dig.packshotAttestations).toHaveLength(10);
    const vol15 = dig.packshotAttestations.find(
      (p) => p.id === "kana-dvd-naruto-vol15-packshot",
    );
    expect(vol15?.cardsVisible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: "ni236" }),
        expect.objectContaining({ number: "ni232" }),
      ]),
    );
    const vol8 = dig.packshotAttestations.find(
      (p) => p.id === "kana-dvd-naruto-vol8",
    );
    expect(vol8?.cardsVisible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: "ni118" }),
        expect.objectContaining({ number: "ni119" }),
      ]),
    );
    const uns3 = dig.distributionChannels.find(
      (c) => c.id === "game-xbox360-uns3-collector-card",
    );
    expect(uns3?.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: "pr095" }),
      ]),
    );
  });

  it("documents Sage's Legacy s24 duopack variants with FB packshots", () => {
    const channel = dig.distributionChannels.find(
      (c) => c.id === "duopack-s24-fr-bipack-variants",
    );
    expect(channel?.permalink).toContain("1619206362353996");
    expect(channel?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "organisation-pacifique",
          windowPromo: expect.objectContaining({ number: "m873" }),
        }),
        expect.objectContaining({
          id: "loup-bicephale",
          windowPromo: expect.objectContaining({ number: "n1379" }),
        }),
      ]),
    );
  });

  it("flags PR-098 Double éclair pourfendeur as absent from FR catalogue", () => {
    const gap = dig.promoGapsFr?.find((p) => p.printedRef === "PR-098");
    expect(gap?.nameFr).toMatch(/Double éclair pourfendeur/i);
    const att = dig.packshotAttestations.find(
      (p) => p.id === "pr098-double-eclair-pourfendeur-binder",
    );
    expect(att?.photoUrl).toContain("1968916513588340");
    expect(att?.notToConfuseWith?.te030).toMatch(/L'éclair pourfendeur/i);
  });

  it("flags open conflict manga t1185 vs DVD vol. 15 for NI-236", () => {
    expect(dig.openConflicts.some((c) => c.id === "ni236-manga-t2-vs-dvd-vol15"))
      .toBe(true);
  });

  it("records DVD SKUs minted with packshots; blisters S6 still attestation-only", () => {
    expect(dig.doNot.join(" ")).toMatch(/EAN/i);
    expect(dig.ingest).toMatch(/mintés|minté/i);
    expect(dig.ingest).toMatch(/Blisters Kana.*attestation-only/i);
  });
});
