# src/providers — one source per folder

Workflows: `add-provider` skill (metadata / price / retailer), `add-tcg-line` skill (card games), `source-research` skill (probing a site or app). Contract: `src/types/providerModule.ts`, factory `shared/defineProvider.ts`, registration `src/core/catalog/registry.ts`.

## Rules

- HTTP only through `@/lib/http` (`httpGet` / `httpPost` / `httpHead`, `fetchTextWithFlareFallback`) or `ctx.http` — bare `fetch()` and `axios` imports are ESLint errors here (ADR-008).
- A provider hardcodes only what is specific to its own API/format, declares capabilities factually, and never injects app-global logic. Each extracted value keeps its document role, language/region and a deep-link citation.
- Tokens are read lazily at call time; a missing key leaves the provider `blocked`.
- Recoverable data → `data/<pack>/` (gitignored). Hand-assembled, non-replayable data → `<id>/curated/` (committed, contract in `docs/curated_data.md`). `curated/**/BACK.md` notes are documentation and are never installed.
- Folders nest by franchise (`naruto/`, `dragonball/`, `pokemon/`…) but registry ids stay flat. Repeated behaviour belongs in `shared/` (cardCatalogue, sealedProducts, tcgcards, wayback, coleka, softban…), not copied per pack.
- Legacy packs (`narutocarddass`, `lorcanatcg`, `pokemontcglive`, `dbscg`, `dbsfw`) keep their own pipelines; never copy them for a new game.

## Domain notes (read before touching a franchise)

| Area | Docs |
| ---- | ---- |
| Naruto (Carddass / CACG, Ranks, Ultra, 疾風伝, Data) | `docs/naruto_carddass_tcg.md`, `docs/naruto_carddass_fr_recovery.md`, `docs/naruto_source_sites_backlog.md`, `naruto/README.md` |
| Dragon Ball (Masters, Fusion World, JCC, Heroes) | `docs/dragon_ball_super_card_game.md`, `docs/fusion_world_digital.md`, `dragonball/README.md` |
| Pokémon (TCG Live, TCGdex) | `docs/pokemon_live_rainier.md`, `docs/tcg_support.md`, `pokemon/README.md` |
| Lorcana | `docs/tcg_support.md` (§6 bis LorcanaJSON pitfalls), `lorcana/README.md` |
| One Piece | `docs/one_piece_tcg.md` |
| Sealed products / SKUs | `docs/sealed_product_contents.md`, `docs/sealed_sku_lang_coverage.md` |
| Catalogue sources still under-used | `docs/catalogue_sources_underexploited.md` |
| Retailer links, price refresh by stored URL | `docs/provider_external_links.md`, `commerce/README.md` |
| Supply modes, local corpora (LaunchBox, iCollect, No-Intro) | `docs/provider_supply_modes.md` |
