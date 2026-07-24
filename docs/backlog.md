# Backlog

> Dernière vérification : **2026-07-24** (cleanup docs — base clean avant chantier SSOT identité).
> Index docs : [README.md](README.md).

## Ouverts — base clean (2026-07-24)

Ce qui reste **vraiment** à faire. Le reste du fichier = journal / historique.

| Priorité | Item | Détail |
| -------- | ---- | ------ |
| **P0** | **SSOT identité / covers / liens (accept→purge)** | **Étapes 1–7 faites** (SSOT + god-file splits). Détail : [metadata_engine_audit.md](metadata_engine_audit.md). |
| **P2** | Word-lists → consensus / IDF | Inventaire dans [word_list_audit.md](word_list_audit.md) — long terme. |
| **P3** | Finir découpe god files | Align + residual scindés ; restent gros cohésifs (`pricing/resolver`, `attachmentDisplayScore`) si ROI. |
| **P4** | Optionnel | Table GS1 audio (typage musique) ; mesure perf index LaunchBox local. |

**Ne plus rouvrir sans raison** : blindness allowlist vide, merge dé-biaisé, workers hors Next, URL-first prix + external-links, corpus barcode 21/21, debias covers traits, cluster confidence + platform pick decide-late.

---

## État actuel (snapshot)

| Métrique                  | Valeur                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| Providers audités         | **46**                                                              |
| Mapping `ok`              | **45** · `empty` 1 · `partial` 1 · `blocked` 1 · `error` 0        |
| Observations `enabled`    | **42** · `legacy` 0 · `unknown` 3 (adapter metadata)                |
| Health-check              | **38** modules · **0 down**                                         |
| Tests                     | **1722** passent (1726 total, 4 skipped)                            |
| Corpus barcode régression | **21** cas (jeux + livre + musique + film + JdS dont Mille Sabords) |
| Fixtures replay barcode   | **21/21**                                                           |

**Queue migration metadata** (adapter + `observationMode = unknown`) :

1. ~~`picclick` — probe listing souvent `empty` (timeout scrape)~~ **hint `blocked` + retry** (`runMappingProbe`)
2. ~~`screenscraper` — probe `empty` si quota API dépassé~~ **hint `blocked` quota/credentials** (`runMappingProbe`)
3. ~~`thegamesdb` — probe `error` sans `THEGAMESDB_API_KEY` ou quota dépassé~~ **hint `blocked` clé/quota** (`runMappingProbe`)
4. ~~`chasseauxlivres` — `obs:unknown` / `map:partial`~~ **fait** — metadata adapter + observations (`map:ok`), gate EAN page vs slug `/prix/` interne, hint FlareSolverr
5. ~~`apriloshop`~~ — **retiré** — search PrestaShop 403 côté boutique (non contournable proprement) ; jeux vidéo couverts par Chipweld / Tokyo Game Story / NetGamesRetro

**Hors scope adapter metadata** (probe custom seulement — normal) :
`freakxy`, `ledenicheur`, `scandex`, `smartoys`

**Providers avec adapter + observations** : inclut `chasseauxlivres`
(`obs:enabled`, `map:ok` au audit mapping), `bedetheque`, `booknode`,
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

| Priorité   | Item                                                       | État                | Prochaine action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**P2**~~ | ~~Cluster confidence `sourceScore` + tier observations~~   | **Fait 2026-06-29** | `barcodeClusterObservationContribution` (= `barcodeEvidenceTier × CLUSTER_CONFIDENCE.observationTierScale` + `barcodeEvidenceObservationSourceWeight`) branché dans le base score de `scoreEvidenceCluster` ; `observationTierScale: 0.01`. Leaders/platformKeys **inchangés**, seules les 6 valeurs `compile.confidenceLock.test.ts` montent (+0.06 sur cas ancrés : Ghost Recon 0.55→0.61 / 0.45→0.53 / 0.47→0.53, TMNT II Arcade 0.51→0.57 ; deux cas plafond 0.98 stables). Suite complète verte (1217). Cap `listingOnlyCap` intact (clusters listing-only restent ≤ 0.45). |
| ~~**P2**~~ | ~~`pickPlatformKey` tier-dominant~~                            | **Fait 2026-07-05** | Decide-late en 2 passes (`platformPick.ts`) : pass 1 tier-agnostic (`barcodeEvidencePlatformAmbiguityWeight`) → `null` si scores proches ; pass 2 petit nudge tier (`observationTierScale: 0.05` + bonus canonique `0.22`) seulement si pass 1 tranche. Ghost Recon Classics / Island Thunder / PC consensus verrouillés dans `compile.confidenceLock.test.ts` + `platformPick.test.ts` + `observations.test.ts`. |
| **P5**     | Fixtures golden-master barcode (`tests/fixtures/barcode/`) | **Fait 2026-07-02** | **21/21** enregistrées + REPLAY déterministe (slim, PC 429 retry, iCollect platform guard, HttpReplay brotli).                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **P3**     | PicClick → eBay Browse API                                 | **Fait 2026-07-02** | Module `ebay/` (OAuth, Browse + Catalog API, barcode multi-types) ; PicClick retiré. Sans clés eBay → no-op gracieux.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **P2**     | External-link systématique + refresh prix URL-first          | **Fait 2026-07-05** | À chaque hit provider : `external-link` persisté (merge + write-back prix). Refresh réutilise `providerProductUrlsFromMetadataFacts` avant seek. Gate EAN retailers (Philibert/PrestaShop/Shopify/Okkazeo/CAL). Doc : [provider_external_links.md](provider_external_links.md). |
| **P2**     | Titres multilingues + région utilisateur                   | **Fait 2026-06-30** | `regionOrderForUiLocale` / `languageOrderForUiLocale` dans `preference.ts` ; cookie `preferred-locale` sync client→API ; `withRequestUiLocale` sur routes items/shelves/explore/loans ; couverture read-time via `getCoverImage(item, locale)`.                                                                                                                                                                                                                                                                                                                                  |
| **P4**     | Wikidata / Google Books champs ciblés                      | **Fait 2026-07-02** | Wikidata : P136/P178/P123/P856 mappés (`resolver.ts` + tests). Google Books : champs étendus (`resolver.ts` + tests). Relancer `pnpm providers:audit:mapping` après cooldown quota TheGamesDB.                                                                                                                                                                                                                                                                                                                                                                                   |
| **P4**     | Provider **TricTrac** (`trictrac.net`)                     | **Abandonné 2026-07-05** | Base FR intéressante mais **inaccessible sans auth CNRL** (toutes les routes `/api/*` → `login-silent`). Pas d’API publique, scrape déconseillé. **MyLudo** couvre le besoin metadata FR ; réouvrir seulement si TricTrac/CNRL propose un accès read-only officiel. |
| **P4**     | Provider **MyLudo** (`myludo.fr`)                          | **Fait 2026-07-05 (partiel)** | Module `boardgames` metadata : recherche titre + détail jeu (`fetch.ts`, `resolver.ts`), `external-link`, observations joueurs/durée/âge/note, `trustedRetailer`. **Barcode** : endpoint mobile existant mais résultats incohérents sans session → pas d’ancrage scan fiable ; reste metadata-only. Contact éditeur pour API officielle si besoin EAN. |
| **P4**     | Provider **SensCritique** (`senscritique.com`)             | **Fait 2026-07-19 (multi-types)** | Module `senscritique/` : GraphQL GET `gql.senscritique.com`, `searchResult` + `product(id)`. Apports : note FR + votes, synopsis FR, genres FR, covers `/0/`. `requiresTitleAlignment` + guard catalogue. **Types** : games + books/comics + movies/TV + musics (`SENSCRITIQUE_UNIVERSES_BY_TYPE`). Pas d'EAN — name-search uniquement. `artists` souvent null (skip conscient). |
| **P4**     | Provider **Full Set** (`full-set.net`)                     | **Fait 2026-07-10** | Module `fullset/` : scraping `recherche.php?q=` + fiche item (⚠️ attributs HTML sur lignes séparées). Facts : **cote médiane FR** (kind `price`, « 15,00 € (177 annonces) »), **indice de rareté** (kind `rarity` inédit, « 18/100 »), genre/année/dev/éditeur. Gate plateforme strict (`fullSetHitMatchesPlatform` via `detectPlatformKey` sur le label console — un shelf console n'adopte jamais la cote d'un autre support, plateforme irrésolue = rejet) + gate catégorie « Jeux » + title alignment. ⚠️ **Pas de jaquettes** (correction vs évaluation) : la galerie fiche = photos d'annonces eBay (parfois d'un autre jeu !) et robots.txt interdit `/visuel/` → facts uniquement, aucun attachment (décision consciente). ⚠️ **429 agressif** sur requêtes rapprochées (ban long) → `rateLimited: true` + `mappingProbeRetry: true`. |
| **P4**     | Providers livres / BD-manga FR (nationaux)                 | **Fait 2026-07-17** | File close — ~~Decitre~~ → ~~BD Fugue~~ → ~~Babelio~~ → ~~Planète BD~~ → ~~Vivlio~~ → ~~Izneo~~ → ~~Gibert~~ → ~~Canal BD~~ → ~~Furet~~. ~~Momie~~ / ~~Eurolivre~~ abandonnés (search cassé / 429). Exclus : AbeBooks (déjà), Indigo.ca, Walt’s, Hizuku, ActuaBD, boutiques locales. Détail : [§ Providers livres FR](#providers-livres--bd-manga-fr-2026-07-16). |
| ~~**P1**~~ | ~~Golden-master « vide honnête »~~                         | **Fait 2026-06-29** | `compile.honestEmpty.test.ts` : marketplace-only sans ancre + DB miss (`confrontWithDatabase` mocké `null`) ⇒ `compileResultForType` renvoie `null`, même sur consensus de 3 marketplaces (majority noise). Encode la moitié manquante de la règle produit (l'autre moitié = `confidenceLock`).                                                                                                                                                                                                                                                                                  |

**Séries & franchises 2026-06-29** (display / recherche / regroupement) :

Deux concepts **distincts**, sourcés différemment :

- **Série** = ordinal serré, _dérivable du titre + consensus_ (≥ 2 frères même base + volumes distincts).
- **Franchise** = regroupement large type-agnostique, _jamais deviné du titre_ → **observation provider** uniquement.

| Priorité   | Item                                                        | État                          | Détail / prochaine action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**P2**~~ | ~~Padding dynamique des volumes (affichage)~~               | **Fait 2026-06-29**           | `src/lib/title/series.ts` (`seriesDisplayTitles`, gate `MIN_SERIES_VOLUMES = 2`) câblé dans `formatShelfWithItemPrices` (route shelves) : numéros alignés sur le volume le plus large de la série (`01…10` → `001…100`), aligné-au-plus-large sans plancher. Projection **affichage** : slugs/navigation dépaddent (`slugifyItemName`), rien de stocké. `Mighty No. 9` (numéro = nom propre, pas de frère) reste intact. Tests : `series.test.ts` (stress Final Fantasy), `route.test.ts`.                                    |
| ~~**P2**~~ | ~~Recherche indifférente au marqueur/padding~~              | **Fait 2026-06-29**           | `stripVolumeMarkersKeepingNumber` (`volumeNumber.ts`) + variantes de padding numérique dans `buildTokenVariants` : `n° / # / vol. / Volume / Tome / Numéro` et `1 / 01 / 001` interchangeables, côté serveur (`buildItemSearchConditions`) **et** client (`itemMatchesSearchQuery`). Accents/casse préservés (pas de régression). Tests : `search.test.ts`, `volumeNumber.test.ts`.                                                                                                                                           |
| ~~**P3**~~ | ~~Franchise = fact typé, sourcé provider~~                  | **Fait 2026-06-29**           | `buildFranchiseFact` (`src/lib/metadata/facts/franchiseFact.ts`, `kind: "franchise"` stable, `label` localisable plus tard ; **pas** « collection » = réservé à la bibliothèque utilisateur). Sourcé IGDB (`collections`/`franchise`/`franchises`) + TMDB (`belongs_to_collection`). Rendu avec icône/teinte dédiées sur la page détail. Tests : `franchiseFact.test.ts`.                                                                                                                                                     |
| ~~**P4**~~ | ~~Franchise — autres sources~~                              | **Fait 2026-06-29 (partiel)** | **BGG** : famille préfixée `Game:` (taxonomie BGG propre, ≠ fact « Familles » hétérogène) → `buildFranchiseFact(…, "BGG")`. **Wikidata** : P179 _part of the series_ (réutilise `extractWikidataEntityIds` + `resolveWikidataLabels`) → `buildFranchiseFact(…, "wikidata")`. **Google Books reporté** : l'API n'expose pas le _nom_ de série (`seriesInfo` ne donne que `seriesId` + `bookDisplayNumber`). Tests resolver BGG + Wikidata étendus.                                                                             |
| ~~**P4**~~ | ~~Découverte « autres volumes / plus de cette franchise »~~ | **Fait 2026-06-29**           | Page détail (`[shelfId]/[itemId]`) : deux carrousels au-dessus de « Autres objets ». `seriesVolumes` = `seriesSiblings` sur les items du shelf (gate consensus, `seriesBaseKey` aligne noms paddés/dépaddés) ; `franchiseItems` = items partageant la même valeur de fact `franchise` (jamais d'heuristique titre). Items dédupliqués (chaque frère dans sa section la plus spécifique ; `otherItems` exclut les deux). Helper `RelatedItemsRow` (anti copier-coller). i18n `items.otherVolumes` / `items.moreFromFranchise`. |

**Audit principes 2026-06-29** (`go` autopilot) — constats restants à traiter :

| Priorité | Item                                          | État                | Prochaine action                                                                                                                                                                                                                                |
| -------- | --------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2**   | Dé-biaiser le merge d'enrichissement          | **Fait 2026-06-30** | `merge.ts` : `orderResultsByObservationStrength` remplace le tri `PROVIDER_METADATA_EXTENSIONS.weight` ; tie-break `pickBestRegionalTitle` via `scoreMetadataDisplayTitle` quand les rangs région sont égaux.                                   |
| **P3**   | Rétention des observations rejetées (barcode) | **Fait 2026-06-30** | `compile.ts` : listings bruit / contexte non-canonique / hors-ancre émis en observations `evidence: "reject"` + `retainForReprojection: true` via `rejectedObservationsFromProductEvidence`.                                                    |
| **P3**   | Décision cap canonique seul / DB-fallback     | **Documenté**       | Un barcode confirmé par une source canonique (ou DB-fallback honnête) est une ancre légitime — le plafond `listingOnlyCap` ne s'applique pas. Comportement voulu, encodé dans `compile.confidenceLock.test.ts` + `compile.honestEmpty.test.ts`. |

> **Provider-blindness : migration TERMINÉE** — allowlist du guard `src/core/catalog/blindnessGuard.test.ts` **vide** (0 littéral provider hors `providers/` ; liste des ids **dérivée du registry**). Docs `hardcoding_audit.md` / `provider_agnostic_architecture.md` / `unbiased_ranking.md` rebannerisées (tableaux = historique).

**P1 providers / probes** : file migration metadata **vide** (PicClick→eBay, ScreenScraper, TheGamesDB, Apriloshop IQIT — faits). **TheGamesDB** : si audit `map:blocked`, quota API épuisé (12–20 min cooldown) — pas une régression code ; probe classée `blocked` sur message quota.

**Couvertures placeholder (2026-07-02)** : `coverPlaceholder.ts` — détection agnostique (entropie pixel + URL) ; filtrée dans `item/media.ts` et `metadata/storage.ts`.

**Hygiène 2026-07-02** (lint réparé + replay déterministe) :

| Priorité   | Item                                                 | État                | Détail / prochaine action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**     | Rejeu barcode : intercepteur partagé                 | **Fait 2026-07-02** | Un cycle apply/dispose `@mswjs/interceptors` par cas rendait le patch suivant silencieusement inopérant : le cas suivant partait sur le **vrai réseau** (fantastic-mr-fox échouait sur un vrai 503 Google). Un seul intercepteur par process, jamais disposé ; requête hors session → 504 déterministe. REPLAY 21 cas ≈ 0,8 s (vs ~110 s).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **P1**     | `pnpm lint` réparé (Next 16)                         | **Fait 2026-07-02** | `next lint` supprimé par Next 16 → `eslint .` + flat config native (`eslint-config-next/*`, plus de FlatCompat). Prettier repassé sur tout le repo ; `pnpm-lock.yaml`, `tests/fixtures` (générées) et `scratch/` exclus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ~~**P3**~~ | ~~`no-explicit-any` sweep~~                          | **Fait 2026-07-02** | Les 129 `any` typés (payloads providers structurellement typés : SSGame, RAWG, TMDB, OMDb, JSON-LD `Record<string, unknown>` ; catches narrowés `instanceof Error` / `isAxiosError` ; nouveaux types `ExploreItem`/`ExplorePublicShelf`/`LoanRequestEntry`). Règle **repassée en `error`**. Au passage : `cardFormat` manquant du select `/api/explore` (aspect des covers silencieusement cassé), lecture morte `payload.item.metadata.id` (RefreshPanel), `ShelfWithItemCount._count` sur-promettait `user`.                                                                                                                                                                                                                                                                                                      |
| ~~**P3**~~ | ~~`no-unused-vars` sweep~~                           | **Fait 2026-07-03** | 69 imports/variables morts purgés (dont fonctions/aliases morts : `pickBestSearchHit`, `readAllTags`, `SuggestionWithPriority`, doublons omdb) ; règle en **`error`** avec conventions standard (`_`-préfixe, rest-siblings). Les 2 `<img>` délibérés (blob/zoom) documentés par disable ciblé. Restent **35 warnings react-hooks** (sweep React Compiler).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ~~**P3**~~ | ~~React Compiler rules sweep~~                       | **Fait 2026-07-03** | 35 warnings `react-hooks` → **0** ; règles au niveau preset (`error`). Patterns appliqués : maps d'icônes statiques inline, `SortIndicator` hissé, resets « adjust state during render » (pages URL-sync, modals, image fit, caméra), tenue de livre en refs (`initializedItemId`…), Embla via `useSyncExternalStore` (dots + canScroll, fuite de listener corrigée au passage), `Date.now` sorti du memo (échéance calculée, temps évalué en effect), `form.watch` → `useWatch`/`getValues` (ItemModal, ShelfModal), deps élargies aux objets inférés. **2 disables documentés** restants : les effects d'orchestration d'ItemModal (fetches posant leur état de chargement en synchrone) — chantier « ItemModal orchestration → react-query ». Smoke UI authentifié : explore/items/shelf/détail 200 sans erreur. |
| ~~**P3**~~ | ~~ItemModal orchestration → react-query~~                | **Fait 2026-07-05** | `useItemModalMetadataMutations` pour preview/suggestions ; init par `sessionKey` (remount logique) — **0 disable `set-state-in-effect`**. |
| ~~**P1**~~ | ~~Double « durée » d'une même source~~               | **Fait 2026-07-03** | IGDB émettait ses durées avec `source: "How Long to Beat"` **codé en dur** (187 h ≠ vrais chiffres HLTB) : attribution corrigée (`IGDB`), arbitrage merge trait-driven (`timeToBeatSource` autoritaire écarte les durées des autres sources — l'ancien filtre par `kind` gardait la mauvaise génération), et **dédup par créneau sémantique** (principal/complétion, priorité max) dans `normalizeMetadataFacts` → les items déjà pollués s'auto-réparent à la lecture (vérifié sur 7 Days to Die : 4 facts → 2). Test : `facts.timeSlots.test.ts`.                                                                                                                                                                                                                                                                 |
| ~~**P1**~~ | ~~Scan : possédé sans code-barres invisible~~        | **Fait 2026-07-03** | `QuickScanModal` ne cherchait l'existant que par `barcodeExact` — la branche « match par titre » était **morte** (le pool ne contenait que des items à code-barres). Second pool par titre résolu (`/api/items?q=` : nom+aliases+titre metadata), fusion des candidats sans code-barres, alignement `isMetadataTitleAligned` (≥0.58) au lieu d'égalité stricte ; « Compléter » pose le code-barres scanné sur l'item existant. Vérifié : « 7 Days to Die » (sans code-barres) remonte sur le scan 711719268369.                                                                                                                                                                                                                                                                                                     |
| ~~**P1**~~ | ~~Serveur injoignable pendant les refreshs massifs~~ | **Fait 2026-07-18** | Next n’exécute plus l’enrichissement : stamp + enqueue `BackgroundWorkJob`, process dédié `pnpm worker` (`scripts/backgroundWorker.ts`, SKIP LOCKED). Compose `worker` (dev + prod). Cancel / orphan guard tiennent compte des jobs DB. Ancienne file in-process (`backgroundWorkQueue`) reste pour I/O CPU local (covers) et icollect. |
| ~~**P2**~~ | ~~Priorité providers dynamique + progressive store~~ | **Fait 2026-07-19** | `providerRuntimeStats` (EMA latence / hit / cover) + cold-start via traits registry (`bookCoverPriority`, `slowScanScrape`…) ; soft timeout par provider ; merge progressif mid-batch quand cover/titre s’améliore. **Pas** d’early-stop ni blacklist. Concurrency worker défaut 4 (`WORKER_CONCURRENCY`). |
| ~~**P1**~~ | ~~Mesure durée jobs (`lockedAt`)~~ | **Fait 2026-07-19** | `completeBackgroundWorkJob` / fail terminal gardent `lockedAt` (clear `lockedBy` seul) → durée locked→finished mesurable. |
| **P1**     | Garde-fou taille fixtures                            | **Fait 2026-07-02** | Une capture de sitemap non tronquée (362 Mo) dans un commit local bloquait le push (limite GitHub 100 Mo). Historique local **non publié** réécrit (blob purgé, arbre final identique), poussé en fast-forward ; `tests/fixtureSize.test.ts` verrouille < 25 Mo par fixture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **P1**     | Persistance données Docker                           | **Fait 2026-07-02** | Les uploads (`/app/public/uploads`) n'étaient montés sur aucun volume → perdus à chaque recréation du conteneur. Volumes nommés `placarr-uploads` + `placarr-cache` (index SQLite providers) ; `outputFileTracingExcludes` sort uploads/.cache du standalone (cause de l'ENOSPC) ; `.dockerignore` exclut données runtime **et `.env`** (secrets hors layers). Migration : `docker cp` des uploads existants avant recréation.                                                                                                                                                                                                                                                                                                                                                                                      |

**Audit principes 2026-07-02** (revue complète du core vs `.cursor/rules/placarr-principles.mdc`) — conformes : blindness guard allowlist vide, merge d'enrichissement dé-biaisé (`orderResultsByObservationStrength`), `selectConsensusTitle` câblé dans `compile.ts`, dédup région garde la meilleure région (2 sites), édition préservée (v40), honest-empty encodé. Écarts restants :

| Priorité   | Item                                            | État                 | Détail / prochaine action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**P2**~~ | ~~`tokenEquivalents.ts` par-produit~~           | **Fait 2026-07-02**  | Entrées par-produit supprimées ; listes réduites au dictionnaire (couleurs, `legende/legend`…). Orthographe structurelle (`normalizeEquivalentToken` : accents + consonnes doublées) ; variante sans-accents générique dans `searchVariants`. **Alignement data-driven** : `metadataTitleMatchScore` crédite tous les noms déclarés par le provider (titre + aliases + regionalTitles) — c'était le trou que la map compensait. Tests ré-encodés (Destiny via regionalTitles, honest non-match sans données). Cache **v41**. |
| ~~**P2**~~ | ~~Boosts FR résiduels `title/displayScore.ts`~~ | **Fait 2026-07-02**  | `titleLanguagePreference()` dans le module locale pilote tous les boosts depuis `languageOrder` (défaut config, locale UI au read-time via `pickBestRegionalTitle`). Plus aucun littéral de langue dans le scorer (y c. `localeCompare`, gate CJK par script, `orderFallbackNamesForLocale` qui re-hardcodait fr). Arithmétique par défaut inchangée (déterminisme barcode/storage) ; tests encodent l'inversion en locale en.                                                                                               |
| ~~**P4**~~ | ~~`ProviderInfo.weight` résiduel~~              | **Fait 2026-07-02**  | Knob **supprimé** (champ + ~34 entrées d'extensions). Iso-comportement vérifié : books n'était pas un tie (openlibrary 0.85 + canonical + première au registry — les 3 règles concordent). `nameDatabaseProviderForType` trie par `canonical`, sélections épinglées (`nameDatabaseProvider.test.ts`) ; `primaryGameCoverSource` = premier `canonical && isRealBoxCover` (ScreenScraper).                                                                                                                                     |
| ~~**P4**~~ | ~~Bump cache non fait (calibration 06-29/30)~~  | **Réglé 2026-07-02** | Le dé-hardcodage de l'équivalence de titres a déclenché le bump **v41** — couvre aussi la calibration 06-29/30 restée sans bump.                                                                                                                                                                                                                                                                                                                                                                                             |
| ~~**P3**~~ | ~~`ItemWithMetadata.metadata` type ≠ runtime~~  | **Fait 2026-07-02**  | Retypé en `MetadataResult` \| `null` (= ce que l'API sert via `presentItemFromStorage`) ; narrow `presentedMetadata` supprimé ; `AssociationModal` (mort, lisait des champs non exposés au client) retiré. tsc/build/tests verts sans autre retouche.                                                                                                                                                                                                                                                                        |

---

Règles persistantes dans `.cursor/rules/` :

- `placarr-principles.mdc` — providers plug-and-play, **aucun hardcode**, data-first, KISS
- `placarr-testing.mdc` — **TDD / zéro régression**, guards, quand lancer `pnpm test`

---

## Priorités ouvertes (ordre suggéré)

> **2026-07-24** — la file active est en tête du fichier
> ([§ Ouverts](#ouverts--base-clean-2026-07-24)). Les tableaux ci-dessous sont
> surtout **historique** (beaucoup de ~~Fait~~) ; ne pas les traiter comme TODO.

### P1 — Match prix / metadata (qualité continue)

| Item | État | Détail |
| ---- | ---- | ------ |
| **PriceCharting MatchContext** (aliases + stem + accept) | **Fait 2026-07-19** | Sac titres partagé ; stems franchise génériques (`lookupTitles`) ; accept `allowFranchiseStem` après hit search (sous-titre régional FR/EN vs titre court PC) ; filtre guides ; cas Spider-Man 2 FR, Baten Kaitos, Pokémon Yellow. |
| **RAWG plateforme shelf + facts** | **Fait 2026-07-19** | `pickRawgSearchMatch` refuse Web-only ; sanitize plateformes (drop Web si consoles), stores (drop itch.io sur cartouche), tags fangame/GameMaker sur étagère console. |
| **PriceCharting PAL sans cote → NTSC** | **Fait 2026-07-19** | Pages `pal-atari-2600/…` souvent à `-` ; si `isPal` et table vide, retry NTSC (Millipede, Jr Pac-Man, Galaxian, Joust, Football…). |
| **PriceCharting productName / URL** | **Fait 2026-07-19** | Offres PC stampent le titre fiche ; à la lecture, `sourceUrl` → titre (slug) pour filtrer une mauvaise page (ex. FIFA 2002 → `…/fifa-2002-road-to-fifa-world-cup`). |
| **Loose sans cote cartouche** | **Fait 2026-07-19** | Match Atari (n° console) ; faux amis FIFA World Cup / Bond ; « Loose » dans le titre → bucket loose ; CIB en ~estimate si pas de loose observé. |
| ~~ChocoBonPlan / retailers titre faible~~ | **Fait 2026-07-19** | `listingLooksLikeMerchAccessory` étendu (coque/ipod + kits `lego`/`playmobil`/`funko`/`nendoroid`) ; gate dans `isMetadataTitleAligned`, attachments, et `priceListingSharesItemIdentity`. LEGO Minecraft ne matche plus un item « Minecraft » (seuil Choco 0.42 inclus) ; un vrai set LEGO shelf reste accepté. |

### P1 — Providers / scrape

| Item                                    | Action                                                                                             | Doc                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| ~~**Apriloshop IQIT**~~                 | **fait** — `searchStrategy: iqit`, parse `product-miniature`, `id_product` extrait                 | `prestashop/parse.ts`      |
| ~~**Chasse aux Livres probe `empty`**~~ | **fait** — fallback FlareSolverr + hint probe                                                      | `chasseauxlivres/fetch.ts` |
| ~~**PicClick probe timeout**~~          | **fait** — retry probe + `blocked` sur timeout scrape                                              | `picclick/index.ts`        |
| ~~**ScreenScraper probe quota**~~       | **fait** — `blocked` si quota/credentials ; timeout 15s + retry search ; health via `jeuRecherche` | `screenscraper/`           |
| ~~**TheGamesDB audit**~~                | **fait** — `blocked` clé absente ou quota + `mappingProbeConfigHint`                               | `thegamesdb/index.ts`      |
| ~~**Chasse aux Livres probe `partial`**~~ | **fait** — metadata adapter `map:ok`, observations typées ; gate EAN page vs slug interne ; hint FlareSolverr | `chasseauxlivres/`         |
| ~~**Apriloshop**~~                        | **retiré** — search/controller 403 côté boutique ; stack IQIT couverte par Chipweld | —                          |

### Providers livres / BD-manga FR (2026-07-16)

Critère : **catalogue national / large**, pas une boutique de quartier. Déjà en place : Booknode, Bedetheque, BDovore, BDphile, Chasse aux livres, Google Books, OpenLibrary, AbeBooks.

| Ordre | Provider | Site | Rôle attendu | État |
| ----- | -------- | ---- | ------------ | ---- |
| 1 | **Decitre** | `decitre.fr` | Retailer national — ISBN → résumé, auteurs, éditeur, pages, couverture, prix | **Fait 2026-07-16** — module `decitre/` (JSON-LD Book + attributs, FlareSolverr) |
| 2 | **BD Fugue** | `bdfugue.com` | Spécialiste BD/manga national — ISBN, stock, prix | **Fait 2026-07-16** — module `bdfugue/` (Magento JSON-LD + attributs, FlareSolverr) |
| 3 | **Babelio** | `babelio.com` | Catalogue social FR — notes, tags, résumé, covers (scrape anti-bot / cookie) | **Fait 2026-07-17** — module `babelio/` (AJAX `/aj_recherche.php` + fiche microdata ; ISBN = evidence only) |
| 4 | **Planète BD** | `planetebd.com` | Critiques / notes BD-manga (pas un stock magasin) | **Fait 2026-07-17** — module `planetebd/` (mot-clef + fiche album) |
| 5 | **Vivlio** | `shop.vivlio.com` | Boutique ebook FR — JSON-LD Product/Book riche (ISBN, auteur, éditeur, série/collection, cover `cdn.vivlio.com`), **sans Cloudflare** sur le shop. ⚠️ Éditions **numériques** : l’ISBN ebook peut différer du print scanné en rayon | **Fait 2026-07-17** — module `vivlio/` (`?search=` + JSON-LD ; ISBN evidence only) |
| 6 | **Izneo** | `izneo.com` | Plateforme BD/manga numérique — titres, séries, covers | **Fait 2026-07-17** — module `izneo/` (API web search/v2 + volumes + album) |
| 7 | **Gibert** | `gibert.com` | Chaîne livres nationale neuf/occasion — ISBN + prix | **Fait 2026-07-17** — module `gibert/` (Magento + FlareSolverr) |
| 8 | **Canal BD** | `canalbd.net` | Portail réseau librairies BD — ISBN BD, série, offres multi-librairies | **Fait 2026-07-17** — module `canalbd/` (recherche + fiche + HTMX offers) |
| 9 | **Furet du Nord** | `furet.com` | Chaîne livres Nord (stack Decitre / di-static) — ISBN + prix | **Fait 2026-07-17** — module `furet/` (`/rechercher/result` + FlareSolverr) |

**Secondaire abandonné** (2026-07-17) :
- **Momie** (`momie.fr`) — BD/manga niche ; recherche serveur cassée (POST `/transformsearch` → homepage) ; slug requis pour `/product/show/{isbn}/{slug}` → pas de découverte ISBN.
- **Eurolivre** (`eurolivre.fr`) — méta-recherche ISBN qui chevauche CAL/AbeBooks ; **HTTP 429** dès la première fiche, payload vide.

**Exclus** : librairies locales (Comptoir du rêve, Garganmots, Mouette à la page, Carnet à spirales, Tours & Détours, Gérard…), Hizuku (Réunion), Walt’s Comic Shop (US), Indigo.ca, ActuaBD (média), AbeBooks (déjà intégré).

Chaque entrée = module `providers/<id>/` + registry + tests + `pnpm providers:audit:mapping` (checklist [provider_integration_checklist.md](provider_integration_checklist.md)).

### P2 — Ranking sans biais (gros chantier)

Voir [unbiased_ranking.md](unbiased_ranking.md) et [word_list_audit.md](word_list_audit.md).

1. Modèle d'observations complet (déjà amorcé — généraliser ranking images + facts)
2. Migrer le **chemin barcode** (`compile.ts`) vers observations — **fait** (2026-07-05) : observations persistées + `selectConsensusTitle` ; ranks titre/image ; cluster `sourceScore` + tier (`observationTierScale: 0.01`) ; platform pick decide-late 2 passes (tier nudge pass 2 only).
3. Dé-bias attachment : `isRealBoxCoverSource` via flags stampés server-side — **fait** ; spec historique dans [debias_attachment_display_score.md](debias_attachment_display_score.md)
4. Titres multilingues + ordre région = préférence utilisateur — **fait 2026-06-30** ([§ D](#d-display-language-region-order))

### P3 — Provider-blind core

Guard : `src/core/catalog/blindnessGuard.test.ts` — **allowlist vide** ; `PROVIDER_TERMS` sync registry (`src/` + `scripts/`).

Prochaines cibles optionnelles :

- P1 ~~**Apriloshop IQIT**~~ — fait
- P2 barcode observations (`compile.ts`) — cluster confidence `sourceScore` + tier ([Roadmap](#roadmap-prochaines-étapes))

### P4 — Exploitation champs provider _(clos 2026-07-05 — maintenance opportuniste)_

Champs ciblés livrés (Wikidata, Google Books, RAWG clips, MyLudo). Ne pas chasser le compte `unused` brut.

| Provider    | unused | Piste                                                 |
| ----------- | ------ | ----------------------------------------------------- |
| wikidata    | ~11    | Champs ciblés **faits** ; reste = variantes langue (bruit) |
| googlebooks | 9      | Repasser mapping si régression suspectée (optionnel)  |
| rawg        | ~7     | ~~`clip` gameplay~~ **fait 2026-07-05** ; reste bruit |

**Providers communautaires FR** :

| Provider     | Type visé                                        | Statut                                                                                                          |
| ------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| trictrac     | metadata FR (rating, EAN, avis)                  | **Abandonné** — auth CNRL obligatoire ; MyLudo suffit pour metadata FR                                          |
| myludo       | metadata FR (+ barcode si API OK)                | **Fait partiel** — module metadata titre ; barcode non fiable sans session API                                  |
| senscritique | metadata FR multi-types (note, titre FR, synopsis) | **Fait 2026-07-19** — games + books + movies + musics |
| full-set     | rareté + cote médiane FR (jeux rétro)              | **Fait 2026-07-10** — facts only (pas de jaquette exploitable), rate-limited (voir Roadmap)      |

Ne pas chasser le compte `unused` brut — voir note audit 2026-06-23 dans l'historique.

#### P2-audit — Couplage nommage locale _(fait 2026-07-05)_

- `BGG_LANGUAGE_ROLE_MAP` / `mapBggLanguageToAttachmentRole` → `LANGUAGE_NAME_TO_ATTACHMENT_ROLE` / `mapLanguageNameToAttachmentRole` (`preference.ts`) — logique générique langue → rôle attachment, plus de nom provider dans le core.

### P5 — Qualité / tests

- ~~**Corpus barcode multi-types**~~ — **fait** : livre `9780140328721`, musique `0724384960650`, film `7321906123457`, JdS `3558380126133` + `3421272109517` (Mille Sabords, scan sans type)
- ~~**Fixtures replay** (`resolver.fresh.test.ts`)~~ — **fait 2026-07-02** : **21/21** enregistrées (`pnpm test:record:all`, un process par cas) ; rejeu déterministe via intercepteur partagé (`tests/helpers/httpReplay.ts`).
- ~~**Pricing manga** — lots/bundles filtrés ; mauvais volume PicClick quand seules annonces hors-sujet~~ **fait** (`priceListingVolumeConflictsWithItem`)

### P6 — Architecture core _(fait 2026-07-05)_

Réorganisation **`src/core/`** en 5 piliers (`identify`, `enrich`, `collect`, `commerce`, `catalog`) + coalescing modules couplés. Voir [core_architecture.md](core_architecture.md). Scripts de migration one-shot supprimés.

| Priorité | Item | État | Détail |
| -------- | ---- | ---- | ------ |
| ~~**P3**~~ | ~~Découper `enrich/storage.ts`~~ | **Fait 2026-07-24** | Orchestrateur + leaves media (gallery / cover-hero / item sync) ; re-exports inchangés |
| ~~**P3**~~ | ~~DRY titres identify ↔ enrich~~ | **Fait 2026-07-19 (partiel)** | `normalizeForTokens` → `enrich/titles/normalize.ts` ; matchers volontairement séparés. |
| ~~**P4**~~ | ~~`platformSources.ts` → data file~~ | **Fait 2026-07-19** | Snapshots SS/LB → `platforms/data/*.json`. |
| ~~**P2**~~ | ~~Imports core → `@/providers/icollect/*`~~ | **Fait 2026-07-19** | Traits stampés ; allowlist blindness vide. |

~~Réorganiser `src/lib/` en sous-dossiers thématiques~~ **fait 2026-06-28** puis **big-bang → core** 2026-07-05.

### Audit fonctionnement _(clos 2026-07-05 — maintenance opportuniste)_

Numérotation = celle de [audit_fonctionnement.md](audit_fonctionnement.md) (≠ P1–P6 ci-dessus). Vérif standard pour chaque : `pnpm test` vert + `pnpm build` vert + `pnpm exec eslint <fichiers>`.

#### KISS-1 — Découper `storage.ts` _(fait 2026-07-24 — orchestrateur ~412 L)_

- Extractions historiques (2026-07-04) : `imageAssets` / `imageUrls` / `dbMapping` / `imageDownload`.
- Extractions SSOT (2026-07-24) : `croppedCoverSync`, `attachmentLocalization`, `metadataCoverBootstrap`, puis stages `storeMetadata` → `prepareMetadataGallery` / `resolveMetadataCoverHero` / `syncItemAfterMetadataStore`.
- `storage.ts` reste la façade publique (re-exports) + orchestration persist / evidence / deferred localize.

#### KISS-2 — Alléger `fetch.ts` _(partiel — coalesce 2026-07-05 → ~2300 L dans `enrich/fetch.ts`)_

- **État 2026-07-04** : le constat « 2 couches / import circulaire » a été résolu par une solution **plus simple** que le plan gating+gameStrategy : comme **aucun** helper n'appelle `fetchMetadata`, tous les helpers de gating/shaping (les 28 + le cap concurrence) partent dans **un seul** `services/metadata/metadataFetchGating.ts`, sans cycle. `fetch.ts` ne garde que l'orchestrateur `fetchMetadata`/`fetchMetadataByType` (importe les 21 helpers qu'il utilise ; les 9 autres restent internes au module). Imports orphelins élagués des deux côtés. Comportement inchangé (`63a4a74`). 1555 tests ✅ · build ✅.

#### KISS-3 — Alléger `merge.ts` _(fusionné dans `enrich/fetch.ts` — 2026-07-05)_

- **État 2026-07-04** : le cluster de ranking par observations (meilleur titre/facts/cover depuis les observations typées) + le type `ProviderMetadataInput` partent dans `services/metadata/mergeObservationRanking.ts` (aucun appel retour à `mergeMetadata` → pas de cycle). `merge.ts` importe les 6 symboles utilisés + re-exporte l'ancienne surface publique. Comportement inchangé (`7428e93`). 1555 tests ✅ · build ✅.
- **Reste** : `merge.ts` (455 l.) = `mergeMetadata` orchestrateur + helpers cover/book — cohérent, à laisser.

#### AUDIO-1 — Détection audio GS1 _(résiduel du « trou #1 »)_

- **État 2026-07-05** : préfixes audio heuristiques (`602`, `498`, `45`…) **supprimés** — pas fiables sans table GS1 complète. Seul **Bookland 978/979** conservé (`BOOK_BARCODE_PREFIX`, test `scoring.prefix.test.ts`). Typage musique repose sur le **signal spécialiste registry** (Discogs/MusicBrainz/Deezer) + `compile.typeSelection.test.ts`.
- **Reste (optionnel)** : table GS1 prefix → type produit + fixtures golden-master qui exercent la détection ; bump cache si comportement change.

#### ~~WORDLIST-1~~ — Sous-titres produit dans `tokenEquivalents` _(fait 2026-07-05)_

- **Fait** : groupes AC III (`birth of a new world`) et Star Wars (`the american saga`) retirés de `TITLE_PHRASE_EQUIVALENT_GROUPS` ; seul `movie video game` (descripteur catégorie) reste.
- **Cross-langue** : `regionalTitles` / aliases providers via `metadataTitleMatchScore` + fragments structurels (`buildSeparatorTitleVariants`) — tests `titleMatching.test.ts`, `searchVariants.test.ts`.
- **Providers** : ScreenScraper mappe tous les `noms` régionaux ; même modèle que le cas Destiny déjà encodé.

#### ~~POLL-1~~ — Poll idle de `BackgroundJobsMenu` _(nit perf mineur)_

- **Fait 2026-07-05** : `refetchInterval` = `false` quand `count === 0` (plus de poll 10 s au repos). Poll 2,5 s uniquement pendant des jobs actifs. Invalidation existante depuis la page item (`shelves/.../[itemId]/page.tsx`) suffit pour afficher le menu au démarrage d'un refresh.

#### CONFIG-1 — Self-declaration providers _(fait 2026-07-05)_

- **`registry.ts`** = manifeste seul (import + ligne dans `PROVIDER_MODULES`) — **seul fichier à éditer pour ajouter un provider**.
- **`catalog.ts`** = découverte générique (`discoverProviderModules`, `providersForType`, `capabilityCoverage`, …) ; le core importe `@/core/catalog/catalog` ou `@/services/provider`.
- Chaque module auto-déclare `info` (types, capabilities, traits metadata).

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

### Audit fonctionnement (2026-07-04) — voir [audit_fonctionnement.md](audit_fonctionnement.md)

- **Cartographie + audit complet** : `docs/audit_fonctionnement.md` (diagramme Mermaid 2 plans identification/enrichissement, 5 logiques uniques vérifiées provider-blind, constats classés P1–P6) (**fait 2026-07-04**)
- **Dead code sweep** : 27 fichiers morts supprimés — 3 composants (`ItemCarousel`, `ShelfBadge`, `BulkSeriesModal`), `lib/api/user.ts`, **16 barrels `index.ts` jamais importés en dossier**, 7 primitives UI shadcn (`alert-dialog`/`breadcrumb`/`pagination`/`popover`/`scroll-area`/`separator`/`table`) + 2 fns `@deprecated`. Vérifié par scan d'imports repo-wide (alias+relatif+dynamique+JSX) (**fait 2026-07-04**, `8b02366`)
- **Build préexistant réparé** : la branche était **déjà rouge** avant le nettoyage — 3 erreurs de type sans lien (`attachmentDisplayScore` trait `isGameMediaGallerySource` absent du type ; `coverPlaceholder.server` namespace `sharp` ; `metadataPriceFallback` champs `BarcodePricesResult` manquants) corrigées (**fait 2026-07-04**, `8b02366`)
- **Music word-list → signal registry** : helper `detectBoardGameSpecialistSignal` généralisé en `detectSpecialistSignal(result, labels)` (partagé board-game + musique) ; `TYPE_SCORE.musicSpecialistSignal { musics:+0.35, games:-0.3 }` ; word-list `orchestra|soundtrack|ost|album|cd` **supprimée** ; test `compile.typeSelection` ; `BARCODE_CACHE_VERSION` v42 (**fait 2026-07-04**, `3b83e6a`)
- **`detectVideoGameSignal` câblé** (vrai bug) : signal défini + testé au niveau `scoreTypeCandidate` (régression Ghost Recon) mais **jamais passé** par `resolveBarcode` → fix jeu-vidéo→pas-musique **inactif en prod**. Câblé ; cache v43 (**fait 2026-07-04**, `92f61a6`)
- **Préfixes audio co-localisés** : les 2 regex divergents (`scoring.AUDIO_BARCODE_PREFIX` vs local resolver) réunis dans `evidence/scoring.ts` (`AUDIO_BARCODE_PREFIX` + `AUDIO_LIKE_GAME_SUPPRESSION_PREFIX`), divergence documentée comme intentionnelle (buts opposés). 0 changement de comportement (**fait 2026-07-04**, `d9bdddc`)
- **Literals/dedup core** : préfixe audio dupliqué → 1 const ; `steamdb`/`pcgamingwiki` label repliés sur `PC_SPECIFIC_FACT_SOURCE_KEYS` ; literal mort `"BGG (Bayes)"` supprimé (aucun fact ne le porte — BGG émet `label:"BoardGameGeek"`) ; ligne « FIXED » inexacte de `word_list_audit.md` corrigée (**fait 2026-07-04**, `8825672` + `c8c6cd5`)

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

[provider_agnostic_architecture.md](provider_agnostic_architecture.md) §0 · Guard `src/core/catalog/blindnessGuard.test.ts`.

### Observation migration & exploitation

Dashboard : `pnpm providers:audit:mapping`.

État 2026-06-27 : voir tableau **État actuel**. Consommation observations : titres en merge ; barcode encore `sourceWeight` legacy.

### Apriloshop

Site sur **IQIT Search** ; AJAX PrestaShop natif renvoie `products: 0`.

**Fait** : config PrestaShop, factory agnostique, `collectRetailerBarcodeHits` générique.

**Reste** : ~~`searchStrategy: iqit`~~ fait ; vérifier index barcode IQIT en prod si résolution EAN échoue encore (enrichissement page produit).

Pas d'autre boutique PrestaShop IQIT à migrer ; Apriloshop retiré (search 403). Chipweld = référence IQIT jeux.

### Open studies

#### A. Two-phase vs decide-late

**Décision : keep decide-late** pour le scan barcode sans type.

#### B. Game-DB fan-out

**Fait 2026-06-22** — `gameLookup.ts` gated.

#### C. confrontWithDatabase echo

**Fait 2026-06-22/23** — `null` on miss ; provider-blind `nameDatabase`.

#### D. Display-language region order

`LOCALE_REGION_ORDER` est dérivé de la préférence UI (`fr` → PAL-first, `en` → US-first) via `regionOrderForUiLocale` ; cookie `preferred-locale` + `Accept-Language` côté API.

#### E. Provider health script

**Fait 2026-06-27** — `pnpm providers:health` dans `package.json`. BGG token lu lazily au `run()`.

#### F. Multi-type barcode regression corpus

**Fait 2026-06-29** — `DEFAULT_BARCODE_REGRESSION_CASES` couvre jeux (Wii/Xbox), livre, musique, film, JdS (Catan + Mille Sabords sans type). Voir `TESTING.md` pour `pnpm test:record` / `test:record:all`.

**Fixtures HTTP replay** : **21/21** enregistrées au 2026-07-02 (`pnpm test:record:all`, un process vitest par cas). Rejeu déterministe via intercepteur partagé (`tests/helpers/httpReplay.ts`).

#### I. Cluster confidence calibration (barcode P2)

**Fait** (voir Roadmap « Cluster confidence `sourceScore` + tier ») —
`barcodeClusterObservationContribution` + `observationTierScale: 0.01` dans
`scoring.ts` / `compile.ts`. Ne pas rouvrir sans recalibrer `compile.confidenceLock.test.ts`.

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
