/**
 * Frame-driven vision loop: requestVideoFrameCallback when available,
 * requestAnimationFrame fallback. Skips a frame when the previous pass is
 * still marked busy (backpressure); otherwise schedules the next after work.
 */

export type VideoFrameLoopHandle = {
  stop: () => void;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, meta: unknown) => void,
  ) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export type VideoFrameLoopOptions = {
  /**
   * When true at the start of a presented frame, skip work and wait for the
   * next frame (caller still mid-pass). Default: always run.
   */
  isBusy?: () => boolean;
};

/**
 * Schedule `onFrame` once per presented video frame (or rAF).
 */
export function startVideoFrameLoop(
  video: HTMLVideoElement | null | undefined,
  onFrame: () => void,
  opts?: VideoFrameLoopOptions,
): VideoFrameLoopHandle {
  let stopped = false;
  let rafId: number | null = null;
  let vfcId: number | null = null;
  let passBusy = false;

  const tick = () => {
    if (stopped) return;
    if (passBusy || opts?.isBusy?.()) {
      // Drop this frame; ask for the next one.
      schedule();
      return;
    }
    passBusy = true;
    try {
      onFrame();
    } catch {
      /* soft */
    } finally {
      passBusy = false;
      if (!stopped) schedule();
    }
  };

  const schedule = () => {
    if (stopped) return;
    const v = video as VideoWithFrameCallback | null | undefined;
    if (v && typeof v.requestVideoFrameCallback === "function") {
      vfcId = v.requestVideoFrameCallback(() => {
        vfcId = null;
        tick();
      });
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      tick();
    });
  };

  schedule();

  return {
    stop: () => {
      stopped = true;
      const v = video as VideoWithFrameCallback | null | undefined;
      if (vfcId != null && v?.cancelVideoFrameCallback) {
        v.cancelVideoFrameCallback(vfcId);
      }
      if (rafId != null) cancelAnimationFrame(rafId);
    },
  };
}
