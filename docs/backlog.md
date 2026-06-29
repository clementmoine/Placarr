# Backlog

> Dernière vérification : **2026-06-29** (`pnpm exec vitest run` **1198** OK / 25 skipped,
> `pnpm providers:audit:mapping`, `pnpm providers:health`).

## État actuel (snapshot)

| Métrique | Valeur |
| -------- | ------ |
| Providers audités | 41 |
| Mapping `ok` | 38 · `empty` 3 · `error` 0 |
| Observations `enabled` | **36** · `legacy` 0 · `unknown` 5 |
| Health-check | 32 modules · **0 down** |
| Tests | **1198** passent (1223 total, 25 skipped) |
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
| **P2** | Cluster confidence `sourceScore` + tier observations | **Bloqué** | Ajouter `barcodeClusterObservationContribution` (tier × scale + `barcodeEvidenceObservationSourceWeight`) dans `scoreEvidenceCluster` ; **recalibrer** les 6 valeurs figées dans `compile.confidenceLock.test.ts` (essai `observationTierScale: 0.01` → +0.06–0.08 sur Ghost Recon / TMNT, revert 2026-06-29). Voir `scoring.ts` § cluster confidence. |
| **P2** | `pickPlatformKey` tier-dominant | **Reporté** | `barcodeEvidenceObservationSupportWeight` fait gagner le canonique sur marketplace à poids gonflé, mais casse le lock « plateforme ambiguë → null » (Ghost Recon Classics). Garder l’échelle legacy pour l’agrégation plateforme. |
| **P5** | Fixtures golden-master barcode (`tests/fixtures/barcode/`) | **0/22** | `RECORD=1` (5 cas) lancé 2026-06-29 : **5/5 timeout** à 300s/cas (pipeline multi-providers lent). **Mitigations 2026-06-29** : SS timeout 15s + retry foreground, health via `jeuRecherche`, `RECORD_TIMEOUT_MS` 600s. Relancer `pnpm test:record` quand réseau OK. |
| **P2** | Titres multilingues + région utilisateur | **Ouvert** | Brancher `LOCALE_REGION_ORDER` sur préférence utilisateur ([§ D](#d-display-language-region-order)). |
| **P4** | Wikidata / Google Books champs ciblés | **Ouvert** | P136/P178/P123/P856 ; repasser mapping Google Books si régression audit. |

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
