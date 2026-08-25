import { describe, expect, it } from "vitest";

import { canonicalizeUrl, stagingRelFromUrl } from "./waybackSiteMirror";

describe("stagingRelFromUrl", () => {
  it("strips /naruto/ and lowercases", () => {
    expect(
      stagingRelFromUrl(
        "http://www.bandaicg.com/naruto/images/cards_s1/N001.jpg",
        { stripPathPrefix: "/naruto/" },
      ),
    ).toBe("images/cards_s1/n001.jpg");
  });

  it("encodes query into the filename", () => {
    expect(
      stagingRelFromUrl(
        "http://www.bandaicg.com/naruto/cardlists_detail.php?s=1&c=n001",
        { stripPathPrefix: "/naruto/" },
      ),
    ).toBe("cardlists_detail__s=1_c=n001.php");
  });

  it("can prefix host for multi-host mirrors", () => {
    expect(
      stagingRelFromUrl(
        "http://www.carddas.com/naruto/cardlist/card_img/jutsu-027_spc2.gif",
        { stripPathPrefix: "/naruto/", includeHost: true },
      ),
    ).toBe("www.carddas.com/cardlist/card_img/jutsu-027_spc2.gif");
  });

  it("rejects polluted archive-url paths", () => {
    expect(
      stagingRelFromUrl(
        "http://www.bandaicg.com/naruto/cardlists_s1.html%7Carchive-url=x",
        { stripPathPrefix: "/naruto/" },
      ),
    ).toBeNull();
  });
});

describe("canonicalizeUrl", () => {
  it("drops default ports and hash", () => {
    expect(canonicalizeUrl("http://www.carddas.com:80/naruto/#x")).toBe(
      "http://www.carddas.com/naruto",
    );
  });
});
