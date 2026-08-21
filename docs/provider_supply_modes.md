# Provider supply modes & catalog providers

Companion to [provider_integration_checklist.md](provider_integration_checklist.md),
[data-layout.md](data-layout.md), [core_architecture.md](core_architecture.md).

## Rules

1. **A catalog provider is a provider** — same `ProviderModule` spine, registry
   line, observations with `source` = its id. No parallel TCG subsystem in core.
2. **Providers are autonomous / plug-and-play** — one folder under
   `src/providers/<id>/`, tambouille stays inside the module.
3. **Core (and generic admin) are provider-blind** — traits + hooks only; never
   `if (providerId === "…")`. Catalogue UI / auto-sync / refresh derive from
   modules that expose `catalog`.
4. **One physical origin = one named provider** — incompleteness across providers
   is fine (consensus). Do not aggregate dump-app bytes under another service’s id
   (e.g. Lorcana Unity dump → `lorcanatcg`, not `lorcanajson`).
5. **`src/effects/` is a render engine** — WebGL/CSS recipes only. Recoverable
   textures/shaders live under `data/<pack>/`; non-replayable curated assets live
   under the producing provider’s `curated/`.

## `supplyMode` (on `ProviderInfo`)

| Mode            | Meaning                             | Examples                                                   |
| --------------- | ----------------------------------- | ---------------------------------------------------------- |
| `api_live`      | Remote API / static HTTP JSON       | TCGdex, IGDB, LorcanaJSON                                  |
| `scrape_cache`  | Scraper + durable local cache       | iCollect, shop scrapes                                     |
| `local_catalog` | Owned local corpus (SQLite / cards) | LaunchBox, No-Intro, lorcanatcg, pokemontcglive, narutoccg |

Default when unset after materialize: `api_live`.

## Data vs curated

| Content                                                                     | Location                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Fully recoverable via the provider’s scripts (DB, CDN dumps, Wayback bytes) | `data/<pack>/` — **never commit**                                    |
| Hand-assembled; no reliable official/repeatable net source                  | `src/providers/<id>/curated/` (git); install into `data/` at refresh |

## Catalog hook (`ProviderModule.catalog`)

Optional surface for refreshable local corpora (same pattern as `searchPrints`):

| Field            | Role                                      |
| ---------------- | ----------------------------------------- |
| `dataPack`       | Slug under `data/<pack>/`                 |
| `status()`       | `{ empty, stale, lastSyncAt }`            |
| `refresh(opts?)` | In-process rebuild/sync (`auto` vs force) |

Admin **Catalogue** tab: refresh all / per-provider / Plex-like auto loop when
`status().stale`. Workers call `catalog.refresh` — no hard-coded provider id
lists in core.

## Recommended layout

```
src/providers/<id>/
  index.ts       # ProviderModule
  pipeline.ts    # catalog.refresh implementation
  cli.ts         # thin pnpm entry
  indexStore.ts  # sqlite helpers
  curated/
    cards/       # same tree as data/<pack>/cards — mirrored at refresh
    sources/     # ledgers (optional)
  unity/         # UnityPy island only (if needed)
```

Repo-wide tools stay under `scripts/` (`backgroundWorker`, shared media audits).

## Ultimate catalog provider checklist

- [ ] `info.supplyMode` set (`local_catalog` or `scrape_cache` with local index).
- [ ] `catalog.dataPack` + `status` + `refresh` implemented.
- [ ] `createMetadataAdapter` (and/or print hooks) serves structured observations
      with **this** provider’s id as source.
- [ ] `healthCheck` + `mappingProbe` (classic checklist).
- [ ] Recoverable bytes → `data/`; curated → `curated/`.
- [ ] Registered in `PROVIDER_MODULES` only — no core allowlist growth.
- [ ] Auto-sync uses `status().stale`; manual refresh can force.
- [ ] Tests: contract suite + provider unit tests for refresh/status.

## Lorcana attribution

| Provider      | Role                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `lorcanatcg`  | Local dump (web CSS + cards scrape + **Unity / mobile app**) → `data/lorcana/`    |
| `lorcanajson` | Live/community JSON API — complementary observations, not a stand-in for app dump |

Gaps in one source → second provider + consensus; never silent merge under the
wrong `source` id.

## Catalogue admin vs metadata Refresh

- **Catalogue** (`?tab=tcg-effects`) — local corpora (TCG packs + LaunchBox /
  iCollect / No-Intro / …): refresh all, unit, auto.
- **Refresh** tab — item **metadata** enrichment queue — unrelated.
