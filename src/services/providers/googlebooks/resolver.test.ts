import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
import axios from "axios";

import { createGoogleBooksResolver } from "./resolver";

const mockedGet = vi.mocked(axios.get);

beforeEach(() => {
  mockedGet.mockReset();
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
    expect(result?.facts?.find((f) => f.kind === "format")?.value).toBe(
      "Livre",
    );
    expect(
      result?.facts?.find((f) => f.kind === "content-warning")?.value,
    ).toBe("Réservé aux adultes");
  });

  it("renvoie null sans résultat", async () => {
    mockedGet.mockResolvedValue({ data: { items: [] } } as never);
    const fetchFromGoogleBooks = createGoogleBooksResolver();
    expect(await fetchFromGoogleBooks("Unknown Book")).toBeNull();
  });
});
