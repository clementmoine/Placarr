# TCGdex — paper Pokémon catalogue (`api_live`)

Registry id: **`tcgdex`**. Soft-nest: `providers/pokemon/tcgdex/`.

## Actions

| File / folder | Role |
| ------------- | ---- |
| `index.ts` | ProviderModule, metadata, print search |
| `fetch.ts` | TCGdex REST |
| [`disk/`](./disk/) | Local card dir + art URL + face ranking (`faceChoice`) |
| [`scrape/`](./scrape/) | Paper-face fillers, harvest orchestrator, Coleka |
| `indexStore.ts` | Local prints sqlite mirror |
| `scrapeCards.ts` | Catalogue scrape into index store |
| root | set logos / meta, lookup titles, playroom samples |

Companion living corpus: **`pokemontcglive`** (`local_catalog`) → `data/pokemon/`.
