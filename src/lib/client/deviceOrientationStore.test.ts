import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getOrientationSnapshot,
  orientationPermissionPending,
  pushOrientationReading,
  requestOrientationPermission,
  resetDeviceOrientationStore,
  subscribeToDeviceOrientation,
} from "@/lib/client/deviceOrientationStore";

describe("deviceOrientationStore", () => {
  beforeEach(() => {
    resetDeviceOrientationStore();
  });

  afterEach(() => {
    resetDeviceOrientationStore();
    vi.unstubAllGlobals();
  });

  it("has nothing to say before the first reading", () => {
    expect(getOrientationSnapshot()).toBeNull();
  });

  it("takes the first reading as the baseline, so a card starts at rest", () => {
    pushOrientationReading({ beta: 40, gamma: 15 });

    const snapshot = getOrientationSnapshot();
    expect(snapshot).not.toBeNull();
    // Nobody holds a phone at zero degrees; without this the card would start
    // already tipped and could never come back to flat.
    expect(snapshot!.gravity).toEqual(snapshot!.baseline);
  });

  it("keeps the baseline once set, so later readings are a change from it", () => {
    pushOrientationReading({ beta: 40, gamma: 0 });
    const first = getOrientationSnapshot()!.baseline;

    pushOrientationReading({ beta: 10, gamma: 30 });
    const later = getOrientationSnapshot()!;

    expect(later.baseline).toBe(first);
    expect(later.gravity).not.toEqual(first);
  });

  it("hands every reading to a fresh object, so a re-render is detectable", () => {
    pushOrientationReading({ beta: 40, gamma: 0 });
    const before = getOrientationSnapshot();
    pushOrientationReading({ beta: 41, gamma: 1 });

    expect(getOrientationSnapshot()).not.toBe(before);
  });

  it("returns the same object between readings, so nothing re-renders on its own", () => {
    pushOrientationReading({ beta: 40, gamma: 0 });

    expect(getOrientationSnapshot()).toBe(getOrientationSnapshot());
  });

  it("ignores a reading with no angles rather than jumping to zero", () => {
    pushOrientationReading({ beta: 40, gamma: 0 });
    const before = getOrientationSnapshot();

    pushOrientationReading({ beta: null, gamma: null });

    expect(getOrientationSnapshot()).toBe(before);
  });

  it("tells every subscriber, not only the newest", () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeToDeviceOrientation(first);
    subscribeToDeviceOrientation(second);

    pushOrientationReading({ beta: 10, gamma: 10 });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops telling a subscriber that unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToDeviceOrientation(listener);
    unsubscribe();

    pushOrientationReading({ beta: 10, gamma: 10 });

    expect(listener).not.toHaveBeenCalled();
  });

  describe("permission", () => {
    /** Tests run without a DOM, and this is a fact the store reads off `window`. */
    function stubPlatform(response?: string) {
      const requestPermission =
        response === undefined ? undefined : vi.fn(async () => response);
      const eventClass = requestPermission
        ? Object.assign(function () {}, { requestPermission })
        : function () {};
      vi.stubGlobal("window", {
        DeviceOrientationEvent: eventClass,
        // Subscribing attaches the real listener, so the stub has to be
        // window-shaped enough for that.
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      return { requestPermission };
    }

    it("is not pending on a platform that never asks", () => {
      // Every desktop, and Android: the constructor has no requestPermission.
      stubPlatform();

      expect(orientationPermissionPending()).toBe(false);
    });

    it("is pending on the platform that gates the sensor", () => {
      stubPlatform("granted");

      expect(orientationPermissionPending()).toBe(true);
    });

    it("stops being pending once granted, and says so to every card", async () => {
      stubPlatform("granted");
      // A second card, which never rendered a prompt of its own. The bug this
      // store exists to prevent is it staying blind after another card's tap.
      const otherCard = vi.fn();
      subscribeToDeviceOrientation(otherCard);

      requestOrientationPermission();
      await vi.waitFor(() => expect(otherCard).toHaveBeenCalled());

      expect(orientationPermissionPending()).toBe(false);
    });

    it("stays pending when the tap is refused", async () => {
      stubPlatform("denied");

      requestOrientationPermission();
      await Promise.resolve();
      await Promise.resolve();

      expect(orientationPermissionPending()).toBe(true);
    });

    it("does not call for permission on a platform that does not gate it", () => {
      const { requestPermission } = stubPlatform();

      requestOrientationPermission();

      expect(requestPermission).toBeUndefined();
      expect(orientationPermissionPending()).toBe(false);
    });
  });
});
