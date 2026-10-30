# Naruto providers (soft-nest)

Registry ids stay flat; folders nest by franchise. **Canon layout** =
[Carddass action map](./narutocarddass/README.md).

## Packs

| Folder | Registry id | `catalogLifecycle` | Role |
| ------ | ----------- | ------------------ | ---- |
| [`narutocarddass/`](./narutocarddass/) | `narutocarddass` | `finished` | Bandai Carddass / CCG |
| [`narutoshippuden/`](./narutoshippuden/) | `narutoshippuden` | `finished` | 疾風伝 (JA) |
| [`narutoranks/`](./narutoranks/) | `narutoranks` | `finished` | Panini Ninja Ranks |
| [`narutoultra/`](./narutoultra/) | `narutoultra` | `finished` | Panini Ultra Challenge |
| [`narutomythos/`](./narutomythos/) | `narutomythos` | living | CICABOOM Mythos |
| [`narutokayou/`](./narutokayou/) | `narutokayou` | living | Kayou (~1000 `curated/` files = **DATA**, expected) |
| [`narutodatacarddass/`](./narutodatacarddass/) | `narutodatacarddass` | living | Arcade Data Carddass |

## Shared (franchise)

| Folder / file | Role |
| ------------- | ---- |
| [`shared/gg/`](./shared/gg/) | Naruto Card Game .gg archive harvest / prices / HTML parse |
| [`shared/narutopia/`](./shared/narutopia/) | Narutopia checklist HTML parse |
| [`shared/bandaiPackshots.ts`](./shared/bandaiPackshots.ts) | Bandai JAN → packshot download (Carddass / 疾風伝) |

## Action template (local TCG)

Name modules by **capability**, not leftover verbs (`buildX`, `foldY` at root).

| Action | Typical file / folder |
| ------ | --------------------- |
| Provider contract | `index.ts` (thin) |
| Catalogue Sync | `extract.ts` |
| Print search | `search.ts` |
| Sealed SKUs | `sealed.ts` |
| Disk / faces | `disk.ts` (when needed) |
| Identity / known cards | `identity.ts` or `pack.ts` + `printKey.ts` spine |
| Harvest staging | `harvest.ts` |
| Install into `data/` | `install/{faces,packshots,curated}.ts` |
| Ledgers / collectors | `sources/{faces,packshots,sealed,promos,prices,titles}.ts` |
| Network scrape | `scrape/{coleka,bandai,marketplace,catalogues}.ts` |
| HTML → typed | `parse/` (same families) |
| Rebuild / audit / migrate | `pipeline/{coverage,ledgers,suruga,drive,audit}.ts` |
| Curated assets | `curated/` — **DATA only**, never count as code modules |

Same idea as [`providers/pokemon/`](../pokemon/) (`cdn/` / `extract/` / `foil/`).
