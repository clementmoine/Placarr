import { describe, expect, it } from "vitest";

import { parseApacheIndexHtml } from "./buildApacheIndex";

describe("parseApacheIndexHtml", () => {
  it("extracts directory + relative image names", () => {
    const html = `<!DOCTYPE HTML>
<html><head><title>Index of /naruto/images/cartes/5/ninja</title></head>
<body>
<pre>
<a href="/naruto/images/cartes/5/">Parent Directory</a>
<a href="NI-232.jpg">NI-232.jpg</a>
<a href="ni236.jpg.LCK">ni236.jpg.LCK</a>
<a href="TE-212.JPG">TE-212.JPG</a>
<a href="tableaux%20pour%20JO.pdf">tableaux pour JO.pdf</a>
</pre>
</body></html>`;
    const parsed = parseApacheIndexHtml(html);
    expect(parsed?.dir).toBe("/naruto/images/cartes/5/ninja/");
    expect(parsed?.files).toEqual([
      "NI-232.jpg",
      "tableaux pour JO.pdf",
      "TE-212.JPG",
    ]);
  });

  it("returns null for non-index pages", () => {
    expect(parseApacheIndexHtml("<title>News</title>")).toBeNull();
  });
});
