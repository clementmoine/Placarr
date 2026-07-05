import { describe, expect, it } from "vitest";

import { readRawgGameplayClip } from "./resolver";

describe("readRawgGameplayClip", () => {
  it("returns the first HTTP clip URL with its label", () => {
    expect(
      readRawgGameplayClip({
        clips: {
          clips: [
            {
              clip: "https://media.rawg.io/media/clips/example.mp4",
              preview: "https://media.rawg.io/media/clips/example.jpg",
              video: "Trailer",
            },
          ],
        },
      }),
    ).toEqual({
      url: "https://media.rawg.io/media/clips/example.mp4",
      label: "Trailer",
    });
  });

  it("ignores entries without a usable clip URL", () => {
    expect(
      readRawgGameplayClip({
        clips: {
          clips: [{ clip: "", video: "Trailer" }, { clip: "ftp://bad" }],
        },
      }),
    ).toBeNull();
  });
});
