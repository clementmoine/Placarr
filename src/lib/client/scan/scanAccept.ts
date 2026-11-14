/**
 * Multi-frame accept layer (OpenRift-style semantics, original code).
 * Turns per-frame winners into locks only after a weighted run with margin.
 * Never locks on a single lucky frame unless lockRun ≤ max frame weight.
 */

export type FrameWinner = {
  key: string;
  artKey: string;
  /** 0..1 similarity / confidence. */
  score: number;
  /** Best rival art score 0..1 (0 if none). */
  rivalScore: number;
};

export type FrameDecision = {
  winner: FrameWinner | null;
  /** True when top score exists but margin vs rival art is too thin. */
  refused: boolean;
};

export type AlignedOptions = {
  minScore: number;
  minMargin: number;
};

export const DEFAULT_ALIGNED_OPTIONS: AlignedOptions = {
  minScore: 0.55,
  minMargin: 0.12,
};

const ALIGNED_FULL_WEIGHT_SCORE = 0.95;
export const MAX_FRAME_WEIGHT = 2;

/** Pick a frame winner from scored candidates keyed by print / art. */
export function pickAlignedWinner(
  scores: readonly { key: string; score: number }[],
  artKeyOf: (key: string) => string,
  options: AlignedOptions = DEFAULT_ALIGNED_OPTIONS,
): FrameDecision {
  let best: { key: string; score: number } | null = null;
  for (const entry of scores) {
    if (Number.isFinite(entry.score) && (!best || entry.score > best.score)) {
      best = entry;
    }
  }
  if (!best || best.score < options.minScore) {
    return { winner: null, refused: false };
  }
  const artKey = artKeyOf(best.key);
  let rival = Number.NEGATIVE_INFINITY;
  for (const entry of scores) {
    if (Number.isFinite(entry.score) && artKeyOf(entry.key) !== artKey) {
      rival = Math.max(rival, entry.score);
    }
  }
  const rivalScore = Number.isFinite(rival) ? Math.max(0, rival) : 0;
  if (best.score - rivalScore < options.minMargin) {
    return { winner: null, refused: true };
  }
  return {
    winner: {
      key: best.key,
      artKey,
      score: best.score,
      rivalScore,
    },
    refused: false,
  };
}

/** Stronger matches contribute more toward lockRun. */
export function alignedFrameWeight(
  winner: FrameWinner,
  options: AlignedOptions = DEFAULT_ALIGNED_OPTIONS,
): number {
  const denom = ALIGNED_FULL_WEIGHT_SCORE - options.minScore;
  if (denom <= 0) return 1;
  const strength = (winner.score - options.minScore) / denom;
  return 1 + (MAX_FRAME_WEIGHT - 1) * Math.max(0, Math.min(1, strength));
}

export type AcceptOptions = {
  /** Cumulative runWeight required to lock (default 2 ≈ two medium frames). */
  lockRun: number;
  /** Frames allowed between sightings before the run resets. */
  maxGapFrames: number;
  /** After a lock, other tracks must rearm before locking again. */
  relockOnlyAfterRearm?: boolean;
};

export const DEFAULT_ACCEPT_OPTIONS: AcceptOptions = {
  lockRun: 2,
  maxGapFrames: 3,
  relockOnlyAfterRearm: true,
};

export type ArtTrack = {
  artKey: string;
  key: string;
  firstSeen: number;
  sightings: number;
  runLength: number;
  runWeight: number;
  lockedThisRun: boolean;
  lastFrame: number;
  lockedAt: number | null;
  lockedFrame: number | null;
  framesToLock: number | null;
  runStartFrame: number;
};

export type AcceptState = Map<string, ArtTrack>;

export function createAcceptState(): AcceptState {
  return new Map();
}

export function continuesRun(
  track: Pick<ArtTrack, "lastFrame">,
  frame: number,
  options: Pick<AcceptOptions, "maxGapFrames">,
): boolean {
  return frame - track.lastFrame <= options.maxGapFrames;
}

export function rearmLockedTracks(
  state: AcceptState,
  except?: ArtTrack,
): void {
  for (const track of state.values()) {
    if (track.lockedAt !== null && track !== except) {
      track.runLength = 0;
      track.runWeight = 0;
      track.lockedThisRun = false;
      track.lastFrame = Number.NEGATIVE_INFINITY;
    }
  }
}

/**
 * Observe a frame winner. Returns the track when it newly locks this frame.
 */
export function observeWinner(
  state: AcceptState,
  frame: number,
  seconds: number,
  winner: FrameWinner,
  options: AcceptOptions = DEFAULT_ACCEPT_OPTIONS,
  {
    weight = 1,
    stateKey = winner.artKey,
    canLock = true,
  }: { weight?: number; stateKey?: string; canLock?: boolean } = {},
): ArtTrack | null {
  let track = state.get(stateKey);
  if (!track) {
    track = {
      artKey: winner.artKey,
      key: winner.key,
      firstSeen: seconds,
      sightings: 0,
      runLength: 0,
      runWeight: 0,
      lockedThisRun: false,
      lastFrame: Number.NEGATIVE_INFINITY,
      lockedAt: null,
      lockedFrame: null,
      framesToLock: null,
      runStartFrame: frame,
    };
    state.set(stateKey, track);
  }
  track.sightings += 1;
  if (continuesRun(track, frame, options)) {
    track.runLength += 1;
    track.runWeight += weight;
  } else {
    track.runLength = 1;
    track.runWeight = weight;
    track.runStartFrame = frame;
    if (!options.relockOnlyAfterRearm) {
      track.lockedThisRun = false;
    }
  }
  track.lastFrame = frame;
  track.key = winner.key;
  track.artKey = winner.artKey;

  if (canLock && !track.lockedThisRun && track.runWeight >= options.lockRun) {
    track.lockedThisRun = true;
    track.lockedAt = seconds;
    track.lockedFrame = frame;
    track.framesToLock = frame - track.runStartFrame;
    if (options.relockOnlyAfterRearm) {
      rearmLockedTracks(state, track);
    }
    return track;
  }
  return null;
}
