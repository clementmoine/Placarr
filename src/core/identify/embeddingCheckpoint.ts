/**
 * Shared cadence for mid-build embedding shard flushes (card + product).
 * 1% of todo work, floored at 1000 — override in tests.
 */

const CHECKPOINT_PCT_DENOM = 100;
const CHECKPOINT_MIN = 1000;

export function embeddingCheckpointInterval(
  todoCount: number,
  override?: number,
): number {
  if (override != null && override > 0) return Math.floor(override);
  if (todoCount <= 0) return CHECKPOINT_MIN;
  return Math.max(
    CHECKPOINT_MIN,
    Math.ceil(todoCount / CHECKPOINT_PCT_DENOM),
  );
}
