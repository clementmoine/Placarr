import { describe, expect, it } from "vitest";

import {
  dataCarddassEbayIngestFaces,
  dataCarddassEbayListingImageFull,
} from "./ebayFaces";
import { parseDataCarddassPrinted } from "../printKey";

describe("dataCarddass ebay faces ledger", () => {
  it("keeps s-l1600 and only ingestible mikanshop faces", () => {
    expect(
      dataCarddassEbayListingImageFull(
        "https://i.ebayimg.com/images/g/jjQAAOSwTONoBbKE/s-l500.webp",
      ),
    ).toBe("https://i.ebayimg.com/images/g/jjQAAOSwTONoBbKE/s-l1600.webp");
    const faces = dataCarddassEbayIngestFaces();
    expect(faces.length).toBe(19);
    expect(faces.every((row) => row.lang === "ja")).toBe(true);
    expect(
      faces.every((row) => parseDataCarddassPrinted(row.printedRef) !== null),
    ).toBe(true);
    expect(faces.find((row) => row.printedRef === "NF-141")?.title).toBe(
      "Itachi Uchiha",
    );
  });
});
