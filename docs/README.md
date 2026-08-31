# Docs Placarr — index

| Doc                                                                    | Rôle                                                                                                                                                                                    | Statut     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [../ARCHITECTURE.md](../ARCHITECTURE.md)                               | **Chemin de lecture** — les 5 fichiers à ouvrir dans l'ordre                                                                                                                            | **Vivant** |
| [core_architecture.md](core_architecture.md)                           | 5 piliers, DRY                                                                                                                                                                          | **Vivant** |
| [ADR.md](ADR.md)                                                       | Décisions d'architecture (ADR)                                                                                                                                                          | **Vivant** |
| [codebase_map.md](codebase_map.md)                                     | Où aller selon le bug                                                                                                                                                                   | **Vivant** |
| [provider_integration_checklist.md](provider_integration_checklist.md) | Ajouter un provider                                                                                                                                                                     | **Vivant** |
| [provider_supply_modes.md](provider_supply_modes.md)                   | Catalog providers, data vs curated, Catalogue hub                                                                                                                                       | **Vivant** |
| [provider_external_links.md](provider_external_links.md)               | Liens + URL-first prix                                                                                                                                                                  | **Vivant** |
| [structure_vs_tako.md](structure_vs_tako.md)                           | Analyse tako-firehouse, chemin de lecture, `BaseProvider`                                                                                                                               | **Vivant** |
| [tcg_support.md](tcg_support.md)                                       | TCG produit (Lorcana / Pokémon)                                                                                                                                                         | **Vivant** |
| [card_pack_contract.md](card_pack_contract.md)                         | Contrat des packs cartes (cible d'harmonisation)                                                                                                                                        | **Vivant** |
| [collection_checklist.md](collection_checklist.md)                     | Check-list de collection + conseil d'achat (analyse)                                                                                                                                    | **Vivant** |
| [sealed_product_contents.md](sealed_product_contents.md)               | Contrat contenu scellé (`cardsPerPack`, garanties, pool) — obligatoire pour le conseil d'achat                                                                                          | **Vivant** |
| [one_piece_tcg.md](one_piece_tcg.md)                                   | One Piece : providers, apps, foil (recherche)                                                                                                                                           | **Vivant** |
| [dragon_ball_super_card_game.md](dragon_ball_super_card_game.md)       | DBS Masters / Fusion World : Deckplanet, SAMPLE, cardgame.fr                                                                                                                            | **Vivant** |
| [naruto_carddass_tcg.md](naruto_carddass_tcg.md)                       | Naruto — CACG / Carddass (+ autres lignes via sets)                                                                                                                                     | **Vivant** |
| [naruto_carddass_fr_recovery.md](naruto_carddass_fr_recovery.md)       | Naruto FR — audit recovery carddass.fr / trous / pistes                                                                                                                                 | **Vivant** |
| [naruto_source_sites_backlog.md](naruto_source_sites_backlog.md)       | Naruto — backlog des sites sources (faces, scellé, promos)                                                                                                                              | **Vivant** |
| [data-layout.md](data-layout.md)                                       | `data/`, scripts, foil CLI                                                                                                                                                              | **Vivant** |
| [curated_data.md](curated_data.md)                                     | Contrat des dossiers `curated/` (cards / products / sources)                                                                                                                            | **Vivant** |
| [foil_effects.md](foil_effects.md)                                     | Contrat foil CSS+WebGL (packs + sources)                                                                                                                                                | **Vivant** |
| [foil_new_finish.md](foil_new_finish.md)                               | Ajouter un finish (Live / simey / Lorcana)                                                                                                                                              | **Vivant** |
| [foil_apk_sources.md](foil_apk_sources.md)                             | Réseau vs APK (analyse ouverte)                                                                                                                                                         | **Vivant** |
| [foil_css_sources.md](foil_css_sources.md)                             | Pokémon CSS : Live ↔ simey                                                                                                                                                              | **Vivant** |
| [pokemon_live_rainier.md](pokemon_live_rainier.md)                     | Live Rainier : auth, config-docs, CDN, owned                                                                                                                                            | **Vivant** |
| [unity_without_python.md](unity_without_python.md)                     | Sortie UnityPy → Node (ADR-021 A–E **livré**)                                                                                                                             | **Vivant** |
| [backlog.md](backlog.md)                                               | Ouverts                                                                                                                                                                                 | Mixte      |
| [../TESTING.md](../TESTING.md)                                         | Tests                                                                                                                                                                                   | **Vivant** |
| [archive/](archive/)                                                   | Audits / handoffs historiques — dont `autonomy_audit.md`, `tcg_pack_architecture_audit.md`, `card_game_steam.md`, `naruto_promo_research.md` et les 4 handoffs foil / Live (2026-08-24) | Archive    |

## Data layout

Voir [data-layout.md](data-layout.md). Résumé :

```
data/uploads/          → /uploads (stream)
data/<pack>/foil/      → /foil/<pack>/… (stream)
data/launchbox|icollect|pokemon|lorcana|dbs|naruto/
data/indexes/title-idf/
```

Scripts catalogues / indexes locaux :

```
src/providers/lorcanatcg/     → Catalogue Extract (admin / worker)
src/providers/pokemontcglive/ → Catalogue Extract (admin / worker)
src/providers/narutocarddass/      → Catalogue Extract (admin / worker)
src/providers/{icollect,launchbox,nointro}/pipeline.ts
  → admin Local indexes / worker catalog
```

`installFullFoilMask` (extract) crée `full_foil_mask.webp` si absent. Pocket
**supprimé**.
