/**
 * Install pack sleeve backs only when bytes differ from the pack default.
 *
 * Adapters supply `{ slug, bytes }` (or URL→bytes). Hashes matching
 * `back.webp` (or an explicit default buffer) are skipped — no file, no stamp.
 * Several keys that share one distinct hash collapse to a single file + aliases.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export type DistinctBackCandidate = {
  /** Filename slug: `leader`, `ur`, `don` → `back.<slug>.ext`. */
  slug: string;
  bytes: Buffer;
  /** Optional extra keys that should resolve to this slug (rarity aliases). */
  aliasKeys?: readonly string[];
};

export type DistinctBackDecision =
  | { kind: "default"; slug: string; hash: string }
  | { kind: "duplicate"; slug: string; hash: string; canonicalSlug: string }
  | { kind: "install"; slug: string; hash: string; path: string }
  | { kind: "skip_existing"; slug: string; hash: string; path: string };

export type DiscoverDistinctBacksResult = {
  defaultHash: string | null;
  decisions: DistinctBackDecision[];
  /** slug → canonical slug for stamp lookup (includes identity). */
  aliases: Record<string, string>;
  installed: string[];
  skippedDefault: string[];
};

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function readPackDefaultBackHash(cardsDir: string): string | null {
  for (const name of ["back.webp", "back.png", "back.jpg", "back.jpeg"]) {
    const p = path.join(cardsDir, name);
    if (!existsSync(p)) continue;
    return sha256Hex(readFileSync(p));
  }
  return null;
}

/**
 * Group candidates by content hash; pick one canonical slug per distinct hash
 * (shortest slug, then lexicographic).
 */
export function collapseDistinctBackCandidates(
  candidates: readonly DistinctBackCandidate[],
  defaultHash: string | null,
): {
  byHash: Map<string, { canonicalSlug: string; bytes: Buffer; keys: string[] }>;
  defaultSlugs: string[];
} {
  const byHash = new Map<
    string,
    { canonicalSlug: string; bytes: Buffer; keys: string[] }
  >();
  const defaultSlugs: string[] = [];

  for (const cand of candidates) {
    const slug = cand.slug.trim().toLowerCase();
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    const hash = sha256Hex(cand.bytes);
    const keys = [slug, ...(cand.aliasKeys ?? []).map((k) => k.toLowerCase())];
    if (defaultHash && hash === defaultHash) {
      defaultSlugs.push(...keys);
      continue;
    }
    const existing = byHash.get(hash);
    if (!existing) {
      byHash.set(hash, { canonicalSlug: slug, bytes: cand.bytes, keys: [...keys] });
      continue;
    }
    for (const k of keys) {
      if (!existing.keys.includes(k)) existing.keys.push(k);
    }
    if (
      slug.length < existing.canonicalSlug.length ||
      (slug.length === existing.canonicalSlug.length &&
        slug < existing.canonicalSlug)
    ) {
      existing.canonicalSlug = slug;
    }
  }

  return { byHash, defaultSlugs };
}

export type InstallDistinctBacksOptions = {
  cardsDir: string;
  /** Default pack back bytes; when omitted, read from cardsDir. */
  defaultBytes?: Buffer | null;
  /** File extension for new installs (Kayou curated uses png). */
  ext?: "webp" | "png";
  force?: boolean;
  /** When true, delete existing `back.<slug>.*` that match the default hash. */
  pruneDefaultDuplicates?: boolean;
};

/**
 * Write one `back.<canonical>.<ext>` per distinct hash; build alias map;
 * optionally prune on-disk slugs that equal the pack default.
 */
export function installDistinctBacks(
  candidates: readonly DistinctBackCandidate[],
  opts: InstallDistinctBacksOptions,
): DiscoverDistinctBacksResult {
  const cardsDir = opts.cardsDir;
  mkdirSync(cardsDir, { recursive: true });
  const defaultBytes =
    opts.defaultBytes !== undefined
      ? opts.defaultBytes
      : (() => {
          for (const name of ["back.webp", "back.png", "back.jpg", "back.jpeg"]) {
            const p = path.join(cardsDir, name);
            if (existsSync(p)) return readFileSync(p);
          }
          return null;
        })();
  const defaultHash = defaultBytes ? sha256Hex(defaultBytes) : null;
  const { byHash, defaultSlugs } = collapseDistinctBackCandidates(
    candidates,
    defaultHash,
  );
  const ext = opts.ext ?? "webp";
  const decisions: DistinctBackDecision[] = [];
  const aliases: Record<string, string> = {};
  const installed: string[] = [];
  const skippedDefault = [...new Set(defaultSlugs)];

  for (const slug of skippedDefault) {
    decisions.push({
      kind: "default",
      slug,
      hash: defaultHash ?? "",
    });
    if (opts.pruneDefaultDuplicates) {
      pruneBackSlug(cardsDir, slug);
    }
  }

  for (const [hash, group] of byHash) {
    const dest = path.join(cardsDir, `back.${group.canonicalSlug}.${ext}`);
    for (const key of group.keys) {
      aliases[key] = group.canonicalSlug;
      if (key !== group.canonicalSlug) {
        decisions.push({
          kind: "duplicate",
          slug: key,
          hash,
          canonicalSlug: group.canonicalSlug,
        });
        if (opts.pruneDefaultDuplicates) {
          pruneBackSlug(cardsDir, key);
        }
      }
    }
    if (!opts.force && existsSync(dest)) {
      decisions.push({
        kind: "skip_existing",
        slug: group.canonicalSlug,
        hash,
        path: dest,
      });
      continue;
    }
    writeFileSync(dest, group.bytes);
    installed.push(group.canonicalSlug);
    decisions.push({
      kind: "install",
      slug: group.canonicalSlug,
      hash,
      path: dest,
    });
  }

  return { defaultHash, decisions, aliases, installed, skippedDefault };
}

function pruneBackSlug(cardsDir: string, slug: string): void {
  for (const ext of ["webp", "png", "jpg", "jpeg"]) {
    const p = path.join(cardsDir, `back.${slug}.${ext}`);
    if (existsSync(p)) unlinkSync(p);
  }
}

/** Resolve stamp slug through alias map (identity when absent). */
export function resolveBackAlias(
  aliases: Readonly<Record<string, string>>,
  key: string,
): string {
  const k = key.trim().toLowerCase();
  return aliases[k] ?? k;
}
