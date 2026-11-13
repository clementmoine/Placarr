# mtg — action map

| Action | Module |
| --- | --- |
| Provider contract | `index.ts` |
| Pack / printKey | `pack.ts`, `printKey.ts` |
| Extract | `extract.ts` |
| Harvest (Scryfall) | `harvest/{seedFromScryfall,scryfallBulk,fillScryfallFaces}.ts` |
| CDN art ledger | `artUrls.ts` + `curated/art-urls.json` |
| Densify Sync | `scryfall-faces` → `art.scryfall.*` (shop faces: `--mtgcards-faces`) |
| Catalogue browse | `catalogueBrowse.ts` (local face ‖ Scryfall CDN soft-fill) |
| Finishes | `finishes.ts` |
| Curated | `curated/` — **DATA** |
| CCG Trader (sets) | `sources/ccgtrader.ts` → `shared/ccgtrader` (`ingest: none`) |

Registry id unchanged.
