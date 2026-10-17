/**
 * One animation clock for every foil card on the page.
 *
 * Each renderer used to drive its own `requestAnimationFrame` loop. Measured on
 * a 193-card shelf at phone width, with ten cards holding a WebGL slot: **419
 * rAF callbacks per second**, and the page already down to 42fps on a desktop
 * GPU. One driver ticking ten subscribers costs sixty.
 *
 * It also fixes a fidelity bug that had nothing to do with performance. Each
 * renderer captured its own `timeOrigin` when it was created — which is when
 * the card scrolled into view — so two neighbours created seconds apart
 * shimmered out of phase. `foilCosTime`'s fastest component has a 6.3s period,
 * so a two-second offset is plainly visible. The app drives every material from
 * one global `_Time`; a shared origin restores that.
 *
 * What it does **not** buy is GPU time: ten draws are still ten draws, each on
 * its own WebGL context, so no state is shareable between them. Fillrate is the
 * business of resolution and pool size, not of this file.
 */

type FoilFrameListener = (seconds: number) => void;

const listeners = new Set<FoilFrameListener>();

let frame = 0;
let origin = 0;
/** Injected in tests; `performance.now` in the browser. */
let now: () => number = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

function tick() {
  frame = 0;
  if (listeners.size === 0) return;

  const seconds = (now() - origin) / 1000;
  // A copy: a listener that unsubscribes mid-tick must not disturb iteration.
  for (const listener of [...listeners]) listener(seconds);

  schedule();
}

function schedule() {
  if (frame || listeners.size === 0) return;
  if (typeof requestAnimationFrame !== "function") return;
  // Hidden tabs get no frames from the browser anyway; the guard is for the
  // case where something resubscribes while hidden and would otherwise queue a
  // callback that only fires on return, with a stale time.
  if (typeof document !== "undefined" && document.hidden) return;
  frame = requestAnimationFrame(tick);
}

function onVisibilityChange() {
  if (typeof document !== "undefined" && document.hidden) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    return;
  }
  schedule();
}

/**
 * Draw on every frame until the returned function is called.
 *
 * The listener receives seconds since the *shared* origin, so every card agrees
 * on where the sweep is. Subscribing does not mean a card must draw: it decides
 * per frame whether it is ready, in budget and visible.
 */
export function subscribeFoilFrame(listener: FoilFrameListener): () => void {
  if (listeners.size === 0) {
    origin = now();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
  }
  listeners.add(listener);
  schedule();

  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/** Seconds since the shared origin — for a one-off draw outside the loop. */
export function foilClockSeconds(): number {
  return origin === 0 ? 0 : (now() - origin) / 1000;
}

export function foilClockSubscriberCount(): number {
  return listeners.size;
}

/** @internal test hook. */
export function resetFoilClock(clock?: () => number): void {
  for (const listener of [...listeners]) listeners.delete(listener);
  if (frame && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frame);
  }
  frame = 0;
  origin = 0;
  now =
    clock ??
    (() =>
      typeof performance !== "undefined" ? performance.now() : Date.now());
}
