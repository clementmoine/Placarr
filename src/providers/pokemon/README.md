# Pokémon providers (soft-nest)

Registry ids stay flat; folders nest by franchise.

| Folder | Registry id | `supplyMode` | Role |
| ------ | ----------- | ------------ | ---- |
| [`tcgdex/`](./tcgdex/) | `tcgdex` | `api_live` | Harvest + enrich + prix (pas de surface print) |
| [`live/`](./live/) | `pokemontcglive` | `local_catalog` | **Catalogue owner** — picker / check-list / scellés + CDN / APK / foil → `data/pokemon/` |

`pokemontcglive` declares `printGames: ["pokemon"]` ; both use `catalogLifecycle: "living"`.

## Action folders (light densify)

| Pack | Folders |
| ---- | ------- |
| `live/` | `cdn/`, `extract/`, `foil/`, `pipeline/` (index + rebuild + sync), `disk/` (live attachments) |
| `tcgdex/` | `disk/` (paper card paths + face choice), `scrape/` (faces + Coleka + harvest) |
