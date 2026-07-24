/** Clears scroll/pointer locks Radix can leave after dropdown → dialog chains. */
export function releaseStuckOverlayLocks() {
  if (typeof document === "undefined") return;

  document.body.style.removeProperty("pointer-events");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.removeAttribute("data-scroll-locked");

  document.documentElement.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("padding-right");
  document.documentElement.removeAttribute("data-scroll-locked");
}
