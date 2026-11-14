import { describe, expect, it } from "vitest";

import {
  pickSharpestFrame,
  SharpestBurst,
} from "@/lib/client/scan/sharpestBurst";

describe("SharpestBurst", () => {
  it("returns null until window elapses", () => {
    const b = new SharpestBurst<string>({ windowMs: 100 });
    expect(b.push("a", 10, 1000)).toBeNull();
    expect(b.push("b", 50, 1050)).toBeNull();
  });

  it("returns sharpest when window closes", () => {
    const b = new SharpestBurst<string>({ windowMs: 100 });
    b.push("a", 10, 1000);
    b.push("b", 80, 1040);
    const win = b.push("c", 40, 1110);
    expect(win?.payload).toBe("b");
    expect(win?.sharpness).toBe(80);
  });

  it("close() picks sharpest of bank", () => {
    const b = new SharpestBurst<number>({ windowMs: 500 });
    b.push(1, 3, 0);
    b.push(2, 9, 10);
    expect(b.close()?.payload).toBe(2);
    expect(b.isOpen).toBe(false);
  });
});

describe("pickSharpestFrame", () => {
  it("returns null for empty", () => {
    expect(pickSharpestFrame([])).toBeNull();
  });

  it("picks max sharpness", () => {
    expect(
      pickSharpestFrame([
        { payload: "x", sharpness: 1, capturedAt: 0 },
        { payload: "y", sharpness: 5, capturedAt: 1 },
      ])?.payload,
    ).toBe("y");
  });
});
