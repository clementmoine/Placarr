import { describe, expect, it, vi, beforeEach } from "vitest";

const { musicbrainzResolve, discogsResolve, deezerResolve } = vi.hoisted(
  () => ({
    musicbrainzResolve: vi.fn(),
    discogsResolve: vi.fn(),
    deezerResolve: vi.fn(),
  }),
);

vi.mock("@/services/metadataResolvers", () => ({
  metadataProviderResolverMap: new Map([
    ["musicbrainz", { id: "musicbrainz", resolve: musicbrainzResolve }],
    ["discogs", { id: "discogs", resolve: discogsResolve }],
    ["deezer", { id: "deezer", resolve: deezerResolve }],
  ]),
}));
vi.mock("@/services/metadataProviderSelection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/metadataProviderSelection")>();
  return {
    ...actual,
    orderedProviderIdsForType: (_type: string, order: string[]) => order,
  };
});

import { fetchFromAllMusicSources } from "@/services/metadataMusicFetch";

describe("fetchFromAllMusicSources", () => {
  beforeEach(() => {
    musicbrainzResolve.mockReset();
    discogsResolve.mockReset();
    deezerResolve.mockReset();
  });

  it("fusionne MusicBrainz, Discogs et Deezer avec fieldEvidence", async () => {
    musicbrainzResolve.mockResolvedValue({
      title: "Discovery",
      authors: [{ name: "Daft Punk" }],
    });
    discogsResolve.mockResolvedValue({ title: "Discovery" });
    deezerResolve.mockResolvedValue({
      title: "Discovery",
      imageUrl: "https://cdn/discovery.jpg",
    });

    const res = await fetchFromAllMusicSources("Discovery", "0724384960650");

    expect(res?.title).toBe("Discovery");
    expect(res?.fieldEvidence?.some((e) => e.source === "MusicBrainz")).toBe(
      true,
    );
    expect(res?.fieldEvidence?.some((e) => e.source === "Discogs")).toBe(true);
    expect(res?.fieldEvidence?.some((e) => e.source === "Deezer")).toBe(true);
  });

  it("retourne null si aucune source ne répond", async () => {
    musicbrainzResolve.mockResolvedValue(null);
    discogsResolve.mockResolvedValue(null);
    deezerResolve.mockResolvedValue(null);

    expect(
      await fetchFromAllMusicSources("Inconnu", "0000000000000"),
    ).toBeNull();
  });

  it("fonctionne avec une seule source disponible", async () => {
    musicbrainzResolve.mockResolvedValue(null);
    discogsResolve.mockResolvedValue(null);
    deezerResolve.mockResolvedValue({ title: "Solo Album" });

    const res = await fetchFromAllMusicSources("Solo Album");

    expect(res?.title).toBe("Solo Album");
  });
});
