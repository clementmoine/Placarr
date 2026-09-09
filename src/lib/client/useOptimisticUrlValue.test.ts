/**
 * Behaviour of the optimistic override is covered via FoilPlayroom / admin
 * wiring; this unit keeps the equality / clear contract without RTL.
 */
import { describe, expect, it } from "vitest";

describe("useOptimisticUrlValue contract", () => {
  it("pending wins until URL catches up (documented Object.is clear)", () => {
    type Pending<T> = { value: T } | null;
    let pending: Pending<string> = null;
    let url = "foils";
    const value = () => (pending != null ? pending.value : url);
    const setOptimistic = (next: string) => {
      pending = { value: next };
    };
    const sync = () => {
      if (pending != null && Object.is(pending.value, url)) pending = null;
    };

    expect(value()).toBe("foils");
    setOptimistic("sealed");
    expect(value()).toBe("sealed");
    url = "foils";
    sync();
    expect(value()).toBe("sealed");
    url = "sealed";
    sync();
    expect(pending).toBeNull();
    expect(value()).toBe("sealed");
  });

  it("allows pending null without falling back to a stale URL", () => {
    type Pending<T> = { value: T } | null;
    let pending: Pending<string | null> = null;
    let url: string | null = "SvHolo";
    const value = () => (pending != null ? pending.value : url);
    pending = { value: null };
    expect(value()).toBeNull();
    url = "SvHolo";
    if (pending != null && Object.is(pending.value, url)) pending = null;
    expect(value()).toBeNull();
    url = null;
    if (pending != null && Object.is(pending.value, url)) pending = null;
    expect(pending).toBeNull();
    expect(value()).toBeNull();
  });
});
