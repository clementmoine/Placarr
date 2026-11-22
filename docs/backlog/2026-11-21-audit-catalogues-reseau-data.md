# Audit catalogues, réseau et `data/` (2026-11-21)

> Fait pendant la remise en route après la perte Synology (Sync de tous les
> catalogues en cours). Constats vérifiés dans le code et sur disque ; rien
> n'est encore corrigé sauf mention contraire. Entrée résumée dans
> [`../backlog.md`](../backlog.md) § P0.

## Synthèse par priorité

| Prio | Constat | Risque |
| ---- | ------- | ------ |
| ~~P0~~ | 92 ledgers Carddass (+ 7 Shippuden) lus dans `data/…/sources/` mais **écrits par aucun code** | **Corrigé 2026-11-21** : 123 + 15 ledgers revenus dans `curated/sources/`, lecteurs avec repli, test de contrat (ADR-006 précisé) |
| ~~P0~~ | ~45 lectures de ledgers **au chargement des modules** (Carddass, Shippuden) | **Neutralisé** : chaque ledger lu au démarrage est versionné (test de contrat) — un `data/` vide ne fait plus planter le démarrage |
| P2 | 3 scans Leclerc Disney 25 (`*.scan.png`) retirés de `curated/` le 2026-10-24 (`aa531dd9`) et retrouvés égarés sous `data/dragonball/cg/src/…` | **Remis en `curated/`** (toutes les faces candidates sont gardées). Reste : le seed scellé Leclerc déclare **une seule** face par produit au lieu de passer par `pickBestCatalogueFace` |
| P1 | Ledgers Carddass / Shippuden : données **publiques** (Wayback, sites, annonces) mais **6 853 entrées sur 8 486 sans URL**, 21 fichiers sans aucune URL | Impossible de dire d'où elles viennent ni de les re-récupérer ; en `curated/` seulement comme filet de sécurité, leur place est `data/` + scraper |
| P1 | `httpGet` / `httpPost` (API) : **ni retry ni circuit breaker** par défaut — **fait** (ADR-024) | Une erreur 5xx / reset réseau transitoire = échec direct ; aucun frein sur une API qui tombe |
| P1 | (**corrigé**) Doc de `providerHttp` (`defineProvider.ts`) annonçait « circuit breaker soft-ban et fallback FlareSolverr déjà branchés » pour tout | Vrai seulement pour `scrapeGet` / `scrapeText` |
| P1 | `fetch()` nu dans 2 providers (lint + `sharedClientGuard` rouges) | Hors limiteur / UA / abort du job |
| P2 | `fetch()` nu côté serveur hors providers (`core/enrich/media/maskDownload.ts`, `lib/money/convertCurrency.ts`) ; `axios` direct dans `lib/admin/apkStoreFetch.ts` | Pas de limiteur par host ni d'UA commun |
| P2 | Lorcana : `exportLorcanaCardsIndexJson` supposait la table `meta` présente | **Corrigé** (test + garde) — base créée par l'étape scellé avant le scrape cartes |
| P2 | TCGdex : `ensureTcgdexIndex` renvoyait une base sans tables `sets` / `prints` (créée par l'étape scellé) | **Corrigé** (test `indexStoreBootstrap.test.ts`) — même bug d'amorçage que Lorcana ; la Sync Pokémon échouait en `no such table: sets` |
| P2 | `pnpm dev` relance les workers à chaque modification de `src/` | Les Sync en cours sont remises en file (Yu-Gi-Oh! à 30 tentatives le 2026-11-21) : ne pas éditer le code pendant une grosse Sync, ou lancer les workers sans watch |
| P2 | API `catalog-index-sync` : `replaceOpenForKind` sans filtre `providerId` | **Corrigé** (test) — chaque lancement annulait les Sync de tous les autres catalogues |
| P3 | Une Sync réécrit `narutocarddass/curated/sources/reconstructed-provenance.json` (seul `generatedAt` change) | Contredit ADR-006 (« un Sync ne dirty pas `src/providers/` ») |
| P3 | `data/<pack>/curated/` = contenus scellés **générés** (`rebuildFromStaging`) | Nom trompeur à côté du vrai `src/providers/<id>/curated/` |

## 1. `data/` régénérable ? (ADR-006)

**Règle** : tout ce qu'une Sync sait reconstruire vit dans `data/<pack>/`
(gitignoré) ; ce qui est assemblé à la main et non rejouable vit dans
`src/providers/<id>/curated/` (versionné).

**Écart majeur — Naruto Carddass.** Le commit `ab86fb92` (2026-10-28) a sorti
227 ledgers de `curated/sources/` vers `data/<pack>/sources/` en les
considérant « syncables ». Pour Carddass, `narutoCarddassSyncedSourcePath` n'a
**aucun appelant** : 92 fichiers lus (155 lectures), 0 écrits. Ils sont donc
des digs non rejouables rangés côté `data/`.

| Pack | Lectures `read*SyncedSource` | Écritures `*SyncedSourcePath` |
| ---- | ---: | ---: |
| `naruto/narutocarddass` | 155 | 0 |
| `naruto/narutoshippuden` | 7 | 2 |
| autres packs (Kayou, Mythos, Data, JCC, Heroes, Bleach…) | 0 | écrivent leurs ledgers |

Récupération possible : l'historique git avant `ab86fb92`
(`git show ab86fb92^:src/providers/naruto/narutocarddass/curated/sources/<f>`)
et le NAS. Piste : remettre les ledgers non rejouables dans `curated/sources/`
(ou écrire le scraper qui les produit), et un test de contrat « tout ledger
lu a un écrivain ou vit dans `curated/` ».

**Lectures au chargement.** `const x = readNarutoCarddassSyncedSource(…)` au
niveau module dans `harvest.ts`, `parse/*.ts`, `install/faces.ts`, `disk.ts`,
`search.ts`, `printFaceResolve.ts`, `sealed.ts`, `scrape/*.ts`,
`pipeline/*.ts` (+ `narutoshippuden/sealed.ts`, `sources/faces.ts`,
`install/packshots.ts`). `registry.ts` importe le provider → toute l'app
dépend de ~45 fichiers de `data/`. Piste : lecture paresseuse (dans la
fonction qui s'en sert) + fichier absent = provider `blocked` / résultat vide
honnête, jamais un crash.

**Rangement `data/`.** Structure homogène (`cards/ documents/ foil/ logs/
products/ sources/ staging/`) sur 30 packs. Anomalies :

- `data/dragonball/cg/src/providers/leclerc/curated/products/disney25/…` —
  3 scans (23/10, script lancé depuis le mauvais `cwd`), retirés de
  `curated/` par `aa531dd9` au profit de Paninimania. **Remis en `curated/`**
  le 2026-11-21 : on garde toutes les faces candidates, le moteur de score
  choisit. Le dossier égaré peut être supprimé.
- `data/dragonball/cg/backup/` (2 dumps JSON du 15/08), `data/dragonball/jcc/quarantine/`
  — résidus manuels, à trier.
- `data/<pack>/curated/` (9 packs) — sortie générée des contenus scellés ;
  à renommer (`sealed/` ?) pour lever l'ambiguïté avec le `curated/` versionné.

État de la restauration du 2026-11-21 : bases et index visuels repris du NAS
(16 `catalog.sqlite` + `live.sqlite` intègres) ; absents partout et laissés à
la Sync : `catalog.sqlite` Lorcana (reconstruit : 3 589 cartes), Pokémon,
MTG, One Piece ; index LaunchBox / iCollect / No-Intro (reconstruits).

## 2. `curated/` des providers

22 dossiers `curated/`, cohérents avec le contrat
([`../curated_data.md`](../curated_data.md)) : surtout images de faces /
packshots et petits JSON attestés, aucun dump de crawl > 1 Mo. Les plus
lourds : `narutocarddass` (183 Mo, 315 fichiers), `narutoranks` (146 Mo),
`dbh` (53 Mo). Seul écart : le `generatedAt` réécrit par la Sync (tableau
ci-dessus).

## 2 bis. Provenance : `data/` vs `curated/`

Règle (précisée par le propriétaire le 2026-11-21) :

- **`data/`** — tout ce qui est récupérable publiquement. Chaque donnée porte
  **obligatoirement** son lien public : page profonde, ou snapshot Wayback
  (`https://web.archive.org/web/<horodatage>/<url>`) pour un contenu archivé.
  C'est ce lien qui permet de dire d'où vient la donnée **et de la
  re-récupérer** : une Sync doit pouvoir tout reconstruire à partir de lui.
- **`curated/`** — uniquement ce qu'on ne sait pas récupérer publiquement :
  constructions manuelles (retouches / reconstructions Figma…), scans maison,
  collection physique. Les URL des sources utilisées sont un plus, avec la
  trace de ce qui a été fait (modèle : `reconstructed-provenance.json`).
- Corollaire : la seule chose « manuelle » à garder pour une donnée publique
  est **où regarder** (la liste d'URL / de snapshots trouvée à la main) — une
  graine courte, versionnée (`curated/` ou code du provider) ; le contenu
  récupéré, lui, vit dans `data/` avec son URL par entrée.

Mesure sur les 138 ledgers Carddass / Shippuden remis en `curated/` le
2026-11-21 (filet de sécurité, faute de scraper) :

- 8 486 entrées, **6 853 sans aucune URL** ; 21 fichiers sans aucune URL
  (`bandaicg-en-cardlist` 1 751 entrées, `noihjp-carddass` 1 190,
  `carddas-jp-cardlist` 1 010, `carddass-card-names` 738, `suruga-scan-*`…).
- Cas typique : contenu parsé depuis un miroir Wayback stocké dans
  `data/<pack>/staging/`, mais le ledger ne cite qu'un texte (« www.bandaicg.com/…s1.html…s15.php (Wayback mirror in staging/…) ») —
  ni snapshot horodaté, ni URL par entrée : impossible de le re-récupérer.
- Ces ledgers sont des **données publiques** (Wayback, sites vivants,
  annonces) : leur place cible est `data/`, pas `curated/`. Seuls quelques
  fichiers relèvent vraiment de `curated/` (journal `hosts-blocked.json`,
  constats faits à la main sans page publique, livret imprimé…).

**Premier lot converti (2026-11-21)** : `bandaicg-en-cardlist.json` (1 751
cartes EN) et `carddas-jp-cardlist.json` (1 010 cartes JP). Graine
`narutocarddass/curated/sources/official-checklists-seed.json` (14 pages EN
aux horodatages du miroir d'origine, vérifiés octet par octet ; 18 pages JP ;
5 cartes spéciales lues sur leur image) ; étape Sync `checklists`
(`narutocarddass/sources/officialChecklists.ts`, avant `index`) qui récupère
les snapshots manquants dans `staging/` puis réécrit les deux ledgers dans
`data/` avec une URL Wayback par carte ; lecture à la demande dans
`parse/bandai.ts` (vide tant que la Sync n'a pas tourné). Mêmes set / numéro /
nom que les ledgers manuels ; raretés du set 12 comblées (parseur corrigé).
Ajoutées ensuite (même jour, accord du propriétaire) : 60 cartes exclusives
des decks de démarrage JP (`st_5th`, `st_8th`, `st_10th`, `st_12th`,
`st_15th`) — ledger JP à 1 070 cartes, 0 retirée.

Pistes :

1. Pour chaque ledger public : extraire la **graine** (URL / snapshots
   Wayback horodatés, retrouvés dans `staging/`) en version courte
   versionnée ; écrire le scraper qui reconstruit le ledger dans `data/`
   avec une URL par entrée (`shared/wayback`, `shared/coleka`,
   `shared/nikita` existent) ; puis retirer la copie de `curated/`.
2. Test de contrat sur les ledgers de `data/<pack>/sources/` : URL ouvrable
   par entrée (ou constructeur d'URL déclaré par le provider). Mode rapport
   d'abord, bloquant ensuite.
3. Côté `curated/` : vérifier que chaque fichier relève bien du non
   récupérable, et y garder la trace des transformations quand il y a des
   sources.
4. Étendre la mesure à tous les packs.

## 3. Mise en commun dans le core

- Packs récents (MTG, Yu-Gi-Oh!, One Piece, Leclerc, DB Heroes / JCC /
  Lamincards, Naruto Kayou / Mythos / Card Game) : tous via
  `createEmptyLocalTcgProvider` ; Bleach, Naruto Ranks / Ultra / Shippuden /
  Data via `createLocalTcgLine`. Bon niveau de factorisation.
- 5 pipelines historiques (`narutocarddass`, `lorcanatcg`, `pokemontcglive`,
  `dbscg`, `dbsfw`) + `tcgdex` : chacun son `indexStore.ts` et son schéma
  SQLite `prints` (≈ 6 000 lignes au total). Choix documenté (CLAUDE.md
  providers), mais c'est là que naissent les bugs d'amorçage (cf. Lorcana).
  Piste : faire passer leur lecture « prior » et leur schéma par
  `shared/cardCatalogue/localPrintsIndex.ts`.
- Garde-fous de cécité : rouges uniquement sur `scripts/` (dev-only) —
  `runMissingArtDensifyQueue.ts`, `runResidualMissingFaces.ts`,
  `runPokemonIdentifyRebuild.ts` nommaient des packs — **fait 2026-11-22** :
  les deux enchaîneurs supprimés (remplacés par la Sync), identify rendu
  générique (`scripts/runIdentifyRebuild.ts <pack>`).

## 4. Réseau (`src/lib/http/`)

| Brique | Où elle s'applique |
| ------ | ------------------ |
| Timeout 15 s, UA commun, abort du job, dédup en vol, limiteur par host | `httpGet` (et `httpPost` / `httpHead`) |
| Circuit breaker persisté (`data/http/circuits/`) | **seulement** `fetchGetWithFlareFallback` / `fetchTextWithFlareFallback` |
| Fallback Byparr (FlareSolverr-compatible, 1 slot sérialisé, `BYPARR_URL`) | idem — sidecar `placarr-byparr` up, worker plafonné en conséquence |
| Retry exponentiel + jitter (`retry()`) | **opt-in** : 9 fichiers ; `softRetryNull` : 16 |
| Soft-ban CDN (`shared/softban.ts`) | Pokémon Live CDN, faces DBS, quelques installs |

Constats :

1. **Pas de retry par défaut sur les API** (TMDB, IGDB, RAWG, Wikidata,
   Discogs, MusicBrainz…). `retry()` existe et est testé ; piste : l'appliquer
   dans `httpGet` pour les erreurs réseau / 5xx idempotentes (désactivable),
   plutôt qu'au cas par cas.
2. **Pas de circuit breaker sur les API** : une API en panne est re-sollicitée
   à chaque item. Piste : brancher `circuitAllowsRequest` / `record*` dans
   `httpGet` par host, comme pour le scrape.
3. **Doc trompeuse** dans `defineProvider.ts` (`providerHttp`) : à corriger en
   même temps.
4. **`fetch()` nu** :
   - `pokemon/live/cdn/index.ts` — l'exemption ESLint vise encore l'ancien
     chemin `pokemon/live/cdn.ts` (fichier déplacé) → lint rouge. Mettre à
     jour le chemin de l'exemption (et l'allowlist de `sharedClientGuard`).
   - `dragonball/dbsfw/extract/bakeClientFaceS3tc.ts` (commit `a259fe28`) —
     `fetch` vers le Chrome DevTools local (`127.0.0.1`) + script injecté :
     légitime, mais à documenter dans les deux allowlists.
5. Hors providers (non couverts par la règle ESLint) : `maskDownload.ts`,
   `convertCurrency.ts` (serveur), `apkStoreFetch.ts` (axios en streaming).
   Piste : étendre la règle à `src/core/` et `src/lib/` (hors `lib/http`,
   `lib/client`, composants navigateur).
6. Test qui fuit l'environnement : `providers/booknode/fetch.test.ts` attend
   `http://flare.test/v1` mais lit le vrai `BYPARR_URL` du `.env`.

## 5. Tests et lint au 2026-11-21 (Sync en cours)

- `pnpm test` : 111 tests en échec dans 34 fichiers sur 1 073 (9 134 OK).
  - Gardes : cécité (`scripts/`, préexistant), `sharedClientGuard`
    (`bakeClientFaceS3tc.ts`), `untrackedSourceGuard` (le nouveau
    `catalog-index-sync/route.test.ts`, vert une fois commité).
  - Fuite d'env : `booknode/fetch.test.ts`.
  - Le reste dépend de données encore absentes ou en cours de Sync (foil
    Lorcana, catalogue / foil Pokémon, faces Carddass / Kayou, index
    LaunchBox pour `resolver.fresh`) — **à relancer après la Sync** avant de
    conclure à une régression.
- `pnpm lint` : 5 520 erreurs prettier (préexistant, formatage), 134
  `no-unused-vars`, 6 `no-restricted-syntax` (les deux `fetch()` ci-dessus).

## Ordre proposé

1. Réseau : retry + circuit breaker dans `httpGet`, doc `providerHttp`, les
   deux exemptions `fetch()`, extension de la règle ESLint.
2. Provenance : graines d'URL / snapshots Wayback + scrapers pour remettre
   les ledgers Carddass / Shippuden dans `data/` avec une URL par entrée ;
   test de contrat sur `data/<pack>/sources/` (rapport puis bloquant).
3. Relancer `pnpm test` après la Sync et traiter ce qui reste rouge.
4. Leclerc scellé : déclarer toutes les faces candidates dans `sealedSeed.ts`
   et choisir via `pickBestCatalogueFace` (comme les cartes).
5. Renommer `data/<pack>/curated/`, trier `backup/` et `quarantine/`, supprimer `data/dragonball/cg/src/`, arrêter
   la réécriture de `reconstructed-provenance.json`.
