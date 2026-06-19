import { describe, expect, it } from "vitest";

import { itemPath, shelfPath } from "./slugs";

describe("shelfPath", () => {
  it("prefers persisted slug over computed slug from name", () => {
    expect(shelfPath({ id: "s1", name: "New Name", slug: "old-name" })).toBe(
      "/shelves/old-name",
    );
  });
});

describe("itemPath", () => {
  it("prefers persisted slug so links stay stable after title presentation", () => {
    expect(
      itemPath(
        { id: "s1", name: "Wii", slug: "wii" },
        {
          id: "i1",
          name: "Super Monkey Ball: Banana Blitz",
          slug: "super-monkey-ball-banana-blitz-complet-vf",
        },
      ),
    ).toBe("/shelves/wii/super-monkey-ball-banana-blitz-complet-vf");
  });
});
