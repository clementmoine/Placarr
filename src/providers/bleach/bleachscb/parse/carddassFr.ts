/**
 * Parse Bleach FR carddass.fr HTML + CDX image scout into a ledger.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { bleachScbCuratedDir } from "../pack";
import { parseBleachScbPrinted } from "../printKey";

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

const SCOUT_BLEACH = path.join(
  process.cwd(),
  "data/staging/carddass-wayback-scout/carddass_fr_bleach_.json",
);
const LISTE_HTML = path.join(
  process.cwd(),
  "data/staging/carddass-wayback-scout/pages/bleach-liste.html",
);

const TYPE_FROM_DIR: Record<string, string> = {
  "ames+logo": "ame",
  "combat+logo": "combat",
  "evenements+logo": "evenement",
  "zanpakutos+logo": "zanpakuto",
  "promos+%20carddass": "promo",
  "promos + carddass": "promo",
};

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

/** Build FR ledger from CDX image paths + optional liste HTML. */
export function buildBleachFrLedger(): {
  cards: BleachScbCard[];
  outPath: string;
} {
  const outPath = path.join(
    bleachScbCuratedDir(),
    "sources",
    "carddass-fr-bleach.json",
  );
  mkdirSync(path.dirname(outPath), { recursive: true });

  const byPrinted = new Map<string, BleachScbCard>();

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
      const promo = pathname.match(
        /\/bleach\/images\/cartes[^/]*\/promos[^/]*\/Promo-(\d+)(?:-\d+)?\.(jpe?g|png|gif)$/i,
      );
      if (!promo) continue;
      const num = promo[1]!.padStart(3, "0");
      const parsed = parseBleachScbPrinted(`P${num}`);
      if (!parsed) continue;
      const faceUrlFr = waybackIdUrl(row.timestamp, row.original);
      const prev = byPrinted.get(parsed.printed);
      if (!prev) {
        byPrinted.set(parsed.printed, {
          printed: parsed.printed,
          set: parsed.set,
          number: parsed.number,
          type: "promo",
          faceUrlFr,
          note: "carddass.fr Wayback promo",
        });
      } else if (!prev.faceUrlFr) {
        prev.faceUrlFr = faceUrlFr;
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
    "utf8",
  );
  return { cards, outPath };
}
