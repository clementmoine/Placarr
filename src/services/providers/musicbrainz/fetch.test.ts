import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
import axios from "axios";

import {
  formatMusicTitle,
  artistFromCredit,
  fetchFromMusicBrainz,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

beforeEach(() => {
  mockedGet.mockReset();
});

describe("formatMusicTitle", () => {
  it("préfixe l'artiste au titre", () => {
    expect(
      formatMusicTitle("Yoko Shimomura", "Kingdom Hearts Orchestra -World Of Tres"),
    ).toBe("Yoko Shimomura - Kingdom Hearts Orchestra -World Of Tres");
  });

  it("ne duplique pas l'artiste déjà présent dans le titre", () => {
    expect(formatMusicTitle("Daft Punk", "Daft Punk - Discovery")).toBe(
      "Daft Punk - Discovery",
    );
  });

  it("gère l'absence d'artiste", () => {
    expect(formatMusicTitle(null, "Discovery")).toBe("Discovery");
  });
});

describe("artistFromCredit", () => {
  it("joint les artistes crédités", () => {
    expect(artistFromCredit([{ name: "A" }, { name: "B" }])).toBe("A, B");
  });
  it("renvoie null sans crédit", () => {
    expect(artistFromCredit(undefined)).toBeNull();
    expect(artistFromCredit([])).toBeNull();
  });
});

describe("fetchFromMusicBrainz", () => {
  it("résout un code-barres en nom canonique 'Artiste - Titre'", async () => {
    mockedGet.mockResolvedValue({
      data: {
        releases: [
          {
            id: "mbid-1",
            title: "Kingdom Hearts Orchestra -World Of Tres",
            score: 100,
            date: "2020-09-23",
            "artist-credit": [{ name: "Yoko Shimomura" }],
          },
        ],
      },
    } as never);

    const r = await fetchFromMusicBrainz("4988601467124");
    expect(r?.title).toContain("Yoko Shimomura");
    expect(r?.title).toContain("Kingdom Hearts Orchestra");
    expect(r?.mbid).toBe("mbid-1");
    expect(r?.imageUrl).toBeNull();
  });

  it("renvoie null quand aucune édition ne correspond (je ne sais pas)", async () => {
    mockedGet.mockResolvedValue({ data: { releases: [] } } as never);
    expect(await fetchFromMusicBrainz("0000000000000")).toBeNull();
  });

  it("renvoie null sur erreur réseau (pas de crash)", async () => {
    mockedGet.mockRejectedValue(new Error("network"));
    expect(await fetchFromMusicBrainz("4988601467124")).toBeNull();
  });
});
