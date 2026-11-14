import { describe, expect, it } from "vitest";

import { AdaptivePerf } from "@/lib/client/scan/adaptivePerf";

describe("AdaptivePerf", () => {
  it("keeps a rolling mean of identify cost", () => {
    const p = new AdaptivePerf({ benchWindow: 2 });
    p.recordIdentifyMs(200);
    p.recordIdentifyMs(400);
    expect(p.profile().meanIdentifyMs).toBe(300);
    p.recordIdentifyMs(600);
    expect(p.profile().meanIdentifyMs).toBe(500);
  });

  it("never exposes a tap-to-scan mode, however slow identify gets", () => {
    // A phone running on-device OCR + DINOv2 routinely sits at 2–4 s per
    // sample; the camera must keep hunting by itself.
    const p = new AdaptivePerf({ benchWindow: 4 });
    for (let i = 0; i < 8; i++) p.recordIdentifyMs(4000);
    expect(p.profile()).toEqual({ idleBackoffMs: 0, meanIdentifyMs: 4000 });
    expect("tapToScan" in p.profile()).toBe(false);
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
