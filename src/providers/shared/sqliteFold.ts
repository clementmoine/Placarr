/**
 * Accent-folded SQLite search — `placarr_fold(col) LIKE %epees%` matches « épées ».
 *
 * Node's `DatabaseSync` can register JS functions per connection; we register
 * once and reuse {@link normalizeForTokens} so SQL matches the JS/Postgres fold.
 */
import type { DatabaseSync } from "node:sqlite";

import { normalizeForTokens } from "@/core/enrich/titles/normalize";

const registered = new WeakSet<object>();

export function ensureSqliteFold(db: DatabaseSync): void {
  if (registered.has(db)) return;
  try {
    db.function("placarr_fold", (value: unknown) =>
      normalizeForTokens(
        typeof value === "string"
          ? value
          : value == null
            ? ""
            : String(value),
      ),
    );
  } catch {
    // Already registered on this connection (re-open / HMR).
  }
  registered.add(db);
}

/** `LIKE` pattern for a user query after accent / case fold. */
export function foldedLikePattern(query: string): string {
  const folded = normalizeForTokens(query.trim());
  return folded ? `%${folded}%` : "%";
}
