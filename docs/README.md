# Docs Placarr — index

> Pour Claude Code : règles dans [`../CLAUDE.md`](../CLAUDE.md) (+ `src/core|providers|effects/CLAUDE.md`), procédures dans `.claude/skills/`. Ces skills renvoient aux docs ci-dessous, qui restent la source de vérité.

| Doc                                                                    | Rôle                                                                                                                                                                                    | Statut     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [../ARCHITECTURE.md](../ARCHITECTURE.md)                               | **Chemin de lecture** — les 5 fichiers à ouvrir dans l'ordre                                                                                                                            | **Vivant** |
| [core_architecture.md](core_architecture.md)                           | 5 piliers, DRY                                                                                                                                                                          | **Vivant** |
| [ADR.md](ADR.md)                                                       | Décisions d'architecture (ADR)                                                                                                                                                          | **Vivant** |
| [codebase_map.md](codebase_map.md)                                     | Où aller selon le bug                                                                                                                                                                   | **Vivant** |
| [provider_integration_checklist.md](provider_integration_checklist.md) | Ajouter un provider                                                                                                                                                                     | **Vivant** |
| [provider_supply_modes.md](provider_supply_modes.md)                   | Catalog providers, data vs curated, Catalogue hub                                                                                                                                       | **Vivant** |
| [admin_surface.md](admin_surface.md)                                   | Admin web + worker vs scripts CLI (dev-only) — Plex-like                                                                                                                                | **Vivant** |
| [provider_external_links.md](provider_external_links.md)               | Liens + URL-first prix                                                                                                                                                                  | **Vivant** |
| [tcg_support.md](tcg_support.md)                                       | TCG produit (Lorcana / Pokémon)                                                                                                                                                         | **Vivant** |
| [card_identify_learning.md](card_identify_learning.md)                 | Identify cartes — index embeddings vs fine-tune CLIP (ADR-023)                                                                                                                          | **Vivant** |
| [catalogue_contract.md](catalogue_contract.md)                                   | Contrat catalogue une base (alimenter / stocker / exploiter / sync)                                                                              | **Vivant** |
| [tcg_new_pack.md](tcg_new_pack.md)                                     | **Ajouter une ligne TCG** — `LocalTcgLineSpec`, factory, checklist                                                                                                                      | **Vivant** |
| [collection_checklist.md](collection_checklist.md)                     | Check-list de collection + conseil d'achat (analyse)                                                                                                                                    | **Vivant** |
| [sealed_product_contents.md](sealed_product_contents.md)               | Contrat contenu scellé (`cardsPerPack`, garanties, pool) — obligatoire pour le conseil d'achat                                                                                          | **Vivant** |
| [one_piece_tcg.md](one_piece_tcg.md)                                   | One Piece : providers, apps, foil (recherche)                                                                                                                                           | **Vivant** |
| [dragon_ball_super_card_game.md](dragon_ball_super_card_game.md)       | DBS Masters / Fusion World : Deckplanet, SAMPLE, cardgame.fr                                                                                                                            | **Vivant** |
| [fusion_world_digital.md](fusion_world_digital.md)                 | Client Fusion World : manifeste GUS, gabarit CDN, détection de build                                                                                                                    | **Vivant** |
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
| [backlog.md](backlog.md)                                               | Ouverts                                                                                                                                                                                 | Mixte      |
| [backlog/](backlog/)                                                   | Notes datées — cycle scellé / virtuel + [passation](backlog/2026-11-07-passation-cycle-scelle.md) ; [reste absence](backlog/2026-11-08-absence-reste-plan.md) ; **P0** [reconstruction des étagères](backlog/2026-11-21-reconstruction-etageres.md) + [audit catalogues / réseau / data](backlog/2026-11-21-audit-catalogues-reseau-data.md) (matching, trocs, declare, export) | Idées      |
| [../TESTING.md](../TESTING.md)                                         | Tests                                                                                                                                                                                   | **Vivant** |
| [database.md](database.md) | Postgres : volume, dumps, restauration, migration d'hôte | **Vivant** |
| [device_mitm_frida.md](device_mitm_frida.md) | Écoute HTTPS d'apps sur téléphone réel (mitmproxy + Frida) | **Vivant** |
| [archive/](archive/) | Audits / handoffs historiques — dont `autonomy_audit.md`, `tcg_pack_architecture_audit.md`, `card_pack_contract.md`, `structure_vs_tako.md`, `unity_without_python.md`, les audits catalogue printKey×langue / non-TCG et les handoffs foil / Live | Archive |

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
src/providers/lorcana/lorcanatcg/     → Catalogue Extract (admin / worker)
src/providers/pokemon/live/ → Catalogue Extract (admin / worker)
src/providers/naruto/narutocarddass/      → Catalogue Extract (admin / worker)
src/providers/{icollect,launchbox,nointro}/pipeline.ts
  → admin Local indexes / worker catalog
```

`installFullFoilMask` (extract) crée `full_foil_mask.webp` si absent. Pocket
**supprimé**.
