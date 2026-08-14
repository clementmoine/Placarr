# Docs Placarr — index

| Doc | Rôle | Statut |
|-----|------|--------|
| [core_architecture.md](core_architecture.md) | 5 piliers, DRY | **Vivant** |
| [codebase_map.md](codebase_map.md) | Où aller selon le bug | **Vivant** |
| [provider_integration_checklist.md](provider_integration_checklist.md) | Ajouter un provider | **Vivant** |
| [provider_supply_modes.md](provider_supply_modes.md) | Catalog providers, data vs curated, Catalogue hub | **Vivant** |
| [provider_external_links.md](provider_external_links.md) | Liens + URL-first prix | **Vivant** |
| [tcg_support.md](tcg_support.md) | TCG produit (Lorcana / Pokémon) | **Vivant** |
| [one_piece_tcg.md](one_piece_tcg.md) | One Piece : providers, apps, foil (recherche) | **Vivant** |
| [dragon_ball_super_card_game.md](dragon_ball_super_card_game.md) | DBS Masters / Fusion World : Deckplanet, SAMPLE, cardgame.fr | **Vivant** |
| [naruto_carddass_tcg.md](naruto_carddass_tcg.md) | Naruto — CACG / Carddass (+ autres lignes via sets) | **Vivant** |
| [naruto_carddass_fr_recovery.md](naruto_carddass_fr_recovery.md) | Naruto FR — audit recovery carddass.fr / trous / pistes | **Vivant** |
| [data-layout.md](data-layout.md) | `data/`, scripts, foil CLI | **Vivant** |
| [foil_effects.md](foil_effects.md) | Contrat foil CSS+WebGL (packs + sources) | **Vivant** |
| [foil_new_finish.md](foil_new_finish.md) | Ajouter un finish (Live / simey / Lorcana) | **Vivant** |
| [foil_apk_sources.md](foil_apk_sources.md) | Réseau vs APK (analyse ouverte) | **Vivant** |
| [foil_css_sources.md](foil_css_sources.md) | Pokémon CSS : Live ↔ simey | **Vivant** |
| [pokemon_live_rainier.md](pokemon_live_rainier.md) | Live Rainier : auth, config-docs, CDN, owned | **Vivant** |
| [backlog.md](backlog.md) | Ouverts | Mixte |
| [../TESTING.md](../TESTING.md) | Tests | **Vivant** |
| [archive/](archive/) | Audits / handoffs historiques | Archive |

## Data layout

Voir [data-layout.md](data-layout.md). Résumé :

```
data/uploads/          → /uploads (stream)
data/<pack>/foil/      → /foil/<pack>/… (stream)
data/launchbox|icollect|nointro|pokemon|lorcana|dbs/
data/indexes/title-idf/
```

Scripts foil / catalogues locaux :

```
src/providers/lorcanatcg/     → pnpm foil:lorcana
src/providers/pokemontcglive/ → pnpm foil:pokemon
src/providers/narutoccg/      → pnpm naruto:cards
src/providers/dbscg/          → pnpm dbs:cards
src/providers/{icollect,launchbox,nointro}/cli.ts
```

`pnpm foil:ensure` = stubs JSON des packs foil. Pocket **supprimé**.
