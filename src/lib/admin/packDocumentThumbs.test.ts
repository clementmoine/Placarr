import { describe, expect, it } from "vitest";

import { extractLargestPdfEmbed } from "./packDocumentThumbs";
import { isCompletePdfBytes } from "@/providers/shared/documents/harvestPackDocuments";

describe("isCompletePdfBytes", () => {
  it("requires a trailing %%EOF (not an early linearized one)", () => {
    const earlyOnly = Buffer.from(
      "%PDF-1.5\n1 0 obj<<>>endobj\nstartxref\n0\n%%EOF\n" +
        "truncated-tail-without-final-eof",
    );
    expect(isCompletePdfBytes(earlyOnly)).toBe(false);

    const complete = Buffer.from(
      "%PDF-1.5\n1 0 obj<<>>endobj\ntrailer<<>>\nstartxref\n9\n%%EOF\n",
    );
    expect(isCompletePdfBytes(complete)).toBe(true);
  });
});

describe("extractLargestPdfEmbed", () => {
  it("picks the largest DCTDecode JPEG Image XObject", () => {
    // Minimal 1×1 JPEG
    const tinyJpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
      "base64",
    );
    // Build a fake PDF with two DCT images — larger Width×Height wins.
    const small = Buffer.concat([
      Buffer.from(
        "10 0 obj<</Length " +
          tinyJpeg.length +
          "/Filter/DCTDecode/Width 10/Height 10/BitsPerComponent 8/ColorSpace/DeviceRGB/Subtype/Image>>stream\n",
      ),
      tinyJpeg,
      Buffer.from("\nendstream\nendobj\n"),
    ]);
    const large = Buffer.concat([
      Buffer.from(
        "11 0 obj<</Length " +
          tinyJpeg.length +
          "/Filter/DCTDecode/Width 400/Height 560/BitsPerComponent 8/ColorSpace/DeviceRGB/Subtype/Image>>stream\n",
      ),
      tinyJpeg,
      Buffer.from("\nendstream\nendobj\n"),
    ]);
    const pdf = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      small,
      large,
      Buffer.from("trailer<<>>\nstartxref\n0\n%%EOF\n"),
    ]);

    const embed = extractLargestPdfEmbed(pdf);
    expect(embed).not.toBeNull();
    expect(embed!.kind).toBe("jpeg");
    expect(embed!.pixels).toBe(400 * 560);
  });
});
