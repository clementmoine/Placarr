# narutoshippuden — action map

Root is organised by **action**. `curated/` is **DATA**, not an action module.

| Action | Module | Does |
| --- | --- | --- |
| Provider contract | `index.ts` | Thin `ProviderModule` |
| Extract / Sync CLI | `extract.ts` | Catalogue Sync entry (+ optional Suruga crawl) |
| Catalog hooks | `catalog.ts` | Ordered migrate → ledgers → faces → sealed → index |
| Search prints | `search.ts` | Printed-ref → disk id, format reference |
| Sealed products | `sealed.ts` | 19 SKU specs + ingest |
| Assets / paths | `assets.ts` | Curated dir + card URL helpers |
| Index store | `indexStore.ts` | SQLite + cards-index |
| Migrate / ledgers / Suruga | `pipeline/*` | Carddass migrate, official ledgers, Suruga harvest |

## Subfolders

| Folder | Role |
| --- | --- |
| `install/` | Mercari / Suruga faces, official packshots |
| `sources/` | External face ledgers (e.g. Mercari) |
| `parse/` | Suruga HTML → listings |
| `pipeline/` | Rebuild / migrate / harvest verbs |
| `curated/` | **DATA** — sources JSON, cards, products |
