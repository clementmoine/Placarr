# narutocarddass — layout

Racine volontairement courte : `index`, `pipeline`, `cli`, contrat
catalogue (`facts`, `packs`, `printed`, `searchPrints`, `sealedProducts`…)
et chemins disque (`narutoCard*`, `indexStore`).

| Dossier | Rôle |
| --- | --- |
| `sources/` | Collecteurs / ledgers externes (Coleka, eBay, Mercari, Manga-News…) |
| `parse/` | HTML → structures typées |
| `scrape/` | Orchestration scrape réseau |
| `harvest/` | Staging Drive / packshots / vol.1 |
| `install/` | Staging / curated → `data/naruto/…` |
| `curated/` | Artefacts versionnés (cards, products, sources JSON) |

Phase 6.1 du plan de réorganisation (densité).
