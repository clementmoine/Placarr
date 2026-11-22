# ADR — Architecture Decision Records

Format : **Date / Statut / Contexte / Décision / Conséquences / Alternatives
écartées**. On consigne la décision et pourquoi, pas le résultat. Un ADR n'est
jamais réécrit ; s'il est renversé, on ajoute un nouvel ADR qui le supplante.

Inspiré de `docs/ADR.md` de tako-firehouse (analyse : `archive/structure_vs_tako.md`).

---

## ADR-001 : `printKey` plutôt que `barcode` pour les cartes

- **Date** : 2026-07 (rétro-documenté le 2026-08-23)
- **Statut** : Accepté, en production
- **Contexte** : une carte n'a pas de code-barres ; son identité est
  `jeu:set-numéro[-groupe]` (même set+numéro non unique : cinq Chiots
  dalmatiens numérotés 4 dans le set 3 Lorcana).
- **Décision** : colonne `Item.printKey` nullable dédiée ; `barcode` reste
  réservé aux vrais codes-barres.
- **Conséquences** : les providers TCG identifient par `searchPrints` /
  `lookupPrint` ; la recherche-d'abord remplace le scan pour les cartes.
- **Alternatives écartées** : détourner `barcode` — « une colonne qui ment
  coûte toujours plus cher que la colonne en trop » (`tcg_support.md` §1).

## ADR-002 : Consensus agnostique entre providers dans `core/enrich`

- **Date** : 2026-07 (rétro-documenté le 2026-08-23)
- **Statut** : Accepté, en production
- **Contexte** : 68 sources hétérogènes, aucune fiable seule ; les classements
  par source en dur biaisent vers le premier provider écrit.
- **Décision** : le core fusionne les candidats par scoring fondé sur les
  preuves (capabilities, evidence, canonical), pas par ordre de providers ;
  classement des visuels par paliers de qualité, préférence de région.
- **Conséquences** : `core/enrich` est gros (142 fichiers) mais agnostique ;
  ajouter un provider ne modifie pas le classement des autres.
- **Alternatives écartées** : normalisation minimale à la tako
  (`BaseNormalizer`, 450 lignes) — ne fait pas la même tâche.

## ADR-003 : Postgres `SKIP LOCKED` pour les jobs de fond, pas de Redis

- **Date** : 2026-08 (rétro-documenté le 2026-08-23)
- **Statut** : Accepté, en production
- **Contexte** : app perso mono-instance ; Postgres déjà présent.
- **Décision** : file maison sur `BackgroundWorkJob` (UPDATE … FOR UPDATE SKIP
  LOCKED), worker `tsx` séparé, heartbeat + stale sweep + release au shutdown.
- **Conséquences** : un seul état à sauvegarder, transactions atomiques
  job+données ; débit très suffisant. Pratique reconnue (Prisma, pg-boss).
- **Alternatives écartées** : BullMQ (exige Redis) ; pg-boss — réévalué
  seulement si cron/priorités/dead-letter viennent à manquer.
- **Addendum 2026-11-23 — annulation en cours de job, drain borné** :
  - Constat (2026-11-22) : « Annuler » une Sync catalogue la laissait finir
    (seul l'extract sondait la ligne, et son pipeline continuait en
    arrière-plan après le rejet), et le drain de rechargement dev (SIGUSR2)
    attendait sans limite la fin d'une Sync de plusieurs heures.
  - Contrat : tout job long tourne sous `runCancellableJob`
    (`core/collect/jobs/jobCancellation.ts`). La ligne `cancelled` est sondée,
    un `AbortController` est interrompu, et son signal est à la fois passé au
    travail (`ProviderCatalogRefreshOpts.signal`, `ensurePackClient`,
    `runCatalogueExtractCommand`) et posé dans l'ALS HTTP
    (`@/lib/http/jobAbort`) : la requête suivante du job échoue. Les étapes
    CPU appellent `throwIfJobAborted()` à leurs frontières (pipeline des
    lignes locales). Un job annulé n'est ni terminé ni propagé aux étagères.
  - Drain : SIGUSR2 → plus de nouveau job ; passé `WORKER_DRAIN_TIMEOUT_MS`
    (10 min par défaut, `scripts/workerDrain.ts`), le worker interrompt les
    jobs en vol (`BackgroundWorkInterruptedError` : ni réussi ni échoué), les
    rend à `pending` et sort. Un job sourd au signal a 30 s de grâce avant la
    sortie forcée. Une Sync interrompue reprend via `completedSteps`
    (ADR-017) ou depuis le début.

## ADR-004 : Extraction par comportement, pas de méga-fabrique `createCardPack`

- **Date** : 2026-08-21 (rétro-documenté le 2026-08-23)
- **Statut** : Accepté
- **Contexte** : les packs cartes réimplémentaient les mêmes concepts
  (pipeline, cli, indexStore) ; une fabrique unique a été envisagée
  (`archive/tcg_pack_architecture_audit.md`).
- **Décision** : factoriser par comportement dans
  `src/providers/shared/cardCatalogue/` (`createLocalTcgLine`,
  `localPrintsIndex`, `cardCatalogueHooks`…) ; la connaissance du jeu
  (scrape/parse/fetchFaces) reste dans le provider.
- **Conséquences** : narutoranks/narutoultra tiennent en ~60 lignes ; les
  autres packs migrent progressivement.
- **Alternatives écartées** : la fabrique unique — « mutualiser le bas du
  tableau » aurait couplé ce qui change pour des raisons différentes.

## ADR-005 : Duplication foil Lorcana/Pokémon assumée (fidélité source d'abord)

- **Date** : 2026-08-11 (rétro-documenté le 2026-08-23)
- **Statut** : Accepté
- **Contexte** : deux dumps différents (Unity Lorcana vs TCG Live Pokémon),
  deux fidélités à atteindre.
- **Décision** : les cœurs `effects/lorcana` et `effects/pokemon` restent
  séparés ; la surface commune passe par `EffectPackModule` et
  `core/render/foil/*`. « Unification runtime = plus tard ; fidélité =
  maintenant » (`foil_effects.md`).
- **Conséquences** : les packs « catalogue-only » (naruto, dbs) sont eux
  factorisés (factory) car sans cœur de fidélité.

## ADR-006 : `data/` non commité et re-dérivable ; `curated/` commité

- **Date** : 2026-08 (rétro-documenté le 2026-08-23 ; syncables précisés 2026-10)
- **Statut** : Accepté, en production
- **Contexte** : ~120 Go de données crawlées/dumpées ; certaines données
  n'existent plus en ligne (visuels Naruto, reconstructions).
- **Décision** : tout ce qu'un **Sync / harvest** peut reconstruire vit sous
  `data/<pack>/` (gitignored) — ledgers crawlés (`sources/`,
  `definePackSyncedSources` / `packSyncedSourcePath`), cotes marketplace, faces/backs/packshots
  récupérables par URL (`cards/`, `products/`, `staging/`). Ce qui est
  **assemblé à la main et non rejouable** vit dans
  `src/providers/<id>/curated/` (commité) : digs, reconstructions,
  maps d'ids attestés, Wayback durable. Un Sync normal ne dirty pas
  `src/providers/` sauf changement d'identifiants attestés.
- **Conséquences** : un clone frais démarre vide mais fonctionnel ; la
  valeur irremplaçable est versionnée ; `git status` après Sync ne montre
  pas de M sous `curated/sources` pour les ledgers migrés.
- **Alternatives écartées** : archive contributive en base (tako) — inutile
  en mono-instance ; le local curé couvre le même besoin.
- **Précision 2026-11-21** : « syncable » veut dire **qu'un code de la Sync
  écrit le fichier**. Le commit `ab86fb92` avait sorti de git 227 ledgers
  dont ceux de Naruto Carddass (123) et Shippuden (15), qu'aucun code
  n'écrit : après la perte Synology, ils n'existaient plus que sur le NAS, et
  leur lecture au chargement des modules faisait planter Next et les workers.
  Ils sont revenus dans `curated/sources/` ; les lecteurs prennent la copie
  `data/` si une Sync en a écrit une, sinon la copie versionnée. Garde-fou :
  `src/providers/naruto/syncedLedgersVersioned.test.ts` (tout ledger lu au
  démarrage existe dans `curated/sources/`). **Transitoire** : ce sont des
  données publiques ; cible = graine d'URL versionnée + scraper qui les
  reconstruit dans `data/` avec une URL par entrée, puis retrait de
  `curated/` (qui ne garde que le non récupérable publiquement :
  constructions manuelles, scans maison). Premier lot fait : checklists
  officielles EN / JP (graine `official-checklists-seed.json`, étape Sync
  `checklists`).

## ADR-007 : Contrat provider déclaratif typé + hooks (capabilities)

- **Date** : 2026-07 (rétro-documenté le 2026-08-23)
- **Statut** : Accepté, en production
- **Contexte** : il faut décrire ce qu'une source sait faire (identify, price,
  cover, catalogue de tirages, corpus local…) sans obliger chaque provider à
  tout implémenter.
- **Décision** : `ProviderModule` = `info` (capabilities, supplyMode, auth,
  traits) + ~30 hooks optionnels, typés TypeScript, vérifiés par des tests de
  contrat (`catalogProviderContract.test.ts`).
- **Conséquences** : l'enforcement compile-time que la validation consultative
  de tako n'a pas ; mais la plomberie (HTTP, retry, softban) restait à
  réassembler à la main → voir ADR-008.

## ADR-008 : Couche réseau systématisée et verrouillée

- **Date** : 2026-08-23
- **Statut** : Accepté
- **Contexte** : retry/softban/FlareSolverr étaient opt-in : 18 `fetch()` nus
  dans des providers, softban consommé par 3 providers sur 65
  (`archive/autonomy_audit.md`).
- **Décision** : la politesse vit dans la couche transport (`src/lib/http/`),
  pas dans les providers : backoff avec full jitter + respect de `Retry-After`,
  limiter par host, softban en circuit breaker persisté
  (`data/http/circuits/` via `circuitPersistence`, hydraté au restart),
  FlareSolverr derrière une interface `ChallengeSolver` ; règle ESLint
  interdisant `fetch`/`axios` directs dans `src/providers/` (allowlist
  documentée : `pokemon/live/cdn/index.ts` uniquement).
- **Conséquences** : contourner la plomberie devient du travail supplémentaire
  au lieu d'un raccourci. Les ledgers softban **par pack**
  (`providers/shared/softban`) restent pour les CLI CDN (Pokémon / DBS faces).
- **Références** : AWS Architecture Blog (backoff & jitter), modèle RomM
  (contexte injecté), Backstage (factory + manifeste validé).

## ADR-009 : Factory `defineProvider` — manifeste validé, plomberie par défaut

- **Date** : 2026-08-24
- **Statut** : Accepté (pilote : `src/providers/bedetheque/`)
- **Contexte** : ADR-007 a rendu le contrat déclaratif et ADR-008 a systématisé
  le transport, mais chaque provider réassemble encore la même plomberie à la
  main — le healthCheck par ping est copié à l'identique dans ~45 modules, le
  testHandler « metadata » est réécrit partout, et rien ne valide `info` à
  l'exécution (une capability inconnue ou un `types` vide ne cassent rien avant
  loin).
- **Décision** : `defineProvider(spec)` (`src/providers/shared/defineProvider.ts`)
  assemble un `ProviderModule` depuis un manifeste + des hooks : validation Zod
  de `info` à la création (fail fast, message nommant le provider et le champ),
  healthCheck par défaut via `createMetadataHealthCheck` (ping de
  `healthCheckUrl` ou `info.websiteUrl`), testHandler `<id>-metadata` généré
  depuis `metadataSearch`, contexte injecté `ctx.http` (ré-export ciblé de
  `@/lib/http`). Tout hook fourni prime sur le défaut ; le contrat
  `ProviderModule` et le comportement du registry sont inchangés.
- **Conséquences** : le pilote bedetheque perd sa plomberie réassemblée sans
  changer de comportement (tests existants verts sans modification). La
  généralisation aux autres providers est une décision ultérieure, mesurée sur
  ce pilote.
- **Alternatives écartées** : modifier `ProviderModule` (casse les 68 modules
  d'un coup) ; méga-fabrique couvrant tous les hooks (rejetée en ADR-004 pour
  les packs cartes — même raison) ; validation dans le registry au lieu de la
  factory (trop tard : l'erreur pointerait le registry, pas le provider).

## ADR-010 : `createPrintKeyPriceModule` + mapping promo Lorcana unique

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : lorcanagg, lorcast et la partie prix de tcgdex répétaient le
  même squelette (`printKey` → fetch → `pricedOffers` new/foil) ; le mapping
  `pN` → `PN` existait en double (`dotggPromoSetFromGrouping` /
  `lorcastPromoSetFromGrouping`).
- **Décision** : factory `createPrintKeyPriceModule` /
  `createPrintKeyPriceRefresh` dans `src/providers/shared/` ; helper
  `lorcanaPromoSetFromGrouping` dans `lorcana/shared/`. TCGdex garde son module catalogue et
  n'emprunte que le refresh prix.
- **Conséquences** : ajouter un provider de prix printKey-only = un fichier
  court ; une seule source de vérité pour les promos Lorcana.
- **Alternatives écartées** : forcer tcgdex entier dans la factory (il porte
  aussi identify/cover/foil Live).

## ADR-011 : DBS Masters / Fusion World — factory catalogue, schémas distincts

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : `dbscg` et `dbsfw` avaient des `index.ts` quasi jumeaux et le
  même parseur Bandai `SET-NNN`, mais des schémas SQLite **différents**
  (Masters enrichit les titres ; FW range rareté/type dans `facts.json`).
  Forcer `LocalPrintsIndex` aurait exigé une migration de données.
- **Décision** : `createDbsCatalogModule` + `bandaiCollector` partagés
  (`src/providers/dragonball/shared/dbs/`) ; deux modules conservés ; schémas et
  `searchPrints` restent chez chaque provider.
- **Conséquences** : surface provider ~80 → ~80 lignes centrées sur le
  resolve metadata ; le parseur Bandai n'a plus qu'une source.
- **Alternatives écartées** : aplatir les schémas vers `LocalPrintsIndex`
  maintenant (churn data + perte de colonnes Masters) — à réévaluer si un
  3ᵉ pack Bandai arrive.

## ADR-012 : Densité — rôles narutocarddass, enrich par question, packPaths explicite

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : `narutocarddass` (~230 fichiers à plat) et `core/enrich` (racine
  dense) freinaient la navigation ; plusieurs helpers `packPaths` defaultaient
  silencieusement à `"pokemon"`.
- **Décision** : (1) sous-dossiers `parse/` / `scrape/` / `harvest/` / `install/`
  dans narutocarddass, racine = entrypoints + helpers non préfixés ; (2) galleries /
  bookSearch → `enrich/media/` et `enrich/search/` + README de flux, sans
  déplacer encore les orchestrateurs `fetch`/`merge`/`storage` ; (3) `pack`
  obligatoire sur les helpers foil/Live de `packPaths`.
- **Conséquences** : navigation par rôle ; pas de shim aux anciens paths ;
  un oubli de pack est une erreur de type, pas un path Pokémon silencieux.

## ADR-013 : Vague manga — Nautiljon (volume FR) + Jikan (série MAL)

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : le trou métier manga FR par tome (ISBN / prix / couverture VF)
  n'était pas couvert ; MAL apporte la fiche série (note, titres JP/EN) sans
  ISBN. Première vague phase 7 du plan de réorganisation, via `defineProvider`.
- **Décision** : `nautiljon` (scrape volumes, FlareSolverr, EAN + prix €) et
  `jikan` (API v4, série uniquement, pas d'ISBN). Les deux restent sur
  `types: ["books"]` ; pas d'anime dans cette vague.
- **Conséquences** : barcode manga FR → Nautiljon ; titre série / consensus
  MAL → Jikan. Live Nautiljon exige Flare ; live Jikan dépend de la dispo MAL.

## ADR-014 : Vague TCG — lignes locales vides (OPTCG / YGO / MTG)

- **Date** : 2026-08-25
- **Statut** : Accepté (Digimon retiré 2026-09-16 — pas de collection Digimon)
- **Contexte** : la standardisation TCG (`createLocalTcgLine` +
  `defineCatalogueOnlyPack` + `CATALOGUE_PACKS`) n'était testée que sur des
  lignes déjà peuplées (Naruto / DBS).
- **Décision** : brancher les franchises (`onepiece`, `yugioh`, `mtg`) comme
  catalogues locaux **vides mais câblés** — onglet Admin, CLI bootstrap, effet
  catalogue-only, sans inventer de foil. Factory `createEmptyLocalTcgProvider`
  pour le boilerplate. Moissons (apitcg, YGOPRODeck, Scryfall) = étapes
  suivantes, pas un prérequis pour ouvrir l'onglet.
- **Conséquences** : un nouveau TCG n'attend plus d'avoir des cartes pour
  exister dans l'UI ; `pnpm <id>:sync` pose l'index vide + verso curé s'il y
  en a.

## ADR-015 : Domaine jouets — Brickset + Rebrickable, rayon `toys` prêt

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : `MediaType.toys` / Prisma existaient déjà, mais le rayon
  restait `comingSoon` faute de provider d'identify. Smartoys ne couvre que
  jeux/hardware en prix.
- **Décision** : activer `toys` dès qu'un identify LEGO est branché —
  `brickset` (API v3, EAN/UPC + boîte, clé `BRICKSET_API_KEY`) et
  `rebrickable` (API v3, set_num + image, clé `REBRICKABLE_API_KEY`), tous
  deux via `defineProvider`. Pas de migration Prisma. MFC / Playmobil =
  vagues suivantes (scrape).
- **Conséquences** : scan EAN d'une boîte LEGO → Brickset ; recherche
  set_num / titre → les deux. Sans clé, les adapters no-op (health
  unconfigured).

## ADR-016 : Généralisation `defineProvider` aux providers cas commun

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : ADR-009 a introduit `defineProvider` avec un pilote
  (`bedetheque`). Les vagues suivantes (nautiljon, jikan, brickset,
  rebrickable) ont confirmé le pattern. Restait une cohorte de modules
  hand-rolled dont la plomberie (ping `websiteUrl` / URL dédiée +
  testHandler `<id>-metadata`) était identique au défaut de la factory.
- **Décision** : migrer les providers cas commun vers `defineProvider` dès
  que health + testHandlers se réduisent aux défauts (ou à un override
  minimal). Première cohorte post-pilote : `babelio`, `planetebd`,
  `bdphile` (label « Revue » conservé), `fullset`, `senscritique`
  (`healthCheckUrl` GraphQL). Deuxième vague : `howlongtobeat`,
  `coverproject`, `wikidata`, `omdb`, `openlibrary`. Troisième vague :
  `launchbox`, `myludo`, `steam`, `tmdb`, `rawg`, `freakxy`, `igdb`,
  `thegamesdb`, `boardgamegeek`, `deezer`, `googlebooks`, `steamgriddb`.
  Vague 4 : catalogues / cover / boardgame retailers (`musicbrainz`,
  `nointro`, `scandex`, `smartoys`, `geedie`, `hdjv`, `ledenicheur`,
  `chocobonplan`, `espritjeu`, `okkazeo`, `philibert`). Vague finale :
  tous les `*/index.ts` restants (retailers livres, Discogs, eBay,
  ScreenScraper, packs TCG locaux…) — hooks avancés conservés, manifeste
  validé Zod. Les hooks avancés (adapters, teardown, probes, pinned
  records, barcode deps) restent inchangés — la factory ne les bride pas.
- **Conséquences** : moins de boilerplate ; validation Zod du manifeste à
  la création ; checklist d'intégration oriente vers `defineProvider` par
  défaut. Tout module `src/providers/*/index.ts` passe par la factory ;
  les overrides (health clé, probes, barcode slots, catalog local) restent
  explicites.

## ADR-017 : Checkpoint d'extract catalogue dans le payload du job

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : après coupure, `recoverStaleRunningBackgroundWorkJobs`
  requeue le job foil, mais la reprise relançait le pipeline depuis le
  début (audit autonomie §4 — cas DBS Masters). Les étapes sont déjà
  idempotentes ; le coût est le temps perdu à les refaire.
- **Décision** : protocole `── checkpoint <step>` émis par les CLI à
  étapes (`dbscg`, `dbsfw`, `narutocarddass`). Le worker merge dans
  `payload.completedSteps`. À la reprise, le runner ajoute `--skip a,b,…`
  quand le pack déclare `extract.pipelineSteps`. Packs sans étapes
  déclarées (Pokémon, Lorcana…) inchangés.
- **Conséquences** : une reprise saute les étapes finies ; un crash
  *intra*-étape rejoue seulement cette étape (idempotente). Pas de
  migration Prisma — le JSON payload suffit.

## ADR-018 : Granularité de `ProviderCatalogHooks.refresh`

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : `refresh` ne recevait que `{ auto }` — admin et sync horaire
  ne savaient dire que « le pack en entier » (autonomy_audit §3). Les CLI
  acceptaient déjà `--only` / `--skip` / `--langs` / `--limit`.
- **Décision** : étendre `ProviderCatalogRefreshOpts` avec `only`, `skip`,
  `langs`, `limit`. `cardCatalogueHooks` les traduit en argv CLI. L'API
  `/api/admin/catalogue-corpora` et le job `catalogProviderSync` les
  transportent. L'UI admin expose les champs quand le pack déclare
  `extract.pipelineSteps`. `all: true` refuse la granularité (passe debug
  mono-pack).
- **Conséquences** : un admin peut rejouer `faces` / une langue / un `limit`
  sans relancer toute la moisson ; la CLI reste disponible mais n'est plus
  obligatoire pour le debug ciblé.

## ADR-019 : Densité `narutocarddass` — `sources/` par rôle

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : phase 6.1 du plan de réorganisation — `narutocarddass` mélangeait
  à la racine collecteurs externes, parse, scrape et contrat catalogue
  (~120 fichiers plats). `parse/`, `scrape/`, `harvest/`, `install/` et
  `curated/` existaient déjà ; les ledgers / packshots restaient à plat.
- **Décision** : dossier `sources/` pour les collecteurs externes (Coleka,
  eBay, Mercari, Manga-News, ledgers scellés…). Racine = contrat
  (`index`, `pipeline`, `cli`, `facts`, `packs`, `searchPrints`…). Voir
  `src/providers/naruto/narutocarddass/README.md`. Pas de découpage `domains/` global
  (hors périmètre plan).
- **Conséquences** : un nouvel arrivant trouve d'abord le contrat, puis les
  sources ; imports relatifs mis à jour ; `narutoranks` pointe vers
  `sources/colekaListingFetch`.

## ADR-020 : Schéma d'item logique — `core/schemas/content-types`

- **Date** : 2026-08-25
- **Statut** : Accepté (livraison partielle de structure_vs_tako §5)
- **Contexte** : tako répond « qu'est-ce qu'un item ? » en un fichier
  (`content-types.js`). Chez nous la réponse était dispersée (Prisma +
  `MetadataResult` + commentaires `Item.printKey`). Le plan Kimi écartait
  le churn `domains/<domaine>/providers/` ; il restait le besoin d'un
  **point d'entrée de lecture**.
- **Décision** : `src/core/schemas/content-types.ts` — `CONTENT_TYPES`
  (sync Prisma `Type` + `MediaType`), profils (identité / champs
  caractéristiques), `CONTENT_DOMAINS` (carte de lecture), Zod
  `coreItemIdentitySchema` + `coreMetadataSchema`. Prisma reste la
  persistance. **Pas** de déplacement des providers par domaine : les
  sources multi-domaines (marketplaces / agrégateurs prix) casseraient un
  découpage naïf.
- **Conséquences** : `ARCHITECTURE.md` commence par content-types ;
  garde de test d'alignement Prisma/MediaType ; le découpage physique
  domaine reste ouvert et volontairement différé.

## ADR-021 : Sortie UnityPy — Node only

- **Date** : 2026-08-25 (clôturé 2026-08-26)
- **Statut** : Accepté — **phases A–E livrées** (hot path 100 % Node)
- **Contexte** : l’extract Unity produit passait par UnityPy
  (`pokemontcglive/unity`, `lorcanatcg/unity`). Les libs npm UnityFS n’étaient
  pas drop-in sous Node ; un spike + patches `unityfs-js` (codecs JS, SerializedPass
  Unity 6000) ont permis la parité golden. Détail :
  [unity_without_python.md](archive/unity_without_python.md).
- **Décision** :
  1. **Une toolchain Node** pour l’extract Unity produit ; Frida QA peut rester
     Python.
  2. Wrapper `@/lib/unity` + `patches/unityfs-js@0.2.8.patch`.
  3. Pas d’escape hatch `PLACARR_UNITY_PYTHON` — scripts UnityPy retirés du repo
     produit.
- **Conséquences** : extract foil = Catalogue Sync / worker in-process uniquement
  (pas de CLI dans le container Docker) ; venv unity obsolète.

## ADR-022 — Soft-nest, lifecycle catalogue, dual living, multi-covers

- **Contexte** : densifier les micro-fichiers TCG, ranger par domaine sans
  `domains/`, formaliser living vs finished, et aligner les covers catalogue
  sur le modèle item classique (galerie d'attachments).
- **Décision** :
  1. **Soft-nest** optionnel : `providers/pokemon/{tcgdex,live}/`,
     `providers/commerce/…` — ids registry **inchangés** ; discovery via
     `PROVIDER_MODULES` + path, pas de rename d'id.
  2. **`catalogLifecycle: "living" | "finished"`** sur `ProviderInfo`.
     Auto-sync lit le trait (skip `finished`) — jamais une allowlist d'ids.
  3. **Dual living** : owner `local_catalog` (browse / foil) + provider
     `api_live` / scrape en parallèle → consensus. Deux modules, pas un hybride.
  4. **Multi-face covers** : chaque `art.<source>.*` sur disque → une
     `MetadataAttachment` (`coverProvenance: "catalog"`) ; défaut =
     re-rank Affiche / catalogue (stamps) ; ItemModal pin user comme pour
     ScreenScraper. Core reste aveugle aux hosts mcdn/coleka.
- **Conséquences** : voir `docs/provider_supply_modes.md` ; densification
  `faces.ts` / dossiers d'action live ; Nest commerce / Naruto en phases
  suivantes.

## ADR-023 — Croissance catalogue : ré-embed, pas retrain

- **Contexte** : les sets TCG arrivent régulièrement. CLIP est déjà dans le
  Sync (`embeddingIndexStep`). Question naïve : faut-il **fine-tuner** le
  modèle à chaque vague de cartes ?
- **Décision** :
  1. **Nouvelles cartes / faces** → encoder avec le **même** modèle et mettre
     à jour l’index (Catalogue **Sync** pack / **Sync tout**). C’est le
     chemin produit par défaut — **pas de CLI** `package.json`.
  2. **Fine-tune CLIP** = chantier **offline rare**, seulement si eval photo
     réelle plafonne *après* index complet + OCR + gates, avec dataset
     versionné et rebuild total post-FT (`modelId`).
  3. Changer de checkpoint = invalider + re-encoder **tout** le corpus ; ne
     jamais mélanger des vecteurs de deux modèles dans un même index.
- **Conséquences** : voir [card_identify_learning.md](card_identify_learning.md).
  Priorité ops = fraîcheur embeddings multi-pack ; pas de pipeline auto-FT
  dans Sync.

## ADR-024 — Résilience par défaut des GET d'API (rejeu + circuit par host)

- **Date** : 2026-11-21
- **Statut** : Accepté, en place (non commité au 2026-11-22)
- **Contexte** : l'audit du 2026-11-21
  ([backlog/2026-11-21-audit-catalogues-reseau-data.md](backlog/2026-11-21-audit-catalogues-reseau-data.md))
  a montré que l'ADR-008 n'était tenu que sur le chemin scrape :
  `httpGet` / `httpHead` (toutes les API : TMDB, IGDB, Discogs…) n'avaient ni
  rejeu ni circuit breaker ; `retry()` était opt-in dans 9 fichiers ; la doc
  de `providerHttp` affirmait le contraire.
- **Décision** :
  1. `httpGet` / `httpHead` rejouent **une fois** (`retries`, défaut 2 essais)
     sur erreur transitoire — réseau, délai, 5xx — avec backoff à jitter
     complet ; jamais sur 4xx ni 429 (signal de quota). Le rejeu vit dans la
     promesse partagée : les appels joints ne le multiplient pas. `httpPost`
     n'est jamais rejoué.
  2. Circuit breaker par host d'API (clé `api:<host>`, module
     `circuitBreaker` existant) : ouvert après **5 échecs transitoires
     consécutifs**, puis reset exponentiel 2 → 5 → 15 → 60 min avec sonde
     half-open. Toute réponse (même 404) prouve que le host vit et remet le
     compteur à zéro. Pas d'I/O tant que le host répond : le disque n'est
     touché qu'à l'ouverture / fermeture. Circuit ouvert → erreur immédiate
     `ECIRCUITOPEN`, non rejouée.
  3. Le profil `scrape` garde son propre circuit soft-ban (`scrapeFetch`,
     qui appelle `httpGet` avec `validateStatus: () => true`).
- **Conséquences** : un hoquet réseau ne fait plus échouer un enrichissement ;
  une API en panne cesse d'être martelée item après item. Coût : un GET en
  échec transitoire prend jusqu'à un délai + un backoff de plus ; les
  appelants qui ont déjà leur propre `retry()` peuvent passer `retries: 1`.
- **Hors périmètre** : le `fetch()` du script navigateur de
  `dbsfw/extract/bakeClientFaceS3tc.ts` — résolu par ADR-025 (module
  supprimé, `sharedClientGuard` au vert).

- **Complément 2026-11-22** : `PLACARR_HTTP_RESILIENCE=off` coupe rejeu et
  circuit d'API — **uniquement** pour le rejeu déterministe des fixtures
  code-barres (`tests/helpers/httpReplay`, qui le pose) : enregistrées sans ces
  mécanismes, une requête non couverte y rend un 504 qu'un rejeu ou un circuit
  ouvert transformaient en chemin différent. Le harnais distingue aussi les
  POST par leur corps (Byparr) et ne tronque plus un corps JSON.

## ADR-025 — Décodage BCn maison et faces Fusion World composées sur CPU

- **Date** : 2026-11-21
- **Statut** : Accepté, en place (non commité au 2026-11-22)
- **Contexte** : les faces Fusion World passaient par un bake WebGL dans
  Chrome headless (`bakeClientFaceS3tc.ts`) parce que le chemin CPU
  « tramait ». Mesure : le tramage venait de `@arkntools/unity-js-tools`,
  dont l'alpha BC3 est faux aux pixels 10 à 15 de chaque bloc 4×4 (indices
  au-delà du 32e bit, défaut wasm-bindgen signalé par le paquet). Le même
  décodeur sert `src/lib/unity/texture2d.ts` (Lorcana, Pokémon Live, masques
  foil). Un GPU n'est pas une référence stable (interpolation BC1 propre à
  chaque fabricant) et WebGL en conteneur sans GPU exige SwiftShader +
  `--enable-unsafe-swiftshader`.
- **Décision** :
  1. `src/lib/unity/bcn.ts` : décodeur BC1 / BC3 TypeScript conforme D3D10
     (BC3 toujours en 4 couleurs ; DXT1 Unity = RGB, index 3 noir opaque ;
     alpha 48 bits lu sans décalage > 32 bits). Branché dans
     `texture2d.ts` (DXT1 / DXT5) et le décodage des cadres FW.
  2. `dbsfw/extract/composeClientFace.ts` : face produit composée sur CPU —
     calques mip0 pleine résolution, réduction **Lanczos3** (sharp, alpha
     prémultiplié), fusion `over` du shader Frost sur fond blanc. Choix du
     propriétaire : « corrigé + Lanczos » plutôt que l'identique bilinéaire.
  3. `bake: "cpu-lanczos-v1"` (`CLIENT_FACE_BAKE_ID`) dans
     `layers.compose.json` et `facesRecipe` dans le tampon CDN : tout autre
     bake est périmé et rebaké, même sans nouvelle version du client.
  4. Suppression de `bakeClientFaceS3tc.ts` (Chrome, DevTools, serveur
     HTTP temporaire).
- **Conséquences** : décodeur validé à 59,8 dB moyen (min 57,7, écart max
  3/255) contre 60 vrais bakes GPU ; ~50 ms de composition par face ;
  sortie identique sur toute machine ; plus de Chrome dans l'image.
- **Complément 2026-11-22 — une seule chaîne de décodage** :
  - Référence indépendante : le décodeur matériel du GPU (Metal, Apple M1),
    sur textures réelles et sur blocs aléatoires (outil de dev dans
    `scratch/metaldec`, non versionné). BC7 : identique bit à bit (157
    badges FW) ; ASTC 4×4…8×8 : ±1 (Pokémon Live) ; BC1 / BC3 maison : ±2
    (arrondi d'interpolation propre à chaque GPU) ; ETC2 : identique.
  - **ETC1 corrigé** : le paquet rend du BGRA, lu comme du RGBA — les
    plaques foil Pokémon Live en ETC1 (`TEX_CompositeMask`,
    `TEX_StitchedRings`, `FX_T_BlueHighlight`, `T_Stamped_HighlightPan`)
    avaient R et B inversés. Régénérées.
  - `decodeTextureFormat` couvre aussi Alpha8, RGBAHalf et ETC2 (RGB,
    RGBA1 avec texel transparent = 0, RGBA8) ; le second décodeur caché
    (`decodeRgba` d'unityfs-js) est supprimé : un format non couvert rend
    `null`. Les cadres FW passent par la même entrée.
  - Les calques `layer.*.webp` du foil FW sont réduits par le même Lanczos3
    que la face (`resizeClientFaceLayer`) → `cpu-lanczos-v2`. Les filtres
    de « soin » et les rééchantillonneurs bilinéaire / boîte de
    `clientFaces.ts` sont retirés.
  - Les plaques `.dxt5` restent : le rendu foil WebGL du navigateur les
    lit compressées, ce n'est pas un second décodeur.
- **Références** : [backlog/2026-11-21-fw-faces-sans-gpu.md](backlog/2026-11-21-fw-faces-sans-gpu.md).

---

_Les ADR suivants documentent les décisions au fil de l'exécution (réorga
2026-08, sortie UnityPy, …)._

## ADR-026 — Source du client du jeu : un crochet déclaratif, une seule étape

- **Date** : 2026-11-22
- **Statut** : Accepté
- **Contexte** : trois packs extraient leurs rendus d'un client de jeu
  téléchargé — Lorcana et Pokémon Live depuis un APK du store
  (`androidPackageId`, `apkStoreFetch`), Fusion World depuis le CDN GUS/Xsolla
  (`ensureFusionWorldClientFromCdn`). Deux chemins faisaient la même chose :
  la sonde store vivait dans le runner d'Extract (et, depuis le matin, devant
  la Sync), la sonde CDN dans l'étape `foil` du pipeline FW. Conséquence
  mesurée le 2026-11-22 : une Sync manuelle Lorcana relançait l'extract sans
  APK (« skip Unity ») et perdait les rendus.
- **Décision** :
  1. `ProviderCatalogHooks.ensureClient?` : le provider déclare comment
     obtenir son client ; il rend `ProviderClientOutcome`
     (`skipped` / `up-to-date` / `updated` / `unavailable`, version en
     chaîne). Fabrique partagée `apkStoreClient(packId)` pour les APK ;
     Fusion World branche sa sonde GUS.
  2. Une seule étape commune `ensurePackClient(dataPack)`
     (`src/lib/admin/catalogueClient.ts`) appelle le crochet du module ;
     la Sync catalogue (`catalogProviderSync`) et l'Extract
     (`runCatalogueExtractCommand`) passent par elle, avant tout le reste.
  3. Les pipelines ne téléchargent plus leur client eux-mêmes : l'étape
     `foil` FW lit le client déjà posé (`version.json` + bundles) ; un client
     absent = étape sautée avec sa raison, jamais une seconde sonde.
- **Conséquences** : ajouter un jeu à client téléchargé = déclarer
  `ensureClient`, rien dans le core. Une Sync manuelle ou auto fournit
  toujours le binaire à l'extract. Garde : `catalogueClient.test.ts`
  (tout pack `androidPackageId` déclare `ensureClient` ; Fusion World aussi ;
  les autres packs ne sondent rien).
- **Alternatives écartées** : une liste `clientSource` dans
  `cataloguePacks` interprétée par le core (le core nommerait GUS/Xsolla —
  contraire à la cécité providers) ; garder la sonde FW dans `foil` (deux
  façons de faire la même chose).
