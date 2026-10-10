# Contrat catalogue — une base, zéro désync

> Vivant. Companion : [provider_supply_modes.md](provider_supply_modes.md), [data-layout.md](data-layout.md), [card_pack_contract.md](card_pack_contract.md).
> Audits : [catalogue_sources_underexploited.md](catalogue_sources_underexploited.md), [catalogue_printkey_lang_audit.md](catalogue_printkey_lang_audit.md), [catalogue_non_tcg_provider_audit.md](catalogue_non_tcg_provider_audit.md).

## Règle d’or

**Un seul corpus d’identité par pack** (sqlite), lu pour :

- admin Catalogue,
- checklists,
- ajout d’items / recherche print.

Valable pour **tous** les packs TCG (Pokémon, Lorcana, DBS, One Piece, Naruto, MTG, YGO…), pas seulement Pokémon / Lorcana.

Interdit : JSON admin d’un côté et sqlite checklist de l’autre ; `printKey` Live-stem d’un côté et `game:set-num` de l’autre pour la **même** tuile d’identité.

Les dumps Live / Unity restent des **sources d’assets** (foil, textures) — pas une deuxième vérité d’énumération.

## Cycle de vie

```
Sources (API, CDN, scrape, archive, curated)
  → fetch si hash distant ≠ ledger
  → staging/ (transit)
  → promote exhaustif → sqlite + data/<pack>/ (formats optimisés)
  → ledger { artefactId, contentHash, promotedAt }
  → purge octets staging
```

Sync suivant : même hash → **0 re-download** même si staging vide.

## Stockage

| Couche | Rôle |
|--------|------|
| Sqlite SSOT | `prints` / `print_titles` / assets / produits ; faits **langués + provenance** |
| `data/<pack>/cards/`… | Octets locaux (WebP…) quand conservation requise |
| URL distante | OK **seulement** si source **durableCdn** (trait host / provider) |
| Staging | Jamais vérité ; consommé puis purgé |
| `cards-index.json` | **Plus écrit** — identité = sqlite ; Kayou sidecar (lenticular) → `pack_documents.cards-index` |
| `products-index.json` | **Plus écrit** par défaut — projection legacy optionnelle |
| `locale-specific-faces.json` | Remplacé par table `locale_specific_faces` dans `catalog.sqlite` |
| `appearances.json` / `facts-ja.json` (Carddass) | Remplacés par `pack_documents` |
| `tcgdex-set-logos.json` (Pokémon) | Remplacé par `pack_documents.tcgdex-set-logos` |
| `set-logos.json` (Lorcana) | Remplacé par `pack_documents.lorcana-set-logos` |

Projections **supprimées du disque** (2026-09-22+) : `products-index.json`, `locale-specific-faces.json`, Carddass `appearances` / `facts-ja`, DBS `facts.json`, **`cards-index.json`**.

### Staging — promote → ledger → purge

Ledger durable : `data/<pack>/logs/catalog-ingest-ledger.json` (jamais sous `staging/`).

| Pack | Artefact | Hash | Après promote |
|------|----------|------|----------------|
| MTG | `scryfall:all_cards` | Scryfall `updated_at` | Purge bulk staging ; sync suivant = meta seule si frais |
| Pokémon Live | `cdn-bundle-versions.json.gz` + `catalog-ingest-ledger.json` sous `logs/` | Hash128 manifeste (cartes + shaders/attack) ; fingerprint manifests ; Malie revision fingerprint ; APK `versionCode` ; Coleka McDo `observed\|branch\|set\|lang\|count` ; TCG Cards `sha256(products.json)` | Après extract OK → promote assumed→verified → purge `cdn-bundles` / `cdn-manifests` / `malie-databases` / `.apk` / `apk-store-meta` staging / **`config-cache`** ; inventaire Malie + catalogue compact + **`logs/apk-store-meta.json`** durables ; Coleka McDo + **pkmcards-products** ; Simey → `foil/simey/` ; cold-start = Malie + CDN epoch probe |
| Lorcana | `catalog-ingest-ledger.json` + `logs/lorcards-products/` + `logs/apk-store-meta.json` | TCG Cards `sha256(products.json)` ; APK `versionCode` ; `lorcana:official-site` | Après Sync OK → purge `lorcards-products` staging / `.apk` / `unity-data` ; logos → `pack_documents.lorcana-set-logos` ; cold-start = store APK + API logos + scrape |
| DBS CG / FW | ledger + `logs/dbscards-products/` | TCG Cards hash ; `dbs-cg:arena-clone` (git HEAD) | Purge `dbscards-products` + arena clone après promote ; digs `tts` / Chitoro inchangés |
| One Piece | ledger + `logs/opecards-products/` + `logs/punk-records/` | TCG Cards hash ; `onepiece:punk-records` | Purge `opecards-products` + `punk-records` staging après seed |
| MTG | ledger + `logs/mtgcards-products/` | `scryfall:all_cards` (`updated_at`) ; TCG Cards hash | Purge bulk Scryfall + `mtgcards-products` staging |
| YGO | ledger + `logs/ygoprodeck/` + `logs/scanflip/` | `yugioh:ygoprodeck-tcg` ; `yugioh:scanflip-fr` ; TCG Cards | Purge staging JSON après install faces |
| Naruto Kayou / DCD / Drive | ledger | `kayou:*` ; `faces:*` ; `drive:naruto-ccg` | Purge digs valorisés ; face-gap digs (Suruga, Mercari, …) inchangés |
| Carddass | `drive:naruto-ccg` | `observed\|folderId` curated | Purge `staging/naruto-ccg-drive` après install faces OK |

`--force` contourne le ledger. Digs face-gap / staging non mappé : **ne pas purger** tant que non valorisés.

## Identité et langue

- `printKey` = identité (voir audit printKey×langue).
- Titre, face, prix = faits `(lang, provenance[, source])`.
- Demande locale → préférer faits de cette langue ; borrow = provenance explicite.

## Durabilité d’accès

À l’ingest d’URL : résoudre la source →

- **durableCdn** → pointer distant OK ;
- sinon → **conservation locale** obligatoire.

Module partagé : [`src/providers/shared/catalogDurableCdn.ts`](../src/providers/shared/catalogDurableCdn.ts).

## Staging

Pattern ledger : [`src/providers/shared/catalogIngestLedger.ts`](../src/providers/shared/catalogIngestLedger.ts) (généralise l’idée `bundleLedger` Pokémon).

Après promote réussi d’un artefact : enregistrer le hash puis **supprimer** le fichier staging correspondant.

## Exploitation

| Surface | Lecture |
|---------|---------|
| Admin browse | Builder pack depuis **sqlite** (`catalogueIdentityBrowse` — tous TCG, y compris Carddass) |
| Checklist / `listSetPrints` | Même sqlite |
| Ajout / `searchPrints` | Même sqlite |
| Scellés | Tables `products` / `product_contents` dans le **même** `catalog.sqlite` (jointures printKeys) ; `products-index.json` projection optionnelle |

Test de garde : [`catalogContract.test.ts`](../src/providers/shared/catalogContract.test.ts) — durableCdn, ledger purge, printKeys admin ⊆ checklist, Carddass identity ≠ null.

**Pokémon :** identité = `catalog.sqlite` (TCGdex) ; dump Live / foil = `live.sqlite` (frère, pas une deuxième identité).

## Cold-start (wipe `data/` + Sync)

Catalogue Sync reconstruit le corpus **sans** snapshot local, moyennant délai réseau :

- Scrapes / API / CDN / Malie / store APK / logos TCGdex → staging → promote → ledger → purge.
- Pokémon Live CDN : **Malie** (inventaire + `live.sqlite`) + **epoch probe** (buckets datés) — plus de dig `config-cache` ; meta store sous `logs/apk-store-meta.json`.
- Hors Sync : `uploads/`, `liveOwned.json` (PTCS), pipelines non-catalogue (icollect / LaunchBox…).

## Croissance & découverte (contrat, code plus tard)

- **Croissance** : sync détecte nouveau contenu upstream → insert dans **la même** base.
- **Découverte** (barcode hors TCG) : confirm → promote corpus — backlog, pas silo parallèle.

## Face choice

Priorités source (`faceChoice`) = **provider only**. Core reste agnostique pour les étagères classiques.
