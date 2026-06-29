# Backlog

> Dernière vérification : **2026-06-29** (`pnpm exec vitest run` **1265** OK / 25 skipped,
> `pnpm providers:audit:mapping`, `pnpm providers:health`).

## État actuel (snapshot)

| Métrique | Valeur |
| -------- | ------ |
| Providers audités | 41 |
| Mapping `ok` | 38 · `empty` 3 · `error` 0 |
| Observations `enabled` | **36** · `legacy` 0 · `unknown` 5 |
| Health-check | 32 modules · **0 down** |
| Tests | **1265** passent (1290 total, 25 skipped) |
| Corpus barcode régression | **22** cas (jeux + livre + musique + film + JdS dont Mille Sabords) |

**Queue migration metadata** (adapter + `observationMode = unknown`) :

1. ~~`picclick` — probe listing souvent `empty` (timeout scrape)~~ **hint `blocked` + retry** (`runMappingProbe`)
2. ~~`screenscraper` — probe `empty` si quota API dépassé~~ **hint `blocked` quota/credentials** (`runMappingProbe`)
3. ~~`thegamesdb` — probe `error` sans `THEGAMESDB_API_KEY` ou quota dépassé~~ **hint `blocked` clé/quota** (`runMappingProbe`)
4. `apriloshop` — ~~search vide~~ **IQIT OK** (`searchStrategy: iqit`, probe live `rendered_products` + `product-miniature`)

**Hors scope adapter metadata** (probe custom seulement — normal) :
`freakxy`, `ledenicheur`, `scandex`

**Providers avec adapter + observations** : inclut désormais `chasseauxlivres`
(`obs:enabled`, probe listing souvent `empty` côté scrape), `bedetheque`, `booknode`,
tous les PrestaShop/Shopify, etc.

Commandes utiles :

```bash
pnpm providers:audit:mapping   # mapping + observation mode
pnpm providers:health          # health-check rapide
pnpm providers:runtime         # smoke fetch par provider
pnpm providers:live-audit      # audit live comparateurs
pnpm providers:boardgame-live  # smoke jeux de société
pnpm backfill:slugs            # slugs items (volumes sans zéros dans l'URL)
```

---

## Roadmap (prochaines étapes)

Items **déjà tentés** ou **bloqués** — à ne pas perdre entre les sessions.

| Priorité | Item | État | Prochaine action |
| -------- | ---- | ---- | ---------------- |
| ~~**P2**~~ | ~~Cluster confidence `sourceScore` + tier observations~~ | **Fait 2026-06-29** | `barcodeClusterObservationContribution` (= `barcodeEvidenceTier × CLUSTER_CONFIDENCE.observationTierScale` + `barcodeEvidenceObservationSourceWeight`) branché dans le base score de `scoreEvidenceCluster` ; `observationTierScale: 0.01`. Leaders/platformKeys **inchangés**, seules les 6 valeurs `compile.confidenceLock.test.ts` montent (+0.06 sur cas ancrés : Ghost Recon 0.55→0.61 / 0.45→0.53 / 0.47→0.53, TMNT II Arcade 0.51→0.57 ; deux cas plafond 0.98 stables). Suite complète verte (1217). Cap `listingOnlyCap` intact (clusters listing-only restent ≤ 0.45). |
| **P2** | `pickPlatformKey` tier-dominant | **Reporté** | `barcodeEvidenceObservationSupportWeight` fait gagner le canonique sur marketplace à poids gonflé, mais casse le lock « plateforme ambiguë → null » (Ghost Recon Classics). Garder l’échelle legacy pour l’agrégation plateforme. |
| **P5** | Fixtures golden-master barcode (`tests/fixtures/barcode/`) | **0/22 — bloqué env** | Slim RECORD saute les `slowScanScrape` (PicClick seul désormais) + enrich PC/SS. **Constat 2026-06-29** : batch lookups OK en ~2.3 s, mais `resolveBarcode` reste `null` (pas d’ancre canonique sans enrich SS/PC complet) **et** le test hang jusqu’au timeout (900s) sur une promesse orpheline (`buildBarcodeTasks` crée le fetch avant filtrage). Avant de réessayer : (a) couper l’ancre canonique sur le hit barcode PriceCharting en slim, ou (b) ne pas *construire* les tâches `slowScanScrape` (skip avant `buildBarcodeTasks`, pas après). Puis `pnpm test:record` / `test:record:all`. |
| **P3** | PicClick → eBay Browse API | **Provider créé — à clés** | **Investigation 2026-06-29** : PicClick résout vers une IP AWS us-west (`54.176.32.72`), TCP connect *hang* (`http=000`) → chaque scan paie le timeout 6 s puis `[]` ; le TOS PicClick **interdit le scraping**. **Fait 2026-06-29** : module `src/services/providers/ebay/` (Browse API officielle, OAuth `client_credentials`, recherche `gtin`, prix new/used par condition, cover via `i.ebayimg.com`). Sans clés → no-op gracieux. **Reste** : compte eBay Developers Program **en attente d'approbation** (≥ 1 jour ouvré, demandé 2026-06-29). À réception : fixer `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` (+ `EBAY_MARKETPLACE_ID`, défaut `EBAY_FR`), valider en live (`pnpm providers:audit:mapping` + scan réel), puis **déprécier PicClick** (retirer le module + slot payload + `slowScanScrape`). |
| **P2** | Titres multilingues + région utilisateur | **Ouvert** | Brancher `LOCALE_REGION_ORDER` sur préférence utilisateur ([§ D](#d-display-language-region-order)). |
| **P4** | Wikidata / Google Books champs ciblés | **Ouvert** | P136/P178/P123/P856 ; repasser mapping Google Books si régression audit. |
| ~~**P1**~~ | ~~Golden-master « vide honnête »~~ | **Fait 2026-06-29** | `compile.honestEmpty.test.ts` : marketplace-only sans ancre + DB miss (`confrontWithDatabase` mocké `null`) ⇒ `compileResultForType` renvoie `null`, même sur consensus de 3 marketplaces (majority noise). Encode la moitié manquante de la règle produit (l'autre moitié = `confidenceLock`). |

**Séries & franchises 2026-06-29** (display / recherche / regroupement) :

Deux concepts **distincts**, sourcés différemment :

- **Série** = ordinal serré, *dérivable du titre + consensus* (≥ 2 frères même base + volumes distincts).
- **Franchise** = regroupement large type-agnostique, *jamais deviné du titre* → **observation provider** uniquement.

| Priorité | Item | État | Détail / prochaine action |
| -------- | ---- | ---- | ------------------------- |
| ~~**P2**~~ | ~~Padding dynamique des volumes (affichage)~~ | **Fait 2026-06-29** | `src/lib/title/series.ts` (`seriesDisplayTitles`, gate `MIN_SERIES_VOLUMES = 2`) câblé dans `formatShelfWithItemPrices` (route shelves) : numéros alignés sur le volume le plus large de la série (`01…10` → `001…100`), aligné-au-plus-large sans plancher. Projection **affichage** : slugs/navigation dépaddent (`slugifyItemName`), rien de stocké. `Mighty No. 9` (numéro = nom propre, pas de frère) reste intact. Tests : `series.test.ts` (stress Final Fantasy), `route.test.ts`. |
| ~~**P2**~~ | ~~Recherche indifférente au marqueur/padding~~ | **Fait 2026-06-29** | `stripVolumeMarkersKeepingNumber` (`volumeNumber.ts`) + variantes de padding numérique dans `buildTokenVariants` : `n° / # / vol. / Volume / Tome / Numéro` et `1 / 01 / 001` interchangeables, côté serveur (`buildItemSearchConditions`) **et** client (`itemMatchesSearchQuery`). Accents/casse préservés (pas de régression). Tests : `search.test.ts`, `volumeNumber.test.ts`. |
| ~~**P3**~~ | ~~Franchise = fact typé, sourcé provider~~ | **Fait 2026-06-29** | `buildFranchiseFact` (`src/lib/metadata/facts/franchiseFact.ts`, `kind: "franchise"` stable, `label` localisable plus tard ; **pas** « collection » = réservé à la bibliothèque utilisateur). Sourcé IGDB (`collections`/`franchise`/`franchises`) + TMDB (`belongs_to_collection`). Rendu avec icône/teinte dédiées sur la page détail. Tests : `franchiseFact.test.ts`. |
| **P4** | Franchise — autres sources | **Ouvert** | Étendre `buildFranchiseFact` à Wikidata (P179 *part of the series*), Google Books (`series`), BGG (`family`). Réutiliser le même `kind`. |
| **P4** | Découverte « autres volumes / plus de cette franchise » | **Ouvert (UI)** | Briques prêtes : `seriesSiblings` (même gate consensus) côté série, fact `franchise` côté franchise. Manque la **surface UI** sur la page détail (`[shelfId]/[itemId]`) : requêter les frères (même shelf, même base série / même valeur de fact franchise) + grilles « Autres tomes » / « Plus de cette franchise ». |

**Audit principes 2026-06-29** (`go` autopilot) — constats restants à traiter :

| Priorité | Item | État | Prochaine action |
| -------- | ---- | ---- | ---------------- |
| **P2** | Dé-biaiser le merge d'enrichissement | **Ouvert** | Dernier biais provider : `merge.ts` `resultsByWeight` trie par `PROVIDER_METADATA_EXTENSIONS.weight`. Le path barcode est neutre ; remplacer le tri par poids par observation/consensus (le pick de titre passe déjà par `pickBestMetadataObservationTitle` d'abord). |
| **P3** | Rétention des observations rejetées (barcode) | **Ouvert** | `compile.ts` jette lots/bruit/non-match **avant** de construire le blob `observations` (≠ « never throw observations away »). Émettre ces lignes en observations `evidence: "reject"` + `retainForReprojection: true` (le path enrichissement le fait déjà). |
| **P3** | Décision cap canonique seul / DB-fallback | **Ouvert** | Un canonique seul (ou DB-fallback synthétique) ancre le cluster ⇒ pas de `listingOnlyCap`, peut atteindre 0.98 sans corroboration. Soit documenter comme acceptable (un barcode→canonique est une ancre légitime), soit ajouter un cap « source unique non corroborée » + test. |

> **Provider-blindness : migration TERMINÉE** — allowlist du guard `blindnessGuard.test.ts` **vide** (0 littéral provider hors `services/providers/`). Docs `hardcoding_audit.md` / `provider_agnostic_architecture.md` / `unbiased_ranking.md` rebannerisées (tableaux = historique).

**P1 providers / probes** : file migration metadata **vide** (PicClick, ScreenScraper, TheGamesDB, Apriloshop IQIT — tous faits 2026-06-29).

---

Règles persistantes dans `.cursor/rules/` :

- `placarr-principles.mdc` — providers plug-and-play, **aucun hardcode**, data-first, KISS
- `placarr-testing.mdc` — **TDD / zéro régression**, guards, quand lancer `pnpm test`

---

## Priorités ouvertes (ordre suggéré)

### P1 — Providers / scrape

| Item | Action | Doc |
| ---- | ------ | --- |
| ~~**Apriloshop IQIT**~~ | **fait** — `searchStrategy: iqit`, parse `product-miniature`, `id_product` extrait | `prestashop/parse.ts` |
| ~~**Chasse aux Livres probe `empty`**~~ | **fait** — fallback FlareSolverr + hint probe | `chasseauxlivres/fetch.ts` |
| ~~**PicClick probe timeout**~~ | **fait** — retry probe + `blocked` sur timeout scrape | `picclick/index.ts` |
| ~~**ScreenScraper probe quota**~~ | **fait** — `blocked` si quota/credentials ; timeout 15s + retry search ; health via `jeuRecherche` | `screenscraper/` |
| ~~**TheGamesDB audit**~~ | **fait** — `blocked` clé absente ou quota + `mappingProbeConfigHint` | `thegamesdb/index.ts` |

### P2 — Ranking sans biais (gros chantier)

Voir [unbiased_ranking.md](unbiased_ranking.md) et [word_list_audit.md](word_list_audit.md).

1. Modèle d'observations complet (déjà amorcé — généraliser ranking images + facts)
2. Migrer le **chemin barcode** (`compile.ts`) vers observations — **partiel** : observations persistées + `selectConsensusTitle` ; `pickPlatformKeyFromEvidence` + ranks titre/image via `barcodeEvidenceObservationSourceWeight` (échelle legacy ~0.05–0.45). **Reste** : cluster `sourceScore` + tier (voir [Roadmap](#roadmap-prochaines-étapes)).
3. Dé-bias attachment : `isRealBoxCoverSource` via flags stampés server-side — **fait** ; spec historique dans [debias_attachment_display_score.md](debias_attachment_display_score.md)
4. Titres multilingues + ordre région = préférence utilisateur ([§ D](#d-display-language-region-order))

### P3 — Provider-blind core

Guard : `src/services/providerBlindnessGuard.test.ts` — **allowlist vide** (`src/` + `scripts/`, 2026-06-27).

Prochaines cibles optionnelles :

- P1 ~~**Apriloshop IQIT**~~ — fait
- P2 barcode observations (`compile.ts`) — cluster confidence `sourceScore` + tier ([Roadmap](#roadmap-prochaines-étapes))

### P4 — Exploitation champs provider

| Provider | unused | Piste |
| -------- | ------ | ----- |
| wikidata | ~72 | Variantes langue = bruit ; cibler P136/P178/P123/P856 |
| googlebooks | 9 | Repasser mapping (régression audit ?) |
| rawg | 8 | `clip` gameplay ; reste bruit |

Ne pas chasser le compte `unused` brut — voir note audit 2026-06-23 dans l'historique.

### P5 — Qualité / tests

- ~~**Corpus barcode multi-types**~~ — **fait** : livre `9780140328721`, musique `0724384960650`, film `7321906123457`, JdS `3558380126133` + `3421272109517` (Mille Sabords, scan sans type)
- **Fixtures replay** (`resolver.fresh.test.ts`) — **0/22 enregistrées** ; cas définis, REPLAY skip sans fichier. Voir [Roadmap](#roadmap-prochaines-étapes) (tentative RECORD 2026-06-29, timeouts réseau).
- ~~**Pricing manga** — lots/bundles filtrés ; mauvais volume PicClick quand seules annonces hors-sujet~~ **fait** (`priceListingVolumeConflictsWithItem`)

### P6 — Architecture lib (optionnel)

~~Réorganiser `src/lib/` en sous-dossiers thématiques~~ **fait 2026-06-28** (`metadata/`, `item/`, `media/`, `pricing/`, …) — ne pas fusionner `services/providers/*`.

---

## Terminé / vérifié (ne pas rouvrir sans raison)

- **Observation migration metadata** : 36/38 adapters en `enabled` (schema `metadata-observations/v1`)
- **Factory PrestaShop/Shopify** : `scrapeCatalogModuleFactory` partagé
- **Apriloshop** : migré vers config PrestaShop (connecteur bespoke supprimé) — search toujours vide
- **Game lookup timeout** : ScreenScraper / PC gated sans signal plateforme (2026-06-22)
- **`confrontWithDatabase`** : provider-blind via trait `nameDatabase` (2026-06-23)
- **Merge covers** : traits `digitalStorefrontArt` / `canonicalCover` (steam/discogs)
- **`providerRegistry.isProviderConfigured`** : special-cases retirés
- **Multi-sample mapping probe** : `additionalSamples` + union clés (2026-06-23)
- **Provider health** : `pnpm providers:health` + scripts runtime/live documentés (2026-06-27)
- **Ludifolie observations** : sample Mille Sabords ajouté → `obs:enabled` (2026-06-27)
- **Metadata adapters** : `metadataResolvers.ts` supprimé — map unique dans `providerBootstrap.ts` (**fait 2026-06-27**)
- **Game barcode enrich** : `contributeGameBarcodeEnrichment` (**fait 2026-06-27**)
- **Lib/services split** : domain modules `lib/*`, `services/provider|metadata|pricing|barcode` (**fait 2026-06-28**)
- **Pricing card ↔ fiche** : `resolveItemDisplayPrices` / `summarizeShelfItemPrices` unifiés, filtres lots manga, sync cache étagère (**fait 2026-06-28**)
- **Barcode consensus title** : colonne structurée + compile observations (**fait 2026-06-28**)
- **Retailer barcode guards** : Philibert trust EAN confirmé ; PrestaShop exige alignement titre ; couvertures retail filtrées par plateforme/suite (**fait 2026-06-28**)
- **Booknode covers** : téléchargement `/full/` JPEG + préférence merge sur OpenLibrary (**fait 2026-06-28**)
- **Client bundle** : `item/media` ne tire plus la registry providers (`node:sqlite` webpack) (**fait 2026-06-29**)
- **Apriloshop IQIT** : `searchStrategy: iqit` + parse miniatures + `id_product` (**fait 2026-06-29**)
- **Corpus barcode multi-types** : 22 cas dont Mille Sabords scan sans type (**fait 2026-06-29**)
- **Chasse aux Livres FlareSolverr** : fallback scrape + hint probe (**fait 2026-06-29**)
- **Pricing volume mismatch** : rejette agrégats PicClick n°183 sur item n°07 (**fait 2026-06-29**)
- **PicClick / ScreenScraper probes** : hints `blocked` actionnables (timeout, quota, credentials) (**fait 2026-06-29**)
- **TheGamesDB probe quota** : `blocked` si cooldown quota actif (**fait 2026-06-29**)
- **ScreenScraper resilience** : timeout 15s, retry search foreground, health `jeuRecherche` (**fait 2026-06-29**)
- **Barcode platform pick** : `pickPlatformKeyFromEvidence` via `barcodeEvidenceObservationSourceWeight` (**fait 2026-06-29**)

---

## Références détaillées (historique)

Les sections ci-dessous gardent le contexte des décisions. Pour le travail du jour, utiliser **Priorités ouvertes** + **État actuel** ci-dessus.

### Unbiased, data-first field ranking

Date: 2026-06-22 · Design : [unbiased_ranking.md](unbiased_ranking.md)

Proof-of-concept fait : signal type dérivé, Okkazeo, ancre marketplace, ranking titres par observations dans `metadataMerge.ts`.

### Provider migration factory

Boucle : resolver observations → tests contrat → `pnpm providers:audit:mapping` → health → checklist.

Waves A–D : largement couvertes ; ajouts récents `bedetheque`, `booknode` hors liste d'origine.

### Provider-blind core

[provider_agnostic_architecture.md](provider_agnostic_architecture.md) §0 · Guard `providerBlindnessGuard.test.ts`.

### Observation migration & exploitation

Dashboard : `pnpm providers:audit:mapping`.

État 2026-06-27 : voir tableau **État actuel**. Consommation observations : titres en merge ; barcode encore `sourceWeight` legacy.

### Apriloshop

Site sur **IQIT Search** ; AJAX PrestaShop natif renvoie `products: 0`.

**Fait** : config PrestaShop, factory agnostique, `collectRetailerBarcodeHits` générique.

**Reste** : ~~`searchStrategy: iqit`~~ fait ; vérifier index barcode IQIT en prod si résolution EAN échoue encore (enrichissement page produit).

Pas d'autre boutique PrestaShop à migrer (audit plateformes 2026-06-22 : seul apriloshop = PrestaShop+IQIT).

### Open studies

#### A. Two-phase vs decide-late

**Décision : keep decide-late** pour le scan barcode sans type.

#### B. Game-DB fan-out

**Fait 2026-06-22** — `gameLookup.ts` gated.

#### C. confrontWithDatabase echo

**Fait 2026-06-22/23** — `null` on miss ; provider-blind `nameDatabase`.

#### D. Display-language region order

`LOCALE_REGION_ORDER` fr-first → à brancher sur préférence utilisateur (lié unbiased step 4).

#### E. Provider health script

**Fait 2026-06-27** — `pnpm providers:health` dans `package.json`. BGG token lu lazily au `run()`.

#### F. Multi-type barcode regression corpus

**Fait 2026-06-29** — `DEFAULT_BARCODE_REGRESSION_CASES` couvre jeux (Wii/Xbox), livre, musique, film, JdS (Catan + Mille Sabords sans type). Voir `TESTING.md` pour `RECORD=1` / `RECORD_ALL=1`.

**Reste** : fixtures HTTP replay (`tests/fixtures/barcode/*.json`) — aucune enregistrée au 2026-06-29 ; première passe `RECORD=1` (5 cas) a expiré à 300s/cas (ScreenScraper/PicClick lents). Prérequis documentés dans [Roadmap](#roadmap-prochaines-étapes).

#### I. Cluster confidence calibration (barcode P2)

**Ouvert 2026-06-29** — `scoreEvidenceCluster` somme encore `barcodeEvidenceObservationSourceWeight` (~0.05–0.45/row). Introduire une contribution tier-aware (`barcodeClusterObservationContribution` ou `observationTierScale` dans `CLUSTER_CONFIDENCE`) impose de **mettre à jour** `compile.confidenceLock.test.ts` en même commit (6 locks Ghost Recon / de Blob / TMNT). Ne pas shipper sans recalibration : un essai à `0.01`/tier a déplacé les confidences de +0.06 à +0.08.

#### G. Observation contract TypeScript

Amorcé : `MetadataObservation`, Okkazeo premier émetteur ; généralisé depuis à la plupart des adapters.

#### H. Video-game platform catalog DRY

**Fait** — `videoGamePlatformSources.ts` + `videoGamePlatforms.ts`, pas d'appel live au scan.

### LaunchBox

Garder seulement si index local prébuild ; pas de download/extract au scan. Décision remove si pas assez rapide — [à mesurer].

---

## Liens

- [provider_integration_checklist.md](provider_integration_checklist.md)
- [provider_agnostic_architecture.md](provider_agnostic_architecture.md)
- [barcode_consensus_refactor.md](barcode_consensus_refactor.md)
- [hardcoding_audit.md](hardcoding_audit.md)
