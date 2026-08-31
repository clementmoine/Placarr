import { describe, expect, it } from "vitest";

import { uprightKayouHorizontalScan } from "./narutocardsFaces";

describe("uprightKayouHorizontalScan", () => {
  it("leaves CapsuleCorp -H- portrait buffers untouched (CSS landscapePrint)", async () => {
    const buf = Buffer.from("fake-jpeg");
    const out = await uprightKayouHorizontalScan(
      buf,
      "https://capsulecorpgear.com/wp-content/uploads/CC-MR-P001-H-yoccg.jpg",
    );
    expect(out).toBe(buf);
  });
});
