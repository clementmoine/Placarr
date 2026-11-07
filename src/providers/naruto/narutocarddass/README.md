# narutocarddass — action map

Root is organised by **action**, not by leftover verb filenames.
`curated/` is **DATA** (versioned ledgers / faces / products), not an action module.

| Action | Module | Does |
| --- | --- | --- |
| Provider contract | `index.ts` | Thin `ProviderModule` only |
| Extract orchestration | `extract.ts` | Catalogue Sync step runner |
| Search prints | `search.ts` | Print search, orientation, candidates |
| Sealed products | `sealed.ts` | SKUs, volume products, tin-box promos |
| Disk / faces | `disk.ts` | Card paths, face bytes, face choice, vol.1 faces |
| Identity | `identity.ts` | Collectors, appearances, facts, known-cards, FR checklist, names |
| Pack line (client-safe) | `packs.ts` | Pack id + verso/line helpers (admin bundle; no `node:`) |
| Index store | `indexStore.ts` | SQLite catalogue + cards-index |
| Harvest | `harvest.ts` | Staging harvest entrypoints |
| Product art choice | `productChoice.ts` | Sealed packshot selection |
| Fold / migrate / thumbs | `pipeline/index.ts` | Index fold, layout migrate, thumb fix |
| Coverage | `pipeline/coverage.ts` | Checklist, completeness, apache sources |
| Ledgers | `pipeline/ledgers.ts` | Merge attested title/rarity ledgers |
| Suruga | `pipeline/suruga.ts` | Suruga harvest + vol.1 probes |
| Drive | `pipeline/drive.ts` | Local Naruto CCG Drive ingest |
| Audit | `pipeline/audit.ts` | Face collisions, unsourced art fold |

## Subfolders (unchanged role)

| Folder | Role |
| --- | --- |
| `sources/` | External collectors / ledgers |
| `parse/` | HTML → typed structures |
| `scrape/` | Network scrape orchestration |
| `harvest/` | Staging helpers / tests |
| `install/` | Staging / curated → `data/naruto/…` |
| `curated/` | **DATA** — cards, products, sources JSON |

Soft-nest: `providers/naruto/narutocarddass/` (registry id unchanged).
