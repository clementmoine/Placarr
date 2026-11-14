/**
 * Item-page sibling swipe (prev/next) must not fight horizontal carousels or
 * 3D manipulators. Shared by keyboard ignore + touch start/end.
 */

const INTERACTIVE_OR_SWIPE_BLOCKER =
  'a, button, input, textarea, select, [role="button"], [role="textbox"], [contenteditable="true"], [data-no-item-swipe], [data-slot="carousel"]';

/** Pure: does this box's overflow-x allow a horizontal pan? */
export function canScrollOverflowX(box: {
  overflowX: string;
  scrollWidth: number;
  clientWidth: number;
}): boolean {
  const { overflowX } = box;
  if (
    overflowX !== "auto" &&
    overflowX !== "scroll" &&
    overflowX !== "overlay"
  ) {
    return false;
  }
  return box.scrollWidth > box.clientWidth + 1;
}

/** True when `target` sits inside a horizontally scrollable overflow region. */
export function isInsideHorizontalScrollRegion(
  target: EventTarget | null,
): boolean {
  if (typeof document === "undefined") return false;
  if (!(target instanceof Element)) return false;
  let el: Element | null = target;
  while (el && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      const { overflowX } = getComputedStyle(el);
      if (
        canScrollOverflowX({
          overflowX,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        })
      ) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Skip item sibling navigation for interactive controls, tagged 3D surfaces,
 * Embla carousels, and any live horizontal scroll strip.
 */
export function shouldIgnoreItemSiblingNavigation(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(INTERACTIVE_OR_SWIPE_BLOCKER)) return true;
  return isInsideHorizontalScrollRegion(target);
}
