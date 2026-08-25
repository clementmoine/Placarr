# ADR — Architecture Decision Records

Format : **Date / Statut / Contexte / Décision / Conséquences / Alternatives
écartées**. On consigne la décision et pourquoi, pas le résultat. Un ADR n'est
jamais réécrit ; s'il est renversé, on ajoute un nouvel ADR qui le supplante.

Inspiré de `docs/ADR.md` de tako-firehouse (analyse : `structure_vs_tako.md`).

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

- **Date** : 2026-08 (rétro-documenté le 2026-08-23)
- **Statut** : Accepté, en production
- **Contexte** : ~120 Go de données crawlées/dumpées ; certaines données
  n'existent plus en ligne (visuels Naruto, reconstructions).
- **Décision** : tout ce qui est re-récupérable par un script vit dans
  `data/<pack>/` (gitignored, stubs au postinstall via `foil:ensure`) ; ce qui
  est assemblé à la main vit dans `src/providers/<id>/curated/` (commité,
  trois sous-rôles : `cards/` et `products/` installés vers data,
  `sources/` = ledgers d'attestation).
- **Conséquences** : un clone frais démarre vide mais fonctionnel ; la
  valeur irremplaçable est versionnée.
- **Alternatives écartées** : archive contributive en base (tako) — inutile
  en mono-instance ; le local curé couvre le même besoin.

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
  documentée : `pokemontcglive/cdn.ts` uniquement).
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
  `lorcanaPromoSetFromGrouping` partagé. TCGdex garde son module catalogue et
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
  (`src/providers/shared/dbs/`) ; deux modules conservés ; schémas et
  `searchPrints` restent chez chaque provider.
- **Conséquences** : surface provider ~80 → ~80 lignes centrées sur le
  resolve metadata ; le parseur Bandai n'a plus qu'une source.
- **Alternatives écartées** : aplatir les schémas vers `LocalPrintsIndex`
  maintenant (churn data + perte de colonnes Masters) — à réévaluer si un
  3ᵉ pack Bandai arrive.

## ADR-012 : Densité — rôles narutoccg, enrich par question, packPaths explicite

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : `narutoccg` (~230 fichiers à plat) et `core/enrich` (racine
  dense) freinaient la navigation ; plusieurs helpers `packPaths` defaultaient
  silencieusement à `"pokemon"`.
- **Décision** : (1) sous-dossiers `parse/` / `scrape/` / `harvest/` / `install/`
  dans narutoccg, racine = entrypoints + helpers non préfixés ; (2) galleries /
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

## ADR-014 : Vague TCG — lignes locales vides (OPTCG / Digimon / YGO / MTG)

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : la standardisation TCG (`createLocalTcgLine` +
  `defineCatalogueOnlyPack` + `CATALOGUE_PACKS`) n'était testée que sur des
  lignes déjà peuplées (Naruto / DBS).
- **Décision** : brancher quatre franchises (`onepiece`, `digimon`, `yugioh`,
  `mtg`) comme catalogues locaux **vides mais câblés** — onglet Admin, CLI
  bootstrap, effet catalogue-only, sans inventer de foil. Factory
  `createEmptyLocalTcgProvider` pour le boilerplate. Moissons (apitcg,
  digimoncard.io, YGOPRODeck, Scryfall) = étapes suivantes, pas un prérequis
  pour ouvrir l'onglet.
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
  étapes (`dbscg`, `dbsfw`, `narutoccg`). Le worker merge dans
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

## ADR-019 : Densité `narutoccg` — `sources/` par rôle

- **Date** : 2026-08-25
- **Statut** : Accepté
- **Contexte** : phase 6.1 du plan de réorganisation — `narutoccg` mélangeait
  à la racine collecteurs externes, parse, scrape et contrat catalogue
  (~120 fichiers plats). `parse/`, `scrape/`, `harvest/`, `install/` et
  `curated/` existaient déjà ; les ledgers / packshots restaient à plat.
- **Décision** : dossier `sources/` pour les collecteurs externes (Coleka,
  eBay, Mercari, Manga-News, ledgers scellés…). Racine = contrat
  (`index`, `pipeline`, `cli`, `facts`, `packs`, `searchPrints`…). Voir
  `src/providers/narutoccg/README.md`. Pas de découpage `domains/` global
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

## ADR-021 : Sortie UnityPy — cadre (Node-first)

- **Date** : 2026-08-25
- **Statut** : Accepté (cadre) — implémentation phasée, Python oracle jusqu’à
  parité
- **Contexte** : le seul Python **produit** est l’île Unity
  (`pokemontcglive/unity`, `lorcanatcg/unity`) via UnityPy. Le reste est déjà
  `tsx`/Node. Les libs npm UnityFS (`unityfs-js`, `@arkntools/unity-js`) ne
  sont pas drop-in sous Node (Vite workers, WASM codecs vides, ESM sans
  extension, Texture2D 2022.3, absence de Shader chez arkntools). Un spike
  2026-08 sur fixtures Live a prouvé : typetree `MaterialManifest`, ASTC via
  `.resS`+`decodeTexture`, et **24/24** `.frag` GLES depuis `compressedBlob`
  sans UnityPy. Détail : [unity_without_python.md](unity_without_python.md).
- **Décision** :
  1. Objectif = **une toolchain Node** pour l’extract Unity produit ; Frida
     QA peut rester Python.
  2. Pas d’ajout naïf des packages Unity au `package.json` tant qu’un
     **wrapper** (`src/lib/unity/` ou équivalent provider-local) n’isole
     codecs JS, typetree et resolve ESM.
  3. Migration **par phases** A→E (manifest → textures → shaders → quad/back
     / Lorcana → retrait venv), chacune derrière golden-master vs UnityPy /
     artefacts `data/pokemon/foil/`.
  4. UnityPy reste **référence de test** jusqu’à la phase E ; on n’affaiblit
     pas les tests extract existants.
- **Conséquences** : item backlog P2 ; docs `data-layout` / README unity
  pointent le plan ; le hot path foil peut progresser sans attendre une lib
  upstream « complète ».

---

_Les ADR suivants documentent les décisions au fil de l’exécution (réorga
2026-08, sortie UnityPy, …)._
