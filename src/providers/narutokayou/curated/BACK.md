# Naruto Kayou — verso sleeves

Kayou expose `backImage` par carte sur [kayouofficial.com](https://www.kayouofficial.com/). Placarr installe :

1. **Dos par rareté** (`cards/back.<tier>.webp`) quand toutes les cartes d’un tier partagent le même verso dans une série.
2. **Dos par carte** (`cards/official/<idCode>.webp`) quand un tier a plusieurs versos distincts dans la même série — comme les Leaders éveillés DBSCG.

## Séries Naruto moissonnées

6 séries sous l’IP `ip-rtqgm0xa` sur [ip-collections](https://www.kayouofficial.com/en-US/ip-collections), dont :

| Series id | Exemples |
| --------- | -------- |
| `series-ldbindyv` | `NRI01-AR-006L4` — AR/UR/SSR/SR **per-card** |
| `series-8idoe481` | `NREA02-UR-015L3` — Earth Scroll S2, UR **per-card** ; `NREA02-UR-001L3` est **◇UR** (tier partagé) |
| `series-0nyket49` | Ninja Age — tiers partagés sauf SP/PTR |

D’autres `series-*` sur le site (ex. `series-fcfjnssw` « Roaming Edition ») appartiennent à **d’autres IPs** Kayou, pas Naruto.

## Fichiers

| Pattern curated | Data | URL |
| --------------- | ---- | --- |
| `cards/back.<tier>.png` | `cards/back.<tier>.webp` | `/assets/naruto/kayou/cards/back.<tier>.webp` |
| `cards/official/<slug>.png` | `cards/official/<slug>.webp` | `/assets/naruto/kayou/cards/official/<slug>.webp` |
| `cards/back.png` (alias R) | `cards/back.webp` | tuile « Dos · pack » legacy |

Slug officiel : `NREA02-UR-015L3` → `nrea02-ur-015l3`.

Manifests :

- `sources/kayou-official-tier-backs.json` — vote majoritaire inter-séries
- `sources/kayou-official-card-backs.json` — index idCode + suffixes uniques (`ur-015l3`)

## Branchement cartes

`stampKayouBack()` : lookup manifest officiel (référence / suffixe) → sinon tier `back.<rareté>.webp`.

Les sets `NREA02` / `NRI01` ne sont pas encore dans le checklist narutocards.ca — les dos sont moissonnés et prêts ; le flip s’activera quand les prints entreront au catalogue avec la bonne `reference` (ex. `NREA02-UR-015L3`).

## Moisson

Catalogue Sync :

1. **`runKayouOfficialCatalogCrawl()`** — index IP → chaque page série (SKU) → `sources/kayou-official-catalog.json` (hash pour détecter les màj).
2. **`harvestKayouOfficialTierBacks()`** — lit le manifest catalogue puis installe les PNG dos (tier + per-card).
3. **`installKayouOfficialCardBacks()`** — WebP pack.

Flags : `--skip-official` (crawl seulement), `--skip-backs`, `--force`.

### Manifest catalogue

`kayou-official-catalog.json` contient par série : section, SKU (`model`, `productName`), URL, et pour chaque carte `idCode`, nom, rareté, `frontImage`, `backImage`, dimensions.

Prochaine étape : fusionner ce manifest avec le checklist narutocards.ca (official = autorité idCode / rareté ; narutocards = couverture historique).

### Scellés (Catalogue → Scellés)

`seedProducts` → `ingestKayouOfficialSealedProducts()` : une ligne par **Model** kayouofficial (`NR-KP-…`), packshot `heroBoxImage`, contenu déduit des `Packaging Specs`.

## Limites

- Suffixes ambigus (`ur-015` sans `L3`) non résolus — il faut la ref complète ou le code officiel dans le ledger.
- Sets absents de narutocards.ca : dos en place, pas de tuile face tant que le set n’est pas indexé.
