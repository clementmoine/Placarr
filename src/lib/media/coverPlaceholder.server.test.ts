import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { isUnavailableCoverPlaceholderBuffer } from "./coverPlaceholder.server";

const SPANISH_PLACEHOLDER = path.join(
  process.cwd(),
  "public/uploads/2d58dcfbeb6538eae3494b4752ce883c.webp",
);
const BGG_DARK_COVER = path.join(
  import.meta.dirname,
  "__fixtures__/bgg-dark-boardgame-cover.jpg",
);

describe("isUnavailableCoverPlaceholderBuffer", () => {
  it("detects the localized Google Books no-cover tile", async () => {
    if (!fs.existsSync(SPANISH_PLACEHOLDER)) return;

    const buffer = fs.readFileSync(SPANISH_PLACEHOLDER);
    await expect(isUnavailableCoverPlaceholderBuffer(buffer)).resolves.toBe(
      true,
    );
  });

  it("accepts a dark real board-game cover that resembles the tile shape", async () => {
    if (!fs.existsSync(BGG_DARK_COVER)) return;

    const buffer = fs.readFileSync(BGG_DARK_COVER);
    await expect(isUnavailableCoverPlaceholderBuffer(buffer)).resolves.toBe(
      false,
    );
  });

  it("rejects a typical real cover buffer size/shape", async () => {
    const buffer = Buffer.alloc(120_000, 128);
    await expect(isUnavailableCoverPlaceholderBuffer(buffer)).resolves.toBe(
      false,
    );
  });
});
