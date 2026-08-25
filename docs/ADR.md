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
  limiter par host, softban en circuit breaker persisté, FlareSolverr derrière
  une interface `ChallengeSolver` ; règle ESLint interdisant `fetch`/`axios`
  directs dans `src/providers/` (allowlist documentée).
- **Conséquences** : contourner la plomberie devient du travail supplémentaire
  au lieu d'un raccourci.
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

---

_Les ADR suivants documentent les décisions de la réorganisation 2026-08 au fil
de son exécution (defineProvider, contrat curated formel, nouveaux domaines)._
