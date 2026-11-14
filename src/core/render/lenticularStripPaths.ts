/**
 * Strip clip-paths for a two-image lenticular scrub (0 → 1).
 *
 * Matches lenticular-fx (subhadeeproy3902/lenticular): front layer always
 * shows image A, back layer always B; clip-path interleaves vertical (or
 * horizontal) ribs. Sub-pixel slivers collapse to hidden / full-cover rects.
 *
 * Optional sweep staggers the turn across the card (React Bits carousel).
 */
const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;

/** Collapse sub-pixel slivers so each band is owned by one layer (no gaps). */
export function lenticularSliceSplit(
  offset: number,
  sliceSize: number,
): { front: number; back: number } {
  let front = (1 - offset) * sliceSize;
  let back = sliceSize - front;
  if (front < 0.5 && back >= 0.5) {
    front = 0;
    back = sliceSize;
  } else if (back < 0.5 && front >= 0.5) {
    back = 0;
    front = sliceSize;
  }
  return { front, back };
}

/** Per-column offset with optional horizontal rake (React Bits `sweep`). */
export function lenticularSliceOffset(
  baseOffset: number,
  sliceIndex: number,
  slices: number,
  sweep = 0,
): number {
  if (sweep <= 0 || slices <= 1) return clamp(baseOffset, 0, 1);
  const t = sliceIndex / (slices - 1);
  return clamp(baseOffset + sweep * (t - 0.5), 0, 1);
}

function appendVerticalFrontSlice(
  path: string,
  sliceIndex: number,
  sliceWidth: number,
  stripeWidth: number,
  height: number,
  /** Bleed into the neighbour so AA does not leave a dark hairline. */
  overlap = 0.75,
): string {
  const x1 = sliceIndex * sliceWidth;
  const x2 = x1 + stripeWidth + overlap;
  return `${path}M${x1} 0L${x2} 0L${x2} ${height}L${x1} ${height}Z`;
}

function appendVerticalBackSlice(
  path: string,
  sliceIndex: number,
  sliceWidth: number,
  frontWidth: number,
  height: number,
  overlap = 0.75,
): string {
  const x1 = sliceIndex * sliceWidth + frontWidth - overlap;
  const x2 = (sliceIndex + 1) * sliceWidth;
  return `${path}M${x1} 0L${x2} 0L${x2} ${height}L${x1} ${height}Z`;
}

function appendHorizontalFrontSlice(
  path: string,
  sliceIndex: number,
  sliceHeight: number,
  stripeHeight: number,
  width: number,
  overlap = 0.75,
): string {
  const y1 = sliceIndex * sliceHeight;
  const y2 = y1 + stripeHeight + overlap;
  return `${path}M0 ${y1}L${width} ${y1}L${width} ${y2}L0 ${y2}Z`;
}

function appendHorizontalBackSlice(
  path: string,
  sliceIndex: number,
  sliceHeight: number,
  frontHeight: number,
  width: number,
  overlap = 0.75,
): string {
  const y1 = sliceIndex * sliceHeight + frontHeight - overlap;
  const y2 = (sliceIndex + 1) * sliceHeight;
  return `${path}M0 ${y1}L${width} ${y1}L${width} ${y2}L0 ${y2}Z`;
}

export function lenticularFrontStripPath(
  offset: number,
  slices: number,
  width: number,
  height: number,
  sweep = 0,
): string {
  if (width <= 0 || height <= 0) return "";
  const sliceWidth = width / slices;

  if (sweep <= 0) {
    const stripeWidth = (1 - offset) * sliceWidth;
    if (stripeWidth < 0.5) return "";
    if (stripeWidth >= sliceWidth - 0.5) {
      return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
    }
  }

  let path = "";
  let any = false;
  let fullCover = true;

  for (let i = 0; i < slices; i += 1) {
    const o = lenticularSliceOffset(offset, i, slices, sweep);
    const { front: stripeWidth, back: backWidth } = lenticularSliceSplit(
      o,
      sliceWidth,
    );
    if (stripeWidth < 0.5) {
      fullCover = false;
      continue;
    }
    any = true;
    if (backWidth >= 0.5) fullCover = false;
    path = appendVerticalFrontSlice(path, i, sliceWidth, stripeWidth, height);
  }

  if (!any) return "";
  if (fullCover) return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
  return path;
}

export function lenticularBackStripPath(
  offset: number,
  slices: number,
  width: number,
  height: number,
  sweep = 0,
): string {
  if (width <= 0 || height <= 0) return "";
  const sliceWidth = width / slices;

  if (sweep <= 0) {
    const backWidth = offset * sliceWidth;
    if (backWidth < 0.5) return "";
    if (backWidth >= sliceWidth - 0.5) {
      return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
    }
  }

  let path = "";
  let any = false;
  let fullCover = true;

  for (let i = 0; i < slices; i += 1) {
    const o = lenticularSliceOffset(offset, i, slices, sweep);
    const { front: frontWidth, back: backWidth } = lenticularSliceSplit(
      o,
      sliceWidth,
    );
    if (backWidth < 0.5) {
      fullCover = false;
      continue;
    }
    any = true;
    if (frontWidth >= 0.5) fullCover = false;
    path = appendVerticalBackSlice(path, i, sliceWidth, frontWidth, height);
  }

  if (!any) return "";
  if (fullCover) return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
  return path;
}

/** Horizontal bands — scrub axis vertical (1×N Kayou strips). */
export function lenticularFrontStripPathHorizontal(
  offset: number,
  slices: number,
  width: number,
  height: number,
  sweep = 0,
): string {
  if (width <= 0 || height <= 0) return "";
  const sliceHeight = height / slices;

  if (sweep <= 0) {
    const stripeHeight = (1 - offset) * sliceHeight;
    if (stripeHeight < 0.5) return "";
    if (stripeHeight >= sliceHeight - 0.5) {
      return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
    }
  }

  let path = "";
  let any = false;
  let fullCover = true;

  for (let i = 0; i < slices; i += 1) {
    const o = lenticularSliceOffset(offset, i, slices, sweep);
    const { front: stripeHeight, back: backHeight } = lenticularSliceSplit(
      o,
      sliceHeight,
    );
    if (stripeHeight < 0.5) {
      fullCover = false;
      continue;
    }
    any = true;
    if (backHeight >= 0.5) fullCover = false;
    path = appendHorizontalFrontSlice(path, i, sliceHeight, stripeHeight, width);
  }

  if (!any) return "";
  if (fullCover) return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
  return path;
}

export function lenticularBackStripPathHorizontal(
  offset: number,
  slices: number,
  width: number,
  height: number,
  sweep = 0,
): string {
  if (width <= 0 || height <= 0) return "";
  const sliceHeight = height / slices;

  if (sweep <= 0) {
    const backHeight = offset * sliceHeight;
    if (backHeight < 0.5) return "";
    if (backHeight >= sliceHeight - 0.5) {
      return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
    }
  }

  let path = "";
  let any = false;
  let fullCover = true;

  for (let i = 0; i < slices; i += 1) {
    const o = lenticularSliceOffset(offset, i, slices, sweep);
    const { front: frontHeight, back: backHeight } = lenticularSliceSplit(
      o,
      sliceHeight,
    );
    if (backHeight < 0.5) {
      fullCover = false;
      continue;
    }
    any = true;
    if (frontHeight >= 0.5) fullCover = false;
    path = appendHorizontalBackSlice(path, i, sliceHeight, frontHeight, width);
  }

  if (!any) return "";
  if (fullCover) return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
  return path;
}

/** Map pointer X (0–1) through a travel window (React Bits `travel`). */
export function lenticularTravelOffset(
  normalizedX: number,
  travel = 0.64,
): number {
  const span = clamp(travel, 0.2, 1);
  const pad = (1 - span) / 2;
  return clamp((normalizedX - pad) / span, 0, 1);
}
