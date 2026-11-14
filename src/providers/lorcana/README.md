# Lorcana providers (soft-nest)

Registry ids stay flat; folders nest by franchise.

## Packs

| Folder | Registry id | `catalogLifecycle` / role | Role |
| ------ | ----------- | ------------------------- | ---- |
| [`lorcanatcg/`](./lorcanatcg/) | `lorcanatcg` | `living` (`local_catalog`) | **Catalogue owner** — local dump → `data/lorcana/` (picker / check-list / scellés ; repli JSON distant) |
| [`lorcanajson/`](./lorcanajson/) | `lorcanajson` | `living` (`api_live`) | Enrich only — community JSON (faces + foil masks) ; plus de surface print |
| [`lorcast/`](./lorcast/) | `lorcast` | price module | TCGplayer USD via Lorcast API |
| [`lorcanagg/`](./lorcanagg/) | `lorcanagg` | price module | Cardmarket EUR via Lorcana.gg (DotGG) |
| [`lormarket/`](./lormarket/) | `lormarket` | price module | Cardmarket EUR via dump liste lorcards.fr |
| [`shared/`](./shared/) | — | franchise helpers | Promo set grouping → market codes |

`lorcanatcg` owns picker + check-list + local corpus; `lorcanajson` is enrich metadata only. `lorcast` / `lorcanagg` / `lormarket` are price observations.

## Action template (local TCG)

| Action | Typical file / folder |
| ------ | --------------------- |
| Provider contract | `index.ts` (thin) |
| Catalogue Extract | `extract.ts` |
| Unity / foil | `extract/` (+ `unity/` fixtures) |
| Scrape / fill | `scrape/` |
| Sources | `sources/` |
| Pipeline / dump | `pipeline/` |
| Disk / index | `indexStore.ts` |
| Curated assets | `curated/` — **DATA only** |

Same idea as [`providers/pokemon/`](../pokemon/) and [`providers/naruto/`](../naruto/).
