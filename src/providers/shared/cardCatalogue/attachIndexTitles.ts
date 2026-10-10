/**
 * Attach identity titles onto a `CardsIndexV1` after an art-only rebuild / export.
 *
 * Catalogue semantics (`catalogueNames` / CatalogueBrowser):
 * - **attested** → `name` only (shown)
 * - **show** fallback → `name` + `nameSource` (shown, tagged e.g. `nom ~ en`)
 * - **hide** borrow → `name` + `nameLocaleFrom` (catalogue blanks the tile name —
 *   Naruto policy when a JA title must not masquerade as IT)
 *
 * Packs supply a `resolve` callback (Malie, print_titles, …). No provider ids here.
 */
import type {
  CardsIndexEntry,
  CardsIndexLangFiles,
  CardsIndexV1,
} from "@/effects/cardsIndex";

export type ResolvedIndexTitle =
  | { kind: "attested"; name: string }
  | {
      kind: "fallback";
      name: string;
      /** `show` → nameSource (Pokémon / Lorcana / local prints). `hide` → nameLocaleFrom. */
      catalogue: "show" | "hide";
      /** Source lang or pipeline id (`en`, `malie`, `narutocards-net:slug`, …). */
      from: string;
    };

const DEFAULT_SIBLING_PREFER = ["fr", "en", "de", "it", "es", "ptbr", "ja"] as const;

/** Write a resolved title onto a lang slot (clears the other provenance field). */
export function applyResolvedTitle(
  files: CardsIndexLangFiles,
  resolved: ResolvedIndexTitle | null | undefined,
): boolean {
  if (!resolved?.name?.trim()) return false;
  const name = resolved.name.trim();
  files.name = name;
  delete files.nameLocaleFrom;
  delete files.nameSource;
  if (resolved.kind === "fallback") {
    if (resolved.catalogue === "hide") {
      files.nameLocaleFrom = resolved.from;
    } else {
      files.nameSource = resolved.from;
    }
  }
  return true;
}

/**
 * For every lang slot missing `name`, copy an attested sibling title as a
 * showable fallback (`nameSource` = source lang). Does not overwrite attested
 * or already-provenanced names.
 */
export function attachSiblingTitlesToCardsIndex(
  index: CardsIndexV1,
  opts?: {
    preferLangs?: readonly string[];
    /** Default `show` (Pokémon / Lorcana / local prints). Pass `hide` for Naruto-style borrow. */
    catalogue?: "show" | "hide";
  },
): { named: number } {
  const prefer = opts?.preferLangs ?? DEFAULT_SIBLING_PREFER;
  const catalogue = opts?.catalogue ?? "show";
  let named = 0;
  for (const entry of Object.values(index.cards)) {
    const attested = attestedSiblingTitles(entry);
    if (attested.length === 0) continue;
    for (const [lang, files] of Object.entries(entry.langs)) {
      if (files.name?.trim()) continue;
      const hit = pickPreferredSibling(attested, lang, prefer);
      if (!hit) continue;
      if (
        applyResolvedTitle(files, {
          kind: "fallback",
          name: hit.name,
          catalogue,
          from: hit.lang,
        })
      ) {
        named += 1;
      }
    }
    if (!entry.name?.trim()) {
      const hit = pickPreferredSibling(attested, "", prefer);
      if (hit) entry.name = hit.name;
    }
  }
  return { named };
}

/** Mutate `index` in place: resolve a title for each lang slot. */
export function attachTitlesToCardsIndex(
  index: CardsIndexV1,
  resolve: (
    printKey: string,
    lang: string,
    entry: CardsIndexEntry,
  ) => ResolvedIndexTitle | null | undefined,
): { named: number } {
  let named = 0;
  for (const [printKey, entry] of Object.entries(index.cards)) {
    for (const [lang, files] of Object.entries(entry.langs)) {
      if (files.name?.trim() && !files.nameLocaleFrom?.trim()) {
        // Already catalogue-visible (attested or show-fallback) — keep.
        named += 1;
        continue;
      }
      const resolved = resolve(printKey, lang, entry);
      if (applyResolvedTitle(files, resolved)) {
        named += 1;
        if (!entry.name?.trim() && resolved) {
          entry.name = resolved.name.trim();
        }
      }
    }
  }
  return { named };
}

type SiblingTitle = { lang: string; name: string };

function attestedSiblingTitles(entry: CardsIndexEntry): SiblingTitle[] {
  const out: SiblingTitle[] = [];
  for (const [lang, files] of Object.entries(entry.langs)) {
    const name = files.name?.trim();
    if (!name) continue;
    // Skip hide-borrows and derived pipelines — only re-share attested titles.
    if (files.nameLocaleFrom?.trim()) continue;
    if (files.nameSource?.trim()) continue;
    out.push({ lang: lang.toLowerCase(), name });
  }
  return out;
}

function pickPreferredSibling(
  attested: readonly SiblingTitle[],
  wantLang: string,
  prefer: readonly string[],
): SiblingTitle | null {
  const want = wantLang.toLowerCase();
  const pool = want
    ? attested.filter((row) => row.lang !== want)
    : [...attested];
  if (pool.length === 0) return null;
  for (const lang of prefer) {
    const hit = pool.find((row) => row.lang === lang);
    if (hit) return hit;
  }
  return pool[0] ?? null;
}
