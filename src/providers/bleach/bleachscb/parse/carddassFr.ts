/**
 * Parse Bleach FR carddass.fr HTML + CDX image scout into a ledger.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardDir } from "@/lib/packPaths";

import { BLEACH_SCB_PACK_ID, bleachScbCuratedDir } from "../pack";
import { parseBleachScbPrinted } from "../printKey";

function filesIdentical(a: string, b: string): boolean {
  if (!existsSync(a) || !existsSync(b)) return false;
  return readFileSync(a).equals(readFileSync(b));
}

export type BleachScbCard = {
  printed: string;
  set: string;
  number: string;
  nameFr?: string;
  nameJa?: string;
  type?: string;
  faceUrlFr?: string;
  faceUrlJa?: string;
  note?: string;
};

/** One Promo-*.gif (or jpeg) under carddass.fr `promos + carddass/`. */
export type BleachCarddassFrPromoAsset = {
  file: string;
  /** Padded collector numbers this file covers (`001`, or `015`+`016`). */
  numbers: string[];
  exclusive: boolean;
  waybackUrl: string;
  timestamp: string;
  printed: string[];
  /** Local durable copy under curated/sources/wayback/promos/ when present. */
  localRel?: string;
};

/** Durable Wayback scout — under provider curated (not `data/staging/`). */
const SCOUT_BLEACH = path.join(
  bleachScbCuratedDir(),
  "sources",
  "wayback",
  "carddass_fr_bleach_.json",
);
const LISTE_HTML = path.join(
  bleachScbCuratedDir(),
  "sources",
  "wayback",
  "bleach-liste.html",
);
const PROMOS_DIR = path.join(
  bleachScbCuratedDir(),
  "sources",
  "wayback",
  "promos",
);
const PROMOS_LEDGER = path.join(
  bleachScbCuratedDir(),
  "sources",
  "carddass-fr-bleach-promos.json",
);

const TYPE_FROM_DIR: Record<string, string> = {
  "ames+logo": "ame",
  "combat+logo": "combat",
  "evenements+logo": "evenement",
  "zanpakutos+logo": "zanpakuto",
  "promos+%20carddass": "promo",
  "promos + carddass": "promo",
};

/** Exclusive face beats a dual Promo-N-M collage. */
const FACE_SCORE_EXCLUSIVE = 2;
const FACE_SCORE_COMPOSITE = 1;

function waybackIdUrl(timestamp: string, original: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${original}`;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a carddass.fr promo filename stem (`Promo-1`, `Promo-15-16`).
 * Dual files illustrate both numbers but are weaker than exclusive GIFs.
 */
export function parseBleachCarddassFrPromoFile(file: string): {
  file: string;
  numbers: string[];
  exclusive: boolean;
} | null {
  const base = file.replace(/\.(jpe?g|png|gif)$/i, "");
  const dual = base.match(/^Promo-(\d+)-(\d+)$/i);
  if (dual) {
    return {
      file: `${base}${file.slice(base.length)}`,
      numbers: [dual[1]!.padStart(3, "0"), dual[2]!.padStart(3, "0")],
      exclusive: false,
    };
  }
  const single = base.match(/^Promo-(\d+)$/i);
  if (!single) return null;
  const ext = file.slice(base.length) || ".gif";
  return {
    file: `Promo-${single[1]}${ext}`,
    numbers: [single[1]!.padStart(3, "0")],
    exclusive: true,
  };
}

type FaceMeta = { score: number };

function assignPromoFace(
  byPrinted: Map<string, BleachScbCard>,
  faceScore: Map<string, FaceMeta>,
  number: string,
  faceUrlFr: string,
  exclusive: boolean,
): void {
  const parsed = parseBleachScbPrinted(`P${number}`);
  if (!parsed) return;
  const score = exclusive ? FACE_SCORE_EXCLUSIVE : FACE_SCORE_COMPOSITE;
  const prev = byPrinted.get(parsed.printed);
  const prevScore = faceScore.get(parsed.printed)?.score ?? 0;
  if (!prev) {
    byPrinted.set(parsed.printed, {
      printed: parsed.printed,
      set: parsed.set,
      number: parsed.number,
      type: "promo",
      faceUrlFr,
      note: exclusive
        ? "carddass.fr Wayback promo"
        : "carddass.fr Wayback promo (composite fallback)",
    });
    faceScore.set(parsed.printed, { score });
    return;
  }
  if (!prev.faceUrlFr || score > prevScore) {
    prev.faceUrlFr = faceUrlFr;
    prev.type = "promo";
    if (!exclusive && prevScore === 0) {
      prev.note = "carddass.fr Wayback promo (composite fallback)";
    } else if (exclusive) {
      prev.note = "carddass.fr Wayback promo";
    }
    faceScore.set(parsed.printed, { score });
  }
}

/** Collect unique Promo-* assets from the durable CDX scout. */
export function listBleachCarddassFrPromoAssets(): BleachCarddassFrPromoAsset[] {
  if (!existsSync(SCOUT_BLEACH)) return [];
  const rows = JSON.parse(readFileSync(SCOUT_BLEACH, "utf8")) as Array<{
    timestamp: string;
    original: string;
  }>;
  const byFile = new Map<string, BleachCarddassFrPromoAsset>();
  for (const row of rows) {
    let pathname = "";
    try {
      pathname = decodeURIComponent(new URL(row.original).pathname);
    } catch {
      continue;
    }
    const m = pathname.match(
      /\/bleach\/images\/cartes[^/]*\/promos[^/]*\/(Promo-[^/]+\.(?:jpe?g|png|gif))$/i,
    );
    if (!m) continue;
    const parsed = parseBleachCarddassFrPromoFile(m[1]!);
    if (!parsed) continue;
    const key = parsed.file.toLowerCase();
    const prev = byFile.get(key);
    if (prev && prev.timestamp >= row.timestamp) continue;
    byFile.set(key, {
      file: parsed.file,
      numbers: parsed.numbers,
      exclusive: parsed.exclusive,
      waybackUrl: waybackIdUrl(row.timestamp, row.original),
      timestamp: row.timestamp,
      printed: parsed.numbers.map((n) => `P${n}`),
    });
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Copy Promo-* bytes we already hold (installed P faces) into curated
 * `sources/wayback/promos/`, and write a durable promo ledger.
 */
export function materializeBleachCarddassFrPromos(): {
  assets: BleachCarddassFrPromoAsset[];
  copied: number;
  missing: string[];
  outPath: string;
} {
  mkdirSync(PROMOS_DIR, { recursive: true });
  const assets = listBleachCarddassFrPromoAssets();
  let copied = 0;
  const missing: string[] = [];

  for (const asset of assets) {
    const dest = path.join(PROMOS_DIR, asset.file);
    if (existsSync(dest)) {
      asset.localRel = `sources/wayback/promos/${asset.file}`;
      continue;
    }
    // Exclusive Promo-N ← installed P face (same Wayback bytes historically).
    // Skip when a dual Promo-N-M also exists for that number *and* we have no
    // curated exclusive yet: P015 used to hold the Promo-15-16 collage and
    // must not be mislabeled as Promo-15.gif. Once Promo-15.gif is on disk
    // under curated (existsSync above), we never enter this branch.
    // Composite ← first installed P face among covered numbers.
    let src: string | null = null;
    if (asset.exclusive) {
      const num = asset.numbers[0]!;
      const collageLikelyOnThisPrint = assets.some(
        (a) => !a.exclusive && a.numbers[0] === num,
      );
      if (collageLikelyOnThisPrint) {
        missing.push(asset.file);
        continue;
      }
      const cardDir = packCardDir(BLEACH_SCB_PACK_ID, {
        set: "p",
        lang: "fr",
        card: num,
      });
      const candidate = path.join(cardDir, "art.carddass.jpg");
      if (existsSync(candidate)) src = candidate;
    } else {
      for (const num of asset.numbers) {
        const cardDir = packCardDir(BLEACH_SCB_PACK_ID, {
          set: "p",
          lang: "fr",
          card: num,
        });
        const candidate = path.join(cardDir, "art.carddass.jpg");
        if (!existsSync(candidate)) continue;
        src = candidate;
        break;
      }
    }
    if (!src) {
      missing.push(asset.file);
      continue;
    }
    copyFileSync(src, dest);
    asset.localRel = `sources/wayback/promos/${asset.file}`;
    copied += 1;
  }

  writeFileSync(
    PROMOS_LEDGER,
    `${JSON.stringify(
      {
        source: "carddass.fr/bleach Wayback — promos + carddass/",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        note: "Exclusive Promo-N.gif preferred as P### faces. Dual Promo-N-M.gif kept as durable extras (not preferred faces).",
        assets,
      },
      null,
      2,
    )}\n`,
  );

  return { assets, copied, missing, outPath: PROMOS_LEDGER };
}

/**
 * Prefer curated exclusive Promo-N.gif as the pack face (`art.carddass.jpg`).
 * Overwrites collage fallbacks (ex. P015 held Promo-15-16 until Wayback
 * returned Promo-15.gif). Dual Promo-N-M files stay curated extras only.
 */
export function applyBleachExclusivePromoFacesFromCurated(): {
  applied: string[];
  unchanged: string[];
  missing: string[];
} {
  const applied: string[] = [];
  const unchanged: string[] = [];
  const missing: string[] = [];
  for (const asset of listBleachCarddassFrPromoAssets()) {
    if (!asset.exclusive) continue;
    const src = path.join(PROMOS_DIR, asset.file);
    if (!existsSync(src)) {
      missing.push(asset.file);
      continue;
    }
    const num = asset.numbers[0];
    if (!num) {
      missing.push(asset.file);
      continue;
    }
    const destDir = packCardDir(BLEACH_SCB_PACK_ID, {
      set: "p",
      lang: "fr",
      card: num,
    });
    mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, "art.carddass.jpg");
    if (filesIdentical(src, dest)) {
      unchanged.push(asset.file);
      continue;
    }
    copyFileSync(src, dest);
    applied.push(asset.file);
  }
  return { applied, unchanged, missing };
}

/** Build FR ledger from CDX image paths + optional liste HTML. */
export function buildBleachFrLedger(): {
  cards: BleachScbCard[];
  outPath: string;
  promos: ReturnType<typeof materializeBleachCarddassFrPromos>;
} {
  const outPath = path.join(
    bleachScbCuratedDir(),
    "sources",
    "carddass-fr-bleach.json",
  );
  mkdirSync(path.dirname(outPath), { recursive: true });

  const byPrinted = new Map<string, BleachScbCard>();
  const faceScore = new Map<string, FaceMeta>();

  if (existsSync(SCOUT_BLEACH)) {
    const rows = JSON.parse(readFileSync(SCOUT_BLEACH, "utf8")) as Array<{
      timestamp: string;
      original: string;
    }>;
    for (const row of rows) {
      let pathname = "";
      try {
        pathname = decodeURIComponent(new URL(row.original).pathname);
      } catch {
        continue;
      }
      // …/cartes Bleach/JPEG Bleach S1/Ames+logo/A001l.jpg
      const m = pathname.match(
        /\/bleach\/images\/cartes[^/]*\/(?:[^/]+\/)?([^/]+)\/([A-Z]\d{3})l?\.(jpe?g|png|gif)$/i,
      );
      if (m) {
        const dir = m[1]!.toLowerCase();
        const code = m[2]!.toUpperCase();
        const parsed = parseBleachScbPrinted(code);
        if (!parsed) continue;
        const type = TYPE_FROM_DIR[dir] ?? dir;
        const prev = byPrinted.get(parsed.printed);
        const faceUrlFr = waybackIdUrl(row.timestamp, row.original);
        if (!prev) {
          byPrinted.set(parsed.printed, {
            printed: parsed.printed,
            set: parsed.set,
            number: parsed.number,
            type,
            faceUrlFr,
            note: "carddass.fr Wayback",
          });
        } else if (!prev.faceUrlFr) {
          prev.faceUrlFr = faceUrlFr;
        }
        continue;
      }
      // …/cartes Bleach/promos + carddass/Promo-1.gif
      const promoPath = pathname.match(
        /\/bleach\/images\/cartes[^/]*\/promos[^/]*\/(Promo-[^/]+\.(?:jpe?g|png|gif))$/i,
      );
      if (!promoPath) continue;
      const promo = parseBleachCarddassFrPromoFile(promoPath[1]!);
      if (!promo) continue;
      const faceUrlFr = waybackIdUrl(row.timestamp, row.original);
      for (const num of promo.numbers) {
        assignPromoFace(
          byPrinted,
          faceScore,
          num,
          faceUrlFr,
          promo.exclusive,
        );
      }
    }
  }

  if (existsSync(LISTE_HTML)) {
    const html = readFileSync(LISTE_HTML, "latin1");
    // A-001 | name cell — titre may wrap the name in <div><a>…</a></div>.
    for (const m of html.matchAll(
      />([ACEZP])-(\d{3})<\/a><\/td>\s*<td[^>]*class="titre"[^>]*>([\s\S]*?)<\/td>/gi,
    )) {
      const code = `${m[1]!.toUpperCase()}${m[2]!}`;
      const nameFr = stripHtml(m[3]!);
      const parsed = parseBleachScbPrinted(code);
      if (!parsed) continue;
      const prev = byPrinted.get(parsed.printed);
      if (!prev) {
        byPrinted.set(parsed.printed, {
          printed: parsed.printed,
          set: parsed.set,
          number: parsed.number,
          nameFr: nameFr || undefined,
          note: "carddass.fr liste-cartes",
        });
      } else if (nameFr && !prev.nameFr) {
        prev.nameFr = nameFr;
      }
    }
    // Promo rows: <td class="titre">P-001</td><td class="titre">…name…</td>
    for (const m of html.matchAll(
      /<td class="titre">([ACEZP])-(\d{3})<\/td>\s*<td class="titre">([\s\S]*?)<\/td>/gi,
    )) {
      const code = `${m[1]!.toUpperCase()}${m[2]!}`;
      const nameFr = stripHtml(m[3]!);
      const parsed = parseBleachScbPrinted(code);
      if (!parsed) continue;
      const prev = byPrinted.get(parsed.printed);
      if (!prev) {
        byPrinted.set(parsed.printed, {
          printed: parsed.printed,
          set: parsed.set,
          number: parsed.number,
          type: parsed.set === "p" ? "promo" : undefined,
          nameFr: nameFr || undefined,
          note: "carddass.fr liste-cartes promo",
        });
      } else if (nameFr && !prev.nameFr) {
        prev.nameFr = nameFr;
      }
    }
    for (const m of html.matchAll(/\b([ACEZP])-?(\d{3})\b/gi)) {
      const code = `${m[1]!.toUpperCase()}${m[2]!}`;
      const parsed = parseBleachScbPrinted(code);
      if (!parsed) continue;
      if (!byPrinted.has(parsed.printed)) {
        byPrinted.set(parsed.printed, {
          printed: parsed.printed,
          set: parsed.set,
          number: parsed.number,
          note: "carddass.fr liste-cartes",
        });
      }
    }
  }

  const cards = [...byPrinted.values()].sort((a, b) =>
    a.printed.localeCompare(b.printed),
  );
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        source: "carddass.fr/bleach Wayback",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        url: "http://www.carddass.fr/bleach/",
        cards,
      },
      null,
      2,
    )}\n`,
  );

  const promos = materializeBleachCarddassFrPromos();
  return { cards, outPath, promos };
}
