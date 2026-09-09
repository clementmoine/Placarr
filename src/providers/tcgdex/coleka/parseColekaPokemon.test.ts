import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  colekaFullFaceUrl,
  colekaMcdoLocalId,
  parseColekaPokemonMcdoListing,
} from "./parseColekaPokemon";

const FIXTURE = path.join(
  __dirname,
  "fixtures",
  "m23fr-listing.html",
);

describe("colekaMcdoLocalId", () => {
  it("strips leading zeros from Ref. NNN/MMM", () => {
    expect(colekaMcdoLocalId("004/015")).toBe("4");
    expect(colekaMcdoLocalId("015/015")).toBe("15");
    expect(colekaMcdoLocalId("1/15")).toBe("1");
  });
});

describe("parseColekaPokemonMcdoListing", () => {
  it("reads all 15 M23fr cards with full face URLs", () => {
    const html = readFileSync(FIXTURE, "utf8");
    const cards = parseColekaPokemonMcdoListing(html);
    expect(cards).toHaveLength(15);
    expect(cards.map((c) => c.localId)).toEqual(
      Array.from({ length: 15 }, (_, i) => String(i + 1)),
    );
    const pietace = cards.find((c) => c.localId === "4");
    expect(pietace).toMatchObject({
      name: "Piétacé",
      printed: "004/015",
    });
    expect(pietace!.thumbUrl).toContain("_250x250");
    expect(pietace!.faceUrl).toBe(colekaFullFaceUrl(pietace!.thumbUrl));
    expect(pietace!.faceUrl).not.toContain("_250x250");
    expect(pietace!.faceUrl).toContain("pietace-004-015");
  });
});
