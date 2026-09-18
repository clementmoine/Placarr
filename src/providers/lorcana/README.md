# Lorcana providers (soft-nest)

Registry ids stay flat; folders nest by franchise.

## Packs

| Folder | Registry id | `catalogLifecycle` / role | Role |
| ------ | ----------- | ------------------------- | ---- |
| [`lorcanatcg/`](./lorcanatcg/) | `lorcanatcg` | `living` (`local_catalog`) | Official local dump → `data/lorcana/` (web + Unity) |
| [`lorcanajson/`](./lorcanajson/) | `lorcanajson` | `living` (`api_live`) | Community JSON API (FR/EN/DE/IT faces + foil masks) |
| [`lorcast/`](./lorcast/) | `lorcast` | price module | TCGplayer USD via Lorcast API |
| [`lorcanagg/`](./lorcanagg/) | `lorcanagg` | price module | Cardmarket EUR via Lorcana.gg (DotGG) |
| [`shared/`](./shared/) | — | franchise helpers | Promo set grouping → market codes |

`lorcanatcg` owns the local corpus; `lorcanajson` / `lorcast` / `lorcanagg` are complementary observations (JSON + prices), not stand-ins for the app dump.

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
