import { describe, expect, it } from "vitest";
import { waybackRawUrl } from "./waybackRawUrl";

describe("waybackRawUrl", () => {
  it("builds an id_ asset URL", () => {
    expect(
      waybackRawUrl(
        "20071018170742",
        "http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
      ),
    ).toBe(
      "https://web.archive.org/web/20071018170742id_/http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
    );
  });

  it("strips non-digits from the timestamp", () => {
    expect(waybackRawUrl("2007-10-18T17:07:42Z", "http://x/a.jpg")).toBe(
      "https://web.archive.org/web/20071018170742id_/http://x/a.jpg",
    );
  });
});
