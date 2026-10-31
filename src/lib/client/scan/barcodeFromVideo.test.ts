import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectBarcodeFromVideo,
  detectBarcodeHitFromVideo,
  isBarcodeDetectorSupported,
  resetBarcodeDetectorForTests,
} from "./barcodeFromVideo";

afterEach(() => {
  resetBarcodeDetectorForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isBarcodeDetectorSupported", () => {
  it("is true in a browser-like env (native or ZXing ponyfill)", () => {
    expect(isBarcodeDetectorSupported()).toBe(true);
  });
});

describe("detectBarcodeFromVideo", () => {
  it("returns null when the video has no dimensions yet", async () => {
    const video = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
    await expect(detectBarcodeFromVideo(video)).resolves.toBeNull();
  });

  it("returns the first native detector hit when available", async () => {
    const detect = vi.fn(async () => [{ rawValue: " 3323036008855 " }]);
    class FakeDetector {
      detect = detect;
    }
    vi.stubGlobal("BarcodeDetector", FakeDetector);

    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    await expect(detectBarcodeFromVideo(video)).resolves.toBe("3323036008855");
    expect(detect).toHaveBeenCalledWith(video);
  });

  it("returns null when the detector finds nothing", async () => {
    class EmptyDetector {
      detect = async () => [];
    }
    vi.stubGlobal("BarcodeDetector", EmptyDetector);

    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    await expect(detectBarcodeFromVideo(video)).resolves.toBeNull();
  });
});

describe("detectBarcodeHitFromVideo", () => {
  it("includes boundingBox when the detector provides one", async () => {
    class BoxedDetector {
      detect = async () => [
        {
          rawValue: "5901234123457",
          boundingBox: { x: 10, y: 20, width: 200, height: 80 },
        },
      ];
    }
    vi.stubGlobal("BarcodeDetector", BoxedDetector);

    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    await expect(detectBarcodeHitFromVideo(video)).resolves.toEqual({
      value: "5901234123457",
      box: { x: 10, y: 20, width: 200, height: 80 },
    });
  });
});

