import { describe, expect, it } from "vitest";

import { ScanSession } from "@/lib/client/scan/scanSession";

describe("ScanSession", () => {
  it("records locks and cools down duplicates", () => {
    const s = new ScanSession({ cooldownMs: 1000 });
    const a = s.tryLock("card", "print-1", "Print 1", null, 1000);
    expect(a?.key).toBe("print-1");
    expect(s.tryLock("card", "print-1", "Print 1", null, 1500)).toBeNull();
    expect(s.isCoolingDown("card", "print-1", 1500)).toBe(true);
    const again = s.tryLock("card", "print-1", "Print 1", null, 2500);
    expect(again?.key).toBe("print-1");
    expect(s.list()).toHaveLength(2);
  });

  it("allows different keys during cooldown", () => {
    const s = new ScanSession({ cooldownMs: 5000 });
    s.tryLock("barcode", "123", "123", null, 0);
    expect(s.tryLock("card", "abc", "abc", null, 10)?.kind).toBe("card");
  });

  it("undo removes a lock and clears its cooldown", () => {
    const s = new ScanSession({ cooldownMs: 5000 });
    const lock = s.tryLock("card", "p1", "p1", null, 0);
    expect(lock).not.toBeNull();
    expect(s.remove(lock!.id)?.key).toBe("p1");
    expect(s.list()).toHaveLength(0);
    expect(s.tryLock("card", "p1", "p1", null, 10)?.key).toBe("p1");
  });

  it("force bypasses cooldown so an explicit confirm can add another copy", () => {
    const s = new ScanSession({ cooldownMs: 5000 });
    expect(s.tryLock("card", "p1", "p1", null, 0)).not.toBeNull();
    expect(s.tryLock("card", "p1", "p1", null, 10)).toBeNull();
    const forced = s.tryLock("card", "p1", "p1", null, 20, { force: true });
    expect(forced?.key).toBe("p1");
    expect(s.list()).toHaveLength(2);
  });
});
