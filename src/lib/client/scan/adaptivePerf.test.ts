import { describe, expect, it } from "vitest";

import { AdaptivePerf } from "@/lib/client/scan/adaptivePerf";

describe("AdaptivePerf", () => {
  it("stays continuous until slow threshold", () => {
    const p = new AdaptivePerf({ slowThresholdMs: 1000, benchWindow: 4 });
    p.recordIdentifyMs(200);
    p.recordIdentifyMs(250);
    expect(p.profile().tapToScan).toBe(false);
  });

  it("switches to tap-to-scan when mean is slow", () => {
    const p = new AdaptivePerf({ slowThresholdMs: 500, benchWindow: 2 });
    p.recordIdentifyMs(600);
    p.recordIdentifyMs(700);
    expect(p.profile().tapToScan).toBe(true);
  });

  it("recovers to continuous when mean cools below recover threshold", () => {
    const p = new AdaptivePerf({
      slowThresholdMs: 1000,
      recoverThresholdMs: 400,
      benchWindow: 4,
    });
    p.recordIdentifyMs(1200);
    p.recordIdentifyMs(1200);
    expect(p.profile().tapToScan).toBe(true);
    p.recordIdentifyMs(200);
    p.recordIdentifyMs(200);
    p.recordIdentifyMs(200);
    p.recordIdentifyMs(200);
    expect(p.profile().tapToScan).toBe(false);
  });

  it("applies idle backoff after aimless frames", () => {
    const p = new AdaptivePerf({
      idleFramesBeforeBackoff: 3,
      idleBackoffMs: 300,
    });
    p.noteAim(false);
    p.noteAim(false);
    expect(p.profile().idleBackoffMs).toBe(0);
    p.noteAim(false);
    expect(p.profile().idleBackoffMs).toBe(300);
    p.noteAim(true);
    expect(p.profile().idleBackoffMs).toBe(0);
  });
});
