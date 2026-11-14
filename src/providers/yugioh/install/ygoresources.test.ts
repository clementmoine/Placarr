import { describe, expect, it } from "vitest";

import { resolveYgoresourcesFrUrl } from "./ygoresources";

describe("resolveYgoresourcesFrUrl", () => {
  it("prefers FR database path and expands protocol-relative URLs", () => {
    const url = resolveYgoresourcesFrUrl(
      {
        cards: {
          "10000": {
            "1": {
              idx: {
                en: [
                  {
                    path: "//artworks-en-n.ygoresources.com/1/0/0_1.png",
                    source: "neuron_high",
                  },
                ],
                fr: [
                  {
                    path: "//artworks-fr-db.ygoresources.com/1/0/0_1.png",
                    source: "database",
                  },
                ],
              },
            },
          },
        },
      },
      10000,
    );
    expect(url).toBe("https://artworks-fr-db.ygoresources.com/1/0/0_1.png");
  });

  it("returns null when FR slot is absent", () => {
    expect(
      resolveYgoresourcesFrUrl(
        {
          cards: {
            "1": {
              "1": {
                idx: {
                  en: [{ path: "//artworks-en-n.ygoresources.com/x.png" }],
                },
              },
            },
          },
        },
        1,
      ),
    ).toBeNull();
  });
});
