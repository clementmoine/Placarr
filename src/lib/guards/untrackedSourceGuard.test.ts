import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * Source that git is not watching is source that can vanish without trace.
 *
 * This is the mirror of `privateRuntimeDataGuard`: that one keeps runtime data
 * *out* of the repo, this one keeps source *in* it. Anything untracked should be
 * reconstructible — a cache, a scrape result, a dump, a build artifact. Code is
 * none of those.
 *
 * Written after losing an entire effect pack. `src/effects/pokemon/` was never
 * committed; a branch reset moved `HEAD` past the only commit that held it and
 * twelve modules went with it — `foilNames`, `materials`, `resolveEffect`,
 * `liveJoin`, … The dev server, the worker and the icollect queue all died on
 * `Cannot find module`, and nothing anywhere had said the files were at risk.
 * Recovery was possible only because an orphaned commit still had them in the
 * object store. Next time it may not.
 *
 * `--exclude-standard` means gitignored paths are already out of scope, so a
 * hit here is a file nobody chose to ignore *and* nobody chose to keep.
 */

/** Extensions that mean "hand-written", as opposed to generated or fetched. */
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|css|prisma)$/;

/**
 * Scratch areas whose contents are genuinely disposable.
 *
 * `.tmp-*` holds sniffing / audit spool — tokens included — and must never be
 * committed; see `docs/handoff-live-owned-craft.md`.
 */
const DISPOSABLE = [/^\.tmp-/, /^scratch\//, /^node_modules\//];

/**
 * Areas with untracked source **today**, and the list may only ever shrink.
 *
 * Same contract as `blindnessGuard`'s allowlist: it exists so the rule can be
 * enforced now rather than after a cleanup that keeps being postponed, and each
 * entry is a standing invitation to commit that work. Adding an entry is how
 * this guard stops being worth anything — do not.
 */
const KNOWN_UNTRACKED_AREAS = [
  "scripts/foil",
  "scripts/lib",
  "scripts/lorcana",
  "scripts/media",
  "scripts/pokemon",
  "src/app",
  "src/components",
  "src/core",
  "src/effects",
  "src/lib",
  "src/providers",
];

function untrackedFiles(): string[] {
  return execSync("git ls-files --others --exclude-standard -z", {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
}

function area(filePath: string): string {
  const parts = filePath.split("/");
  return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0]!;
}

describe("untrackedSourceGuard", () => {
  it("keeps untracked files to things git can afford to lose", () => {
    const stray = untrackedFiles()
      .filter((filePath) => SOURCE_EXTENSIONS.test(filePath))
      .filter((filePath) => !DISPOSABLE.some((skip) => skip.test(filePath)))
      .filter((filePath) => !KNOWN_UNTRACKED_AREAS.includes(area(filePath)));

    expect(stray).toEqual([]);
  });

  it("holds the known-untracked list to areas that still have some", () => {
    /*
      The half that makes the allowlist shrink instead of rot. An area listed
      above but now fully committed is a stale exemption: it would silently
      re-open the door the day someone adds an uncommitted file back to it.
    */
    const areasWithUntracked = new Set(
      untrackedFiles()
        .filter((filePath) => SOURCE_EXTENSIONS.test(filePath))
        .filter((filePath) => !DISPOSABLE.some((skip) => skip.test(filePath)))
        .map(area),
    );

    const stale = KNOWN_UNTRACKED_AREAS.filter(
      (entry) => !areasWithUntracked.has(entry),
    );

    expect(stale, "remove these from KNOWN_UNTRACKED_AREAS").toEqual([]);
  });
});
