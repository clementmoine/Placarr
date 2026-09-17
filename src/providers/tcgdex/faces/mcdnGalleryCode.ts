/**
 * pokemon.com encyclopédie SET folder codes from Live / TCGdex stems.
 *
 * Gallery paths use codes like `SV08`, `SWSH6`, `30TH` (not Live `sv8`).
 * Irreducible aliases live in the curated ledger; mechanical padding covers
 * the common letter+digits retail pattern.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export type McdnGalleryAliasLedger = {
  /** Live/TCGdex stem → encyclopédie SET folder (e.g. `30th` → `30TH`). */
  aliases?: Readonly<Record<string, string>>;
};

function curatedAliasPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "tcgdex",
    "curated",
    "sources",
    "mcdn-gallery.json",
  );
}

export function loadMcdnGalleryAliases(
  filePath = curatedAliasPath(),
): Readonly<Record<string, string>> {
  try {
    const raw = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as McdnGalleryAliasLedger;
    return raw.aliases ?? {};
  } catch {
    return {};
  }
}

/**
 * Candidate encyclopédie SET folders for a Live stem, highest confidence first.
 */
export function pokemonMcdnGalleryCodes(
  liveStem: string,
  aliases: Readonly<Record<string, string>> = loadMcdnGalleryAliases(),
): string[] {
  const raw = liveStem.trim().toLowerCase();
  if (!raw) return [];

  const out: string[] = [];
  const push = (code: string | null | undefined) => {
    const c = code?.trim();
    if (!c) return;
    if (!out.includes(c)) out.push(c);
  };

  push(aliases[raw]);

  // `sv3-5` → try SV03.5-style and concatenated forms later via uppercase stem.
  const plain = raw.replace(/-/g, "");
  const match = /^([a-z]+)(\d+)$/i.exec(plain);
  if (match) {
    const letters = match[1]!.toUpperCase();
    const n = Number.parseInt(match[2]!, 10);
    // SV era on pokemon.com uses zero-padded two digits (`SV08`); SWSH/SM/XY usually not.
    if (letters === "SV" || letters === "ME") {
      push(`${letters}${String(n).padStart(2, "0")}`);
    }
    push(`${letters}${n}`);
    push(`${letters}${String(n).padStart(2, "0")}`);
  }

  push(raw.toUpperCase());
  push(plain.toUpperCase());

  return out;
}
