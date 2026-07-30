import { afterEach, describe, expect, it } from "vitest";

import {
  acquireFoilSlot,
  foilPoolSize,
  hasFoilSlot,
  releaseFoilSlot,
  resetFoilPoolForTests,
  setFoilPoolMax,
  subscribeFoilPool,
} from "./pool";

describe("foil pool", () => {
  afterEach(() => {
    resetFoilPoolForTests();
  });

  it("acquires and releases slots", () => {
    expect(acquireFoilSlot("a")).toBe(true);
    expect(hasFoilSlot("a")).toBe(true);
    expect(foilPoolSize()).toBe(1);

    releaseFoilSlot("a");
    expect(hasFoilSlot("a")).toBe(false);
    expect(foilPoolSize()).toBe(0);
  });

  it("re-acquires an already-held id without consuming another slot", () => {
    setFoilPoolMax(1);
    expect(acquireFoilSlot("a")).toBe(true);
    expect(acquireFoilSlot("a")).toBe(true);
    expect(foilPoolSize()).toBe(1);
  });

  it("refuses new ids when the pool is full", () => {
    setFoilPoolMax(2);
    expect(acquireFoilSlot("a")).toBe(true);
    expect(acquireFoilSlot("b")).toBe(true);
    expect(acquireFoilSlot("c")).toBe(false);
    expect(foilPoolSize()).toBe(2);
  });

  it("allows a new id after a release frees a slot", () => {
    setFoilPoolMax(1);
    expect(acquireFoilSlot("a")).toBe(true);
    expect(acquireFoilSlot("b")).toBe(false);

    releaseFoilSlot("a");
    expect(acquireFoilSlot("b")).toBe(true);
    expect(foilPoolSize()).toBe(1);
  });

  it("notifies subscribers when a held slot is released", () => {
    setFoilPoolMax(1);
    expect(acquireFoilSlot("a")).toBe(true);
    expect(acquireFoilSlot("b")).toBe(false);

    let woke = 0;
    const stop = subscribeFoilPool(() => {
      woke += 1;
    });
    releaseFoilSlot("a");
    expect(woke).toBe(1);
    expect(acquireFoilSlot("b")).toBe(true);
    stop();
  });

  it("ignores release of an unknown id", () => {
    releaseFoilSlot("missing");
    expect(foilPoolSize()).toBe(0);
  });
});
