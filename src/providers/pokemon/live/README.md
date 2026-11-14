# Pokémon TCG Live — local corpus (`pokemontcglive`)

Registry id: **`pokemontcglive`**. Soft-nest: `providers/pokemon/live/`.

Owner of `data/pokemon/` (`supplyMode: local_catalog`, `catalogLifecycle: living`).

## Action folders

| Folder | Role |
| ------ | ---- |
| [`cdn/`](./cdn/) | Rainier CDN scrape, catalogue, Malie, languages, sources |
| [`extract/`](./extract/) | APK / UnityFS dump, textures, bundle ledger, audits |
| [`foil/`](./foil/) | Shaders, Simey CSS layers, material sheets, foil inventory |
| [`pipeline/`](./pipeline/) | Catalogue hooks, live index, cards-index rebuild, owned sync |
| [`disk/`](./disk/) | Live attachment builders for metadata |
| root | `index.ts`, playroom (`liveCard*`), `gameSettings` |

Companion API enrich: [`../tcgdex/`](../tcgdex/) (`tcgdex`).
