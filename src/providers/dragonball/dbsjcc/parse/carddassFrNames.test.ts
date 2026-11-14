import { describe, expect, it } from "vitest";

import {
  parseCarddassFrCardPageName,
  printedFromCarddassFrCardPath,
} from "./carddassFrNames";

describe("carddassFrNames", () => {
  it("reads the official FR name from a fiche HTML", () => {
    const html = `
      <td class="textBorange">::
              Dragon Ball &agrave; 5 &eacute;toiles ::</td>
    `;
    expect(parseCarddassFrCardPageName(html)).toBe("Dragon Ball à 5 étoiles");
  });

  it("maps fiche paths to printed numbers", () => {
    expect(
      printedFromCarddassFrCardPath(
        "http://www.carddass.fr/dbz/cartes/D-127.htm",
      ),
    ).toEqual({ printed: "D-127", number: "d0127" });
    expect(
      printedFromCarddassFrCardPath(
        "http://www.carddass.fr:80/dbz/cartes/D-001.htm",
      ),
    ).toEqual({ printed: "D-1", number: "d0001" });
  });
});
