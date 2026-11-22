---
name: add-tcg-line
description: Add a new trading-card game line / pack (catalogue tab, print search, checklist, admin Sync) or grow an existing TCG pack's corpus (sets, cards, faces, backs, sealed products and their contents). Use for anything about printKey, LocalTcgLineSpec, createLocalTcgLine, curated/ folders, sealed product contents or Catalogue Sync of a TCG.
---

# Add or grow a TCG line

Living contract: `docs/tcg_new_pack.md` (read it first, it has the full checklist).
Related: `docs/catalogue_contract.md` (one sqlite identity corpus per pack, lifecycle, autonomy), `docs/curated_data.md` (what goes in `curated/`), `docs/sealed_product_contents.md` (sealed tree, `cardsPerPack`, `packsPerHit`), `docs/data-layout.md`.
Franchise research notes live in `docs/` (see the map in `src/providers/CLAUDE.md`) — read the relevant one before touching a franchise.

## Non-negotiable identity rules

- Mint with `buildPrintKey({ game, set, number, grouping? })` — never a hand-glued string. Format `game:set-number[-grouping]`.
- The set in a printKey is the **catalogue chapter**, not the number family. Bare numbers + alphabetic sets need `catalogueSetCodes: alphabeticCatalogueSetCodes([...])`, otherwise ownership/checklist resolve `null`.
- Language is **never** in the key: titles, faces, prices are language-tagged facts. Borrowing a face across locales must be explicit provenance.
- `printed: false` is the only way to mark prints with no paper in a channel — no second magic list.
- One sqlite identity corpus per pack, read by admin, checklist and item search. Live/Unity dumps are asset sources, not a second enumeration.

## New game (bootstrap)

```
src/providers/<franchise>/<id>/
  pack.ts       # stable ids (provider, pack, effect, printGame) + *CuratedDir()
  printKey.ts   # mint / parse / format / setLabel (+ CATALOGUE_SET_CODES)
  index.ts      # createEmptyLocalTcgProvider({ lineSpec, runPipeline }) or createLocalTcgLine
  extract.ts    # runLocalTcgPipeline({ seed, seedProducts? })
  curated/      # cards/ products/ sources/ (+ BACK.md notes, never installed)
```

Then: registry entry in `src/core/catalog/registry.ts`, `CATALOGUE_PACKS` entry, `src/effects/<id>/` + side-effect import in `src/effects/index.ts`, minimal curated back, a `catalogueSetFromPrintKey` test on a real printKey, add the id to `FACTORY_LOCAL_TCG_IDS` in `localTcgContract.test.ts`. Never copy a legacy pack (`narutocarddass`, `lorcanatcg`, `pokemontcglive`, `dbscg`, `dbsfw`) — start from the factory. References: `bleach/bleachscb`, `naruto/narutoranks`, `onepiece`.

## Growing a pack (new sets / cards / sealed / faces)

- Sync only: harvest → install → faces → sealed → `products-contents.json`. **No new `if` in core** and no per-set list in core. If a need recurs in ≥ 2 packs, extend `LocalTcgLineSpec` or a `ProviderModule` hook.
- Recoverable data (crawled ledgers, marketplace prices, faces fetchable by URL) → `data/<pack>/` (gitignored). Hand-assembled, non-replayable data (digs, reconstructions, attested id maps, durable Wayback) → `src/providers/<id>/curated/` (committed). A normal Sync must not dirty `src/providers/`.
- Keep every attested source on disk (`art.<source>.*`); `faceChoice` / `productChoice` pick the display. Never skip a source because "we already have better".
- Sealed contents and composition numbers must be **attested** (official page, scan, shop fiche). Unknown = `null`, never a guessed or AI-suggested number (see `src/providers/leclerc/curated/BACK.md` for an example of rejected guesses).

## Done when

- `pnpm test` green, including `localTcgWiring.test.ts`, `localTcgContract.test.ts`, `legacyTcgContract.test.ts` and the blindness guards (no provider literal outside `src/providers/`).
- `git status` after a Sync shows no changes under `curated/sources` unless attested identifiers changed.
- The franchise doc in `docs/` gets a dated note for anything learned about the sources (what was exhausted, what is still open).
