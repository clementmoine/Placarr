# Dragon Ball providers (soft-nest)

Registry ids stay flat; folders nest by franchise. Franchise-shared helpers live
under [`shared/`](./shared/) (not `providers/shared/`).

## Packs

| Folder | Registry id | `catalogLifecycle` | Role |
| ------ | ----------- | ------------------ | ---- |
| [`dbscg/`](./dbscg/) | `dbscg` | living | DBS Masters (Bandai cardlists → `data/dragonball/cg/`) |
| [`dbsfw/`](./dbsfw/) | `dbsfw` | living | DBS Fusion World (fw/en → `data/dragonball/fw/`) |
| [`dbscards/`](./dbscards/) | `dbsmarket` | living | Prix-only Cardmarket dumps (dbscards.fr) |
| [`dbh/`](./dbh/) | `dbh` | living | Dragon Ball Heroes / SDBH (JA carddass.com) |
| [`dbsjcc/`](./dbsjcc/) | `dbsjcc` | finished | Bandai FR JCC / Carddass (2005–2009) |
| [`dbslamincards/`](./dbslamincards/) | `dbslamincards` | finished | Edibas Lamincards (PVC) |

## Shared (franchise)

| Folder | Role |
| ------ | ---- |
| [`shared/dbs/`](./shared/dbs/) | `createDbsCatalogModule`, Bandai collector helpers |
| [`shared/dbzcollection/`](./shared/dbzcollection/) | dbzcollection.fr site helpers (JCC / Lamincards) |

La famille **TCG Cards** (`tcgcards.fr` + sœurs `*cards.fr`) vit dans
[`providers/shared/tcgcards/`](../shared/tcgcards/) — un codebase Symfony,
plusieurs hosts (dbs / lor / pkm / ope / mtg / …), pas une holding Dragon Ball.

## Action template (local TCG)

Name modules by **capability**, not leftover verbs (`buildX`, `foldY` at root).

| Action | Typical file / folder |
| ------ | --------------------- |
| Provider contract | `index.ts` (thin) |
| Catalogue Sync | `extract.ts` |
| Print search | `search.ts` |
| Sealed SKUs | sealed via `shared/sealedProducts` + pack `curated/` |
| Disk / faces | `disk/` / `disk.ts` (when needed) |
| Identity / known cards | `identity.ts` or `pack.ts` + `printKey.ts` spine |
| Harvest staging | `harvest.ts` |
| Install into `data/` | `install/{faces,packshots,curated}.ts` |
| Ledgers / collectors | `sources/{faces,packshots,sealed,promos,prices,titles}.ts` |
| Network scrape | `scrape/` |
| HTML → typed | `parse/` |
| Rebuild / audit / migrate | `pipeline/` |
| Curated assets | `curated/` — **DATA only**, never count as code modules |

Same idea as [`providers/naruto/`](../naruto/) and [`providers/pokemon/`](../pokemon/).
