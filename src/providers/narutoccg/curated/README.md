# Naruto curated (non-replayable)

Recoverable scrape / derived output stays under `data/naruto/ccg/` (Wayback CDX,
Manga-News cache, catalogue faces, `logs/apache-index.json`). Anything here is
**hand-assembled** and lives in git because no CLI rebuilds it from the network
alone.

| Path | Why curated |
|------|-------------|
| `back.png` + `BACK.md` | Pack back never on Wayback; Figma → `cards/back.webp` |
| `reconstructed/*.png` | AI + Figma faces (missing / watermarked S5) |
| `reconstructed/source-photos/` | Authenticated Coleka photos — audit trail for reconstruct |
| `sources/sets.json` | Starters + Coleka labels + S6 cancelled |
| `sources/carddass-fr-checklist.json` | PDF S1–S5 transcribed by hand |
| `sources/carddass-card-names.json` | Official FR names + rarity + errata |
| `sources/carddass-html-refs.json` | Href ledger (parser candidate later) |
| `sources/coleka.json` | Targeted extract — S6 + S5 holes only |

Installed at refresh: curated sync → `data/naruto/ccg/cards/`. Regenerate
`logs/apache-index.json` with `pnpm naruto:cards -- --only sources`.
