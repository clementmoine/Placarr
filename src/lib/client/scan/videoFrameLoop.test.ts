import { afterEach, describe, expect, it, vi } from "vitest";

import { startVideoFrameLoop } from "@/lib/client/scan/videoFrameLoop";

describe("startVideoFrameLoop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips work while isBusy (backpressure)", () => {
    const calls: number[] = [];
    let busy = false;
    let frameCb: (() => void) | null = null;

    const video = {
      requestVideoFrameCallback: (cb: () => void) => {
        frameCb = cb;
        return 1;
      },
      cancelVideoFrameCallback: () => {
        frameCb = null;
      },
    } as unknown as HTMLVideoElement;

    const loop = startVideoFrameLoop(
      video,
      () => {
        calls.push(1);
      },
      { isBusy: () => busy },
    );

    // First scheduled callback.
    expect(frameCb).toBeTypeOf("function");
    frameCb!();
    expect(calls).toHaveLength(1);

    busy = true;
    frameCb!();
    expect(calls).toHaveLength(1);

    busy = false;
    frameCb!();
    expect(calls).toHaveLength(2);

    loop.stop();
  });

  it("falls back to requestAnimationFrame without rVFC", () => {
    const queued: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queued.push(cb);
      return queued.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);

    let n = 0;
    const loop = startVideoFrameLoop(null, () => {
      n += 1;
    });
    expect(queued).toHaveLength(1);
    queued.shift()!(0);
    expect(n).toBe(1);
    expect(queued).toHaveLength(1);
    loop.stop();
  });
});

