# Pokémon providers (soft-nest)

Registry ids stay flat; folders nest by franchise.

| Folder | Registry id | `supplyMode` | Role |
| ------ | ----------- | ------------ | ---- |
| [`tcgdex/`](./tcgdex/) | `tcgdex` | `api_live` | Paper API, prices, face harvest |
| [`live/`](./live/) | `pokemontcglive` | `local_catalog` | CDN / APK / foil owner → `data/pokemon/` |

Both declare `printGames: ["pokemon"]` and `catalogLifecycle: "living"`.

## Action folders (light densify)

| Pack | Folders |
| ---- | ------- |
| `live/` | `cdn/`, `extract/`, `foil/`, `pipeline/` (index + rebuild + sync), `disk/` (live attachments) |
| `tcgdex/` | `disk/` (paper card paths + face choice), `scrape/` (faces + Coleka + harvest) |
