/**
 * Install Kayou “official” per-card backs by content hash:
 * - = pack `back.png` → no file (stamp falls through)
 * - = curated `back.<tier>.png` → stamp that rarity sleeve
 * - anything else → `cards/{set}/{lang}/{number}/back.webp` next to each card
 *   (duplicate OK if several cards share bytes — not a catalogue pack tile)
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { writeLosslessWebpFile } from "@/lib/media/losslessWebp";
import { sha256Hex } from "@/providers/shared/cardCatalogue/discoverDistinctBacks";

import { KAYOU_TITLE_LANG } from "./buildFromLedgers";
import {
  buildKayouOfficialCardBackManifest,
  kayouOfficialCardBackManifestPath,
  readKayouOfficialCardBackManifest,
  resetKayouOfficialCardBackManifestCache,
  type KayouOfficialCardBackEntry,
  type KayouOfficialCardBackPlacement,
} from "./kayouOfficialCardBacks";
import { kayouOfficialIdToPrint } from "./kayouOfficialId";
import { narutoKayouCuratedDir } from "./pack";

export type KayouOfficialBackSource = {
  /** Filename stem / manifest key (`nrea02-ur-015l3`). */
  slug: string;
  bytes: Buffer;
  idCode?: string;
};

export type KayouOfficialBackPlan = {
  slug: string;
  hash: string;
  placement: KayouOfficialCardBackPlacement;
  /** Relative path under dest cards dir when a file must be written. */
  writeRel?: string;
};

type PlanInternal = KayouOfficialBackPlan & { bytes?: Buffer };

const PACK_TIER_BACK = /^back\.([a-z0-9][a-z0-9-]*)\.(webp|png|jpe?g)$/i;

function idCodeForSource(src: KayouOfficialBackSource): string {
  if (src.idCode?.trim()) return src.idCode.trim();
  const parts = src.slug.split("-").filter(Boolean);
  if (parts.length < 3) return src.slug.toUpperCase();
  return [
    parts[0]!.toUpperCase(),
    parts[1]!.toUpperCase(),
    parts.slice(2).join("-").toUpperCase(),
  ].join("-");
}

export function readPackTierBackHashes(
  cardsDir: string,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(cardsDir)) return out;
  for (const name of readdirSync(cardsDir)) {
    const m = PACK_TIER_BACK.exec(name);
    if (!m) continue;
    out.set(
      sha256Hex(readFileSync(path.join(cardsDir, name))),
      m[1]!.toLowerCase(),
    );
  }
  return out;
}

export function readPackDefaultBackHash(cardsDir: string): string | null {
  for (const name of ["back.webp", "back.png", "back.jpg", "back.jpeg"]) {
    const p = path.join(cardsDir, name);
    if (!existsSync(p)) continue;
    return sha256Hex(readFileSync(p));
  }
  return null;
}

function planInternal(
  sources: readonly KayouOfficialBackSource[],
  opts: {
    defaultHash: string | null;
    tierByHash: ReadonlyMap<string, string>;
    lang?: string;
  },
): PlanInternal[] {
  const lang = (opts.lang ?? KAYOU_TITLE_LANG).toLowerCase();
  const byHash = new Map<string, KayouOfficialBackSource[]>();
  for (const src of sources) {
    const slug = src.slug.trim().toLowerCase();
    if (!slug) continue;
    const hash = sha256Hex(src.bytes);
    const list = byHash.get(hash) ?? [];
    list.push({ ...src, slug });
    byHash.set(hash, list);
  }

  const plans: PlanInternal[] = [];
  for (const [hash, group] of byHash) {
    if (opts.defaultHash && hash === opts.defaultHash) {
      for (const g of group) {
        plans.push({ slug: g.slug, hash, placement: { kind: "default" } });
      }
      continue;
    }
    const tierSlug = opts.tierByHash.get(hash);
    if (tierSlug) {
      for (const g of group) {
        plans.push({
          slug: g.slug,
          hash,
          placement: { kind: "tier", slug: tierSlug },
        });
      }
      continue;
    }

    // Card-specific (even if the same bytes appear on several cards):
    // one back.webp beside each print — never a pack catalogue tile.
    for (const g of group) {
      const print = kayouOfficialIdToPrint(idCodeForSource(g));
      if (!print) {
        plans.push({ slug: g.slug, hash, placement: { kind: "default" } });
        continue;
      }
      plans.push({
        slug: g.slug,
        hash,
        placement: {
          kind: "print",
          set: print.setCode,
          lang,
          card: print.number,
        },
        writeRel: path.join(print.setCode, lang, print.number, "back.webp"),
        bytes: g.bytes,
      });
    }
  }
  return plans;
}

/** Pure planner for unit tests (no source bytes attached). */
export function planKayouOfficialCardBackInstalls(
  sources: readonly KayouOfficialBackSource[],
  opts: {
    defaultHash: string | null;
    tierByHash: ReadonlyMap<string, string>;
    lang?: string;
  },
): KayouOfficialBackPlan[] {
  return planInternal(sources, opts).map(({ bytes: _b, ...plan }) => plan);
}

export type InstallKayouOfficialCardBacksResult = {
  installed: number;
  skipped: number;
  print: number;
  tier: number;
  defaulted: number;
};

/**
 * Classify curated `official/*.png` → rarity sleeve or print-local `back.webp`.
 * Updates placement fields on `kayou-official-card-backs.json`.
 */
export async function installKayouOfficialCardBacks(opts: {
  curatedCardsDir?: string;
  destCardsDir: string;
  dryRun?: boolean;
  force?: boolean;
  onProgress?: (message: string) => void;
}): Promise<InstallKayouOfficialCardBacksResult> {
  const officialSrc = path.join(
    opts.curatedCardsDir ?? path.join(narutoKayouCuratedDir(), "cards"),
    "official",
  );
  const empty: InstallKayouOfficialCardBacksResult = {
    installed: 0,
    skipped: 0,
    print: 0,
    tier: 0,
    defaulted: 0,
  };
  if (!existsSync(officialSrc)) return empty;

  const names = readdirSync(officialSrc).filter((n) => /\.png$/i.test(n));
  opts.onProgress?.(
    `official classify — ${names.length} PNG (tier vs print-local)…`,
  );

  const prior = readKayouOfficialCardBackManifest();
  const sources: KayouOfficialBackSource[] = names.map((name) => {
    const slug = name.replace(/\.png$/i, "").toLowerCase();
    const idCode = prior?.cards[slug]?.idCode;
    return {
      slug,
      bytes: readFileSync(path.join(officialSrc, name)),
      ...(idCode ? { idCode } : {}),
    };
  });

  /*
    Classify against curated PNG sleeves (`back.png` / `back.ur.png`), not data
    WebP — same CDN bytes as `official/*.png`. WebP re-encode would never match.
  */
  const classifyDir =
    opts.curatedCardsDir ?? path.join(narutoKayouCuratedDir(), "cards");
  const plans = planInternal(sources, {
    defaultHash: readPackDefaultBackHash(classifyDir),
    tierByHash: readPackTierBackHashes(classifyDir),
  });

  let installed = 0;
  let skipped = 0;
  let print = 0;
  let tier = 0;
  let defaulted = 0;

  const placementBySlug = new Map<string, KayouOfficialCardBackPlacement>();
  const writeJobs: { rel: string; bytes: Buffer }[] = [];

  for (const plan of plans) {
    placementBySlug.set(plan.slug, plan.placement);
    if (plan.placement.kind === "default") defaulted += 1;
    else if (plan.placement.kind === "tier") tier += 1;
    else if (plan.placement.kind === "print") print += 1;

    if (plan.writeRel && plan.bytes) {
      writeJobs.push({ rel: plan.writeRel, bytes: plan.bytes });
    }
  }

  for (let i = 0; i < writeJobs.length; i += 1) {
    const job = writeJobs[i]!;
    const dest = path.join(opts.destCardsDir, job.rel);
    if (!opts.force && existsSync(dest)) {
      skipped += 1;
      continue;
    }
    if (!opts.dryRun) {
      mkdirSync(path.dirname(dest), { recursive: true });
      await writeLosslessWebpFile(job.bytes, dest);
    }
    installed += 1;
    if ((i + 1) % 25 === 0 || i + 1 === writeJobs.length) {
      opts.onProgress?.(
        `official install — ${i + 1}/${writeJobs.length} écritures (${installed} new, ${skipped} skip)`,
      );
    }
  }

  if (!opts.dryRun) {
    const legacyDir = path.join(opts.destCardsDir, "official");
    if (existsSync(legacyDir)) {
      rmSync(legacyDir, { recursive: true, force: true });
    }

    // Never keep card-id pack sleeves (`back.nrsa02-ur-001l3.webp`).
    const raritySlugs = new Set(readPackTierBackHashes(classifyDir).values());
    if (existsSync(opts.destCardsDir)) {
      for (const name of readdirSync(opts.destCardsDir)) {
        const m = /^back\.([a-z0-9][a-z0-9-]*)\.webp$/i.exec(name);
        if (!m) continue;
        const slug = m[1]!.toLowerCase();
        if (raritySlugs.has(slug)) continue;
        if (/\d/.test(slug)) {
          rmSync(path.join(opts.destCardsDir, name), { force: true });
        }
      }
    }

    // Drop print-local backs that are now tier/default.
    for (const plan of plans) {
      if (plan.placement.kind === "print") continue;
      const src = sources.find((s) => s.slug === plan.slug);
      const mapped = kayouOfficialIdToPrint(
        src ? idCodeForSource(src) : plan.slug,
      );
      if (!mapped) continue;
      const stale = path.join(
        opts.destCardsDir,
        mapped.setCode,
        KAYOU_TITLE_LANG,
        mapped.number,
        "back.webp",
      );
      if (existsSync(stale)) rmSync(stale, { force: true });
    }

    const bySlug = new Map<string, KayouOfficialCardBackEntry>(
      Object.entries(prior?.cards ?? {}),
    );
    for (const src of sources) {
      const prev = bySlug.get(src.slug);
      const placement = placementBySlug.get(src.slug);
      bySlug.set(src.slug, {
        idCode: prev?.idCode ?? idCodeForSource(src),
        url: prev?.url ?? "",
        seriesId: prev?.seriesId ?? "",
        rarity: prev?.rarity ?? "",
        ...(placement ? { placement } : {}),
      });
    }
    for (const [slug, entry] of bySlug) {
      const placement = placementBySlug.get(slug);
      if (placement) bySlug.set(slug, { ...entry, placement });
    }

    const observed = new Date().toISOString().slice(0, 10);
    const manifest = buildKayouOfficialCardBackManifest([...bySlug.values()], {
      observed,
      seriesIds: [
        ...new Set(
          [...bySlug.values()].map((e) => e.seriesId).filter(Boolean),
        ),
      ],
    });
    if (prior?.source) manifest.source = prior.source;
    writeFileSync(
      kayouOfficialCardBackManifestPath(),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    resetKayouOfficialCardBackManifestCache();
  }

  opts.onProgress?.(
    `official — print ${print}, =tier ${tier}, =défaut ${defaulted} · ${installed} WebP new / ${skipped} skip`,
  );

  return { installed, skipped, print, tier, defaulted };
}
