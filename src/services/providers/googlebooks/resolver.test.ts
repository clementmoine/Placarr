import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
import axios from "axios";
import * as remoteFetch from "@/lib/media/remoteFetch";
import * as coverPlaceholderServer from "@/lib/media/coverPlaceholder.server";

import { createGoogleBooksResolver } from "./resolver";

const mockedGet = vi.mocked(axios.get);

beforeEach(() => {
  mockedGet.mockReset();
  vi.spyOn(remoteFetch, "fetchRemoteImageBuffer").mockImplementation(
    async (url) => ({
      buffer: Buffer.from("cover-bytes"),
      sourceUrl: url,
    }),
  );
  vi.spyOn(
    coverPlaceholderServer,
    "isUnavailableCoverPlaceholderBuffer",
  ).mockResolvedValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createGoogleBooksResolver", () => {
  it("résout un ISBN en métadonnées livre", async () => {
    mockedGet.mockResolvedValue({
      data: {
        items: [
          {
            id: "abc123",
            volumeInfo: {
              title: "Fantastic Mr. Fox",
              authors: ["Roald Dahl"],
              publisher: "Puffin",
              publishedDate: "1974",
              pageCount: 96,
              printType: "BOOK",
              maturityRating: "MATURE",
              description: "A clever fox outwits farmers.",
              previewLink: "https://books.google.com/preview",
              infoLink: "https://books.google.com/info",
              readingModes: { text: true, image: true },
              industryIdentifiers: [
                { type: "ISBN_13", identifier: "9780140328721" },
              ],
              imageLinks: {
                thumbnail: "http://books.google.com/thumb.jpg",
              },
            },
          },
        ],
      },
    } as never);

    const fetchFromGoogleBooks = createGoogleBooksResolver();
    const result = await fetchFromGoogleBooks("", "9780140328721");

    expect(result?.title).toBe("Fantastic Mr. Fox");
    expect(result?.barcode).toBe("9780140328721");
    expect(result?.authors).toEqual([{ name: "Roald Dahl" }]);
    expect(result?.pageCount).toBe(96);
    expect(result?.releaseDate).toBe("1974-01-01");
    expect(result?.imageUrl).toBe("https://books.google.com/thumb.jpg");
    expect(
      result?.facts?.find((f) => f.kind === "format" && f.label === "Type")
        ?.value,
    ).toBe("Livre");
    expect(
      result?.facts?.find((f) => f.kind === "content-warning")?.value,
    ).toBe("Réservé aux adultes");
    expect(result?.facts?.find((f) => f.label === "Aperçu")?.url).toBe(
      "https://books.google.com/preview",
    );
    expect(
      result?.facts?.find((f) => f.label === "Modes de lecture")?.value,
    ).toBe("Texte + Illustrations");
  });

  it("émet un public tout public pour NOT_MATURE", async () => {
    mockedGet.mockResolvedValue({
      data: {
        items: [
          {
            id: "abc123",
            volumeInfo: {
              title: "Sample Book",
              maturityRating: "NOT_MATURE",
            },
          },
        ],
      },
    } as never);

    const result = await createGoogleBooksResolver()("Sample Book");
    expect(
      result?.facts?.find((f) => f.kind === "content-warning")?.value,
    ).toBe("Tout public");
  });

  it("renvoie null sans résultat", async () => {
    mockedGet.mockResolvedValue({ data: { items: [] } } as never);
    const fetchFromGoogleBooks = createGoogleBooksResolver();
    expect(await fetchFromGoogleBooks("Unknown Book")).toBeNull();
  });

  it("ignore les couvertures Google Books placeholder", async () => {
    mockedGet.mockResolvedValue({
      data: {
        items: [
          {
            id: "abc123",
            volumeInfo: {
              title: "Sans couverture",
              imageLinks: {
                thumbnail: "https://books.google.com/books/content?id=xsXn",
              },
            },
          },
        ],
      },
    } as never);
    vi.spyOn(
      coverPlaceholderServer,
      "isUnavailableCoverPlaceholderBuffer",
    ).mockResolvedValue(true);

    const result = await createGoogleBooksResolver()("Sans couverture");

    expect(result?.title).toBe("Sans couverture");
    expect(result?.imageUrl).toBeUndefined();
    expect(result?.attachments).toEqual([]);
  });
});
