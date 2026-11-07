# Hardcoding audit — core must be agnostic, data-driven, provider-neutral

> **STATUS 2026-07-25 — audit rejoué sur l'arborescence actuelle.** Les sections
> P1–P4 ci-dessous ont été re-vérifiées fichier par fichier après le découpage
> `src/lib` + `src/services` → `src/core`. L'audit citait 12 chemins, dont 10
> n'existaient plus ; ils sont corrigés ou marqués réglés.
>
> **Reste ouvert :** un seul item, `BarcodeLookupPayload` (P2, voir ci-dessous).
> Tout le reste de P1–P3 est réglé ; ce qui subsiste en P4 est assumé (jargon
> vendeur = donnée maison, mots-nombres anglais-only).
>
> **Ce qui suit le bandeau `Enforcement` est un journal historique** conservé
> pour le raisonnement, pas la surface vivante.

> **Enforcement already exists:** `src/core/catalog/blindnessGuard.test.ts`
> inventories every quoted provider literal in `src/`+`scripts/` (excluding
> provider modules + tests) against a **shrinking allowlist**. Removing a provider
> literal from core = shrink its allowlist entry. This is the regression guard for
> the whole P2 effort — the allowlist below IS the remaining provider-bias surface.
>
> **Progress (this session):**
>
> - ✅ P1a — per-product title `if`s deleted (titleUtils); crossbow live-verified via canonical.
> - ✅ P1b — board-game `PUBLISHERS` list removed; replaced by registry-driven
>   `detectBoardGameSpecialistSignal` (a `types:["boardgames"]` provider anchoring
>   the result); Okkazeo live-verified.
> - ✅ P2a — `formatFactSource` is now a **client-safe label map** in playerFacts,
>   kept in sync with the registry by `providerSourceLabels.test.ts`. ⚠️ LESSON:
>   the first attempt imported `providerRegistry` directly, which broke `pnpm build`
>   — the item page is `"use client"` and the registry eagerly pulls every
>   provider's server-only adapter (`sharp` → `child_process`) into the browser
>   bundle. **Client display code can never import the registry**; mirror + sync-test
>   instead, or format labels server-side. Providers still declare `info.factLabel`.
> - ✅ P2 (priceCachePolicy) — `offer.source === "PriceCharting"` → registry flag
>   `info.referencePriceSource` + `isReferencePriceSource()`. Provider-blind now.
> - ✅ Build fixed (was red): `titleUtils` `Set<string>` cast, `mappingProbeUtils`
>   dead duplicate key removed, `node:sqlite` ambient shim (`@types/node@20`
>   predates it; runtime is Node 26). tsc now 0 errors.
> - ✅ P3 (partial) — the repeated `0.5 + n*0.15` consensus-confidence literal →
>   one `agreementConfidence()` helper in metadataConsensus.
> - ✅ Cover ranking — `cachePayload` `url.includes("screenscraper"/"rawg.io")` →
>   registry `coverUrlQualityRank()` (providers declare `info.coverUrlHost`; ranks
>   by their existing `isRealBoxCover`). Behaviour-preserving, server-side.
> - All 694 tests green, tsc clean; guard allowlist shrank 4× (playerFacts back as a
>   client-safe map, priceCachePolicy, cachePayload, + the build-fix).
>
> **P2b ✅ COMPLETE — `sourceAssembly` is fully provider-blind (0 provider literals,
> guard allowlist entry removed).** All 15 providers self-declare their evidence
> contribution via `ProviderModule.buildBarcodeSources`; core just iterates the
> registry. Marketplace/aggregator scoping lives in `src/core/identify/lookup/sourceContribution.ts`
> (`marketplaceContributions` / `gatedContributions` / `scopedContribution`). The
> `payload.retailers[]` loop stays (already provider-blind). Plug-and-play achieved:
> adding a provider no longer touches the assembler. Behaviour-preserving (694 tests,
> build green, live Ghost Recon/de Blob byte-identical). Also fixed a self-inflicted
> `git checkout` regression (restored looksLikeImageBuffer + P2a + P1b) and converted
> all the top-level-await import rewrites back to static.
>
> **P2b history (incremental, green at each step):** added
> `ProviderModule.buildBarcodeSources(payload, ctx)` — the plug-and-play inversion
> of `sourceAssembly`. `compileAllBarcodeTypeResults` now iterates `PROVIDER_MODULES`
> and collects each provider's contribution, with un-migrated providers still in the
> explicit assembler blocks (hybrid is fine transitionally — green throughout).
> **Migrated (10 — ALL canonical/simple providers, every type):** ScreenScraper,
> PriceCharting, ScanDex (games; ScanDex→boardgames too), MusicBrainz, Discogs,
> Deezer (music), TMDB (movies, w/ aliases), OpenLibrary (books), Philibert,
> Okkazeo (boardgames). Each emits its EXACT former label; behaviour-identical (694
> tests incl. SS-fixture confidenceLock); production build verified at each step.
> Trivial single-key modules need NO new imports (contextual typing supplies
> `payload`). `sourceAssembly` allowlist now holds ONLY the 5 marketplace providers.
>
> **Remaining (the harder marketplace providers):** AchatMoinsCher, PicClick,
> Freakxy, LeDenicheur, ChasseAuxLivres + the `payload.retailers[]` loop. Harder
> because: (a) MULTI-TYPE scoping — each contributes to several media types gated on
> `ctx.type`/`ctx.isBook` (`type===X || !isBook`); (b) LABEL MISMATCHES — assembler
> uses "PicClick"/"LeDenicheur"/"ChasseAuxLivres" but `info.label` is "PicClick
> (eBay)"/"LeDénicheur"/"Chasse aux Livres", so the module must emit the exact
> assembler string; (c) they carry `NamedListing[]` (not `SourceProduct[]`) — the
> contribution type or a conversion must accommodate it. A focused final push.
> Pattern for the rest: move the provider's extraction + its exact label string into
> its module's `buildBarcodeSources`, delete its assembler block, shrink the
> allowlist. **Remaining to migrate:** OpenLibrary, MusicBrainz, Discogs, Deezer,
> TMDB, Philibert, Okkazeo (simple, label==info.label), then the harder marketplace
> ones with type/isBook scoping (AchatMoinsCher, PicClick, Freakxy, LeDenicheur,
> ChasseAuxLivres + the retailers loop — these have label≠info.label, e.g.
> "ChasseAuxLivres" vs "Chasse aux Livres", so the module must emit the exact
> assembler string). NOTE: live-checking via tsx now hits a top-level-await/cjs
> limit (sourceAssembly pulls the registry → providerBootstrap); Next build is fine
> — verify with `pnpm build`, not a tsx scratch.
>
> **Findings that reshape the remaining plan:**
>
> - **P2c platform tables** — `videoGamePlatforms.ts` (the consumer, client-safe,
>   13-file blast radius) can't be routed through the heavy registry/provider
>   modules without re-triggering the client-bundle break. Moving the tables to
>   provider dirs only _relocates_ the coupling (core still imports them by name).
>   Low value / high constraint — deprioritise.
> - **P4 ISO codes / stopwords** — replacing the CURATED region/stopword lists with
>   COMPLETE libraries would OVER-MATCH and over-strip real title words (`no`=Norway,
>   `in`=India, aggressive stopwords). The curation is a correctness feature, not a
>   bug. Recommend: keep these as DATA (the user's "complete lib" rule doesn't apply
>   to false-positive-sensitive title cleaning). Numerals (roman/number-word maps)
>   ARE finite, so a lib swap there is cosmetic.
> - **Real remaining win = P2b** (sourceAssembly + price adapters): server-side,
>   large, resolution-critical — a dedicated pass with live §5 + confidenceLock.
>
> **Remaining surface (from the guard allowlist) — larger pieces:**
>
> - **P2b `sourceAssembly.ts`** (biggest): a 265-line provider adapter mapping each
>   payload slice → per-type sources. Inverting it = redesign the provider-keyed
>   payload shape + move extraction into ~15 modules. Resolution-critical; needs a
>   dedicated pass with live §5 + confidenceLock verification. Guarded, so safe to
>   stage. NOT a rush job.
> - **P2c** platform tables (~3.5k lines) → provider modules (mechanical, large).
> - **P2** remaining literals: `barcodeResolver.ts`, `metadataFetch.ts`,
>   `priceResolver.ts`, `providerMappingAudit.ts`, `cachePayload.ts`, UI pages —
>   each a small registry-flag/lookup swap like priceCachePolicy.
> - **P4** ISO region/language codes (the genuine never-complete list) + numerals +
>   stopwords via libs. **P3** metadata confidence magic numbers → config.

Goal: remove every hardcoded value / magic number / per-entity list / provider-
specific branch from the **core** (resolution, scoring, cleaning, type detection).
"We will never have a complete exhaustive list" — so any hand-maintained list of
entities (titles, publishers, platforms, brands) is a bug, not data. Provider
specifics belong **inside each provider module**, never in core. External libs are
welcome where they replace a hand-maintained list with a maintained dataset.

Legend: 🔴 P1 remove first (per-entity hardcode + correctness bias) · 🟠 P2
provider bias in core · 🟡 P3 magic numbers · 🟢 P4 linguistic vocab (externalize)
· ⚪ keep (real-world standard, not arbitrary).

---

## 🔴 P1 — Per-product hardcoded "matches"

**Réglé.** Les trois titres câblés (`Link's Crossbow Training`,
`Super Monkey Ball : Banana Blitz`, `Mario & Sonic aux Jeux Olympiques`) ne
subsistent que dans [`regressionCases.ts`](../src/core/identify/lookup/regressionCases.ts),
c'est-à-dire comme cas de test attendus — plus aucun `if` par produit dans le
moteur.

## 🔴 P1 — Board-game publisher list

**Réglé.** La liste `PUBLISHERS` (23 éditeurs choisis à la main) n'existe plus.
Le signal vient maintenant du provider qui répond et des phrases de catégorie.

~~**Reste ouvert (petit)** : les trois listes de regex de
`boardGameSignal.ts`.~~ **Fait 2026-07-25** : le vocabulaire vit dans
[`listingTerms.ts`](../src/core/identify/listingTerms.ts)
(`LISTING_BOARDGAME_CATEGORY_TERMS`, `LISTING_FILM_CONTENT_TERMS`) et les
matchers sont dérivés via `createTermMatcher`. `MEDIA_FORMAT_LABELS`
**dupliquait** `LISTING_FORMAT_DEFINITIONS` avec ses propres regex : les
définitions portent maintenant un `displayLabel` et la détection les parcourt
dans l'ordre de déclaration (LaserDisc/VHS avant DVD/Blu-ray, comme avant).

## 🟠 P2 — Provider-specific processing in core

Tous les points de la liste d'origine sont réglés. État vérifié le 2026-07-25 :

- ~~`sourceAssembly.ts` (switch par provider)~~ — **réglé** : chaque module
  déclare `buildBarcodeSources`, le core itère le registre. Le fichier n'existe
  plus.
- ~~`playerFacts.formatFactSource` (switch id → label)~~ — **réglé** : les
  providers déclarent `info.factLabel` ; plus aucun littéral provider dans
  [`playerFacts.ts`](../src/core/enrich/facts/playerFacts.ts).
- ~~Ordonnancement par nom de provider dans `playerFacts`~~ — **réglé**.
- ~~`priceCachePolicy.ts` (règle spécifique PriceCharting)~~ — **réglé** :
  trait `info.referencePriceSource`. Le fichier n'existe plus.
- ~~Tables plateformes ScreenScraper / LaunchBox (~3,5k lignes)~~ —
  **traité en données** : elles sont devenues
  [`platforms/data/*.json`](../src/core/identify/platforms/data/) derrière un
  chargeur typé de 28 lignes. Elles vivent encore dans le core plutôt que dans
  les modules providers — acceptable tant que ce sont des données de build, à
  déplacer si un provider veut les tenir à jour lui-même.
- **`BarcodeLookupPayload` — ouvert.** Trouvé 2026-07-25 en élargissant
  `blindnessGuard` aux **clés d'objet non quotées** : le core déclare un slot
  nommé par provider. Contenu par l'allowlist du guard, design à trancher —
  détail dans [backlog.md](backlog.md).
- ~~`providerQueue.ts` — `PROVIDER_CONCURRENCY` / `PROVIDER_MIN_INTERVAL_MS`~~ —
  **réglé 2026-07-25** : chaque provider déclare `minRequestIntervalMs` /
  `maxConcurrentRequests` dans son `info`, `providerQueueSettings` dérive la
  forme de queue. Ces clés n'étaient pas quotées, donc invisibles pour
  `blindnessGuard` — c'est le mode de fuite à surveiller.

## 🟡 P3 — Magic numbers beyond the barcode scorer

Le scoring barcode est centralisé dans
[`evidence/scoring.ts`](../src/core/identify/evidence/scoring.ts) (35 constantes
nommées et groupées). Les trois fichiers cités par l'audit d'origine ont depuis
été découpés :

- ~~`metadataConsensus.ts` — `0.5 + n * 0.15` (×3)~~ — **réglé** : un seul
  `agreementConfidence()` dans [`consensus.ts`](../src/core/enrich/consensus.ts).
- ~~`metadataProviderSelection.ts`, `priceResolver.ts` — seuils~~ — **réglé** :
  `selection.ts` et `commerce/pricing/resolver.ts` n'ont plus aucun littéral
  décimal.
- ~~4 littéraux décimaux dans `merge.ts`~~ — **fait 2026-07-25**, et le compte
  était très sous-évalué : le seuil d'alignement `0.58` était recopié **32
  fois dans 17 fichiers**, alors que la constante nommée
  `METADATA_TITLE_ALIGN_FLOOR` existait déjà dans
  [`identityThresholds.ts`](../src/core/enrich/titles/identityThresholds.ts) et
  n'était utilisée que par 3 modules. Tous les sites d'alignement l'utilisent
  désormais (dont un `Math.max(METADATA_TITLE_ALIGN_FLOOR, 0.58)` tautologique
  chez No-Intro).
- **Attention, à ne pas unifier** : il reste ~39 `confidence: 0.58` dans les
  providers. Même valeur, concept sans rapport (la confiance d'un fait
  title-matched). Les fondre dans la constante d'alignement coupleraient deux
  réglages indépendants — régler le seuil de titre changerait silencieusement
  la confiance de tous les faits providers.

## 🟢 P4 — Linguistic vocabulary → replace with maintained libraries

Le gros morceau restant, et le seul chantier P1–P4 encore réellement ouvert.

- ~~Chiffres romains (`ROMAN_MAP`)~~ — **réglé** : dépendance `romanizr`.
- **Mots-nombres** — `englishNumberWordToDigits`
  ([`titles/numberWords.ts`](../src/core/enrich/titles/numberWords.ts)) : maison
  et **anglais seulement**. Un `words-to-numbers` couvrirait plus de notations,
  mais rien de solide côté FR.
- ~~**Codes région / langue** → `iso-639-1` + `i18n-iso-countries`~~ —
  **recommandation retirée 2026-07-25, elle était fausse.** Deux choses
  distinctes avaient été mises dans le même sac :
  - `LISTING_REGION_TERMS` n'est pas une liste de langues, c'est un
    **vocabulaire de bruit** : chacun de ses termes est retiré des titres
    marketplace. La moitié n'est pas ISO du tout (`pal`, `ntsc`, `secam`, `vf`,
    `version`, `import`), et surtout un jeu ISO complet **casserait** le
    nettoyage : `be`/`it`/`no`/`is` sont des codes ISO 639-1, et « Let It Be »
    devient « Let ». Vérifié, puis épinglé par
    [`listingRegionTerms.test.ts`](../src/core/identify/listingRegionTerms.test.ts).
    Cette liste doit rester **courte et fermée** — sa croissance est le signal
    d'alerte, pas son incomplétude.
  - La taxonomie d'affichage (`fr/eu/wor/uk/us/jp`) n'a pas d'équivalent ISO
    (`wor`, `eu`) : c'est une convention de région console. Le vrai défaut
    n'était pas l'absence de dataset mais la **duplication** — le même tableau
    ordonné était réécrit dans trois fichiers et `USER_VISIBLE_REGIONS` en
    recopiait un sous-ensemble à la main. **Réglé** : une seule table
    `DISPLAY_REGIONS` dans
    [`locale/preference.ts`](../src/core/locale/preference.ts) dont tout le
    reste dérive, et le `regionRank` partagé (qui résout en plus les alias
    providers `au`/`sp` → `eu`, ce que les copies locales ne faisaient pas).
- ~~**Stopwords / tokens génériques**~~ — **fait 2026-07-25**, et le constat
  était déjà à moitié périmé : `SUFFIX_EXCLUDED_NOISE` (filtre sur
  `LISTING_NOISE_TERMS`) et `RESOLVER_GENERIC_TOKENS` (union de quatre
  taxonomies) étaient **déjà dérivés**, comme
  `NON_CANONICAL_CONTEXT_TOKENS`. Le seul résidu était le token `"video"`,
  rajouté à la main dans **trois** sites de comparaison
  (`resolve.ts`, `matchUtils.ts`, `titleUtils.ts`) faute d'avoir un
  propriétaire. Il est maintenant déclaré une fois dans
  `IDENTITY_MEDIA_CATEGORY_TOKENS` — la moitié qualifiante de « video game » /
  « jeu vidéo » — et les trois patchs ont disparu. Il reste volontairement
  **hors** de `LISTING_NOISE_TERMS` : c'est un token qu'on déprécie comme
  distinctif, jamais qu'on retire d'un titre (sinon « Music Video » → « Music »).
- **Jargon vendeur** — `LISTING_CONDITION_TERMS`, `LISTING_FORMAT_DEFINITIONS`,
  `GAME_EDITION_DEFINITIONS`, `GAME_CLASSICS_KEYWORDS`. Pas de source externe
  propre. Ils sont maintenant **structurés** (des définitions avec des traits,
  dont les autres listes se dérivent) plutôt que juxtaposés, ce qui était le
  vrai risque. Les garder comme données et laisser le moteur de corroboration
  faire le tri reste la bonne réponse.
- Résidu suivi séparément : la table de phrases de `tokenEquivalents.ts`
  (voir [word_list_audit.md](word_list_audit.md)).

## ⚪ Keep — real-world standards (cite, don't apologise)

- `VALID_PEGI_AGES = {3,7,12,16,18}` — the actual PEGI rating set.
- ISBN `978/979` (`BOOK_BARCODE_PREFIX` in `scoring.ts`) — GS1 Bookland product range.
  Audio/music company-prefix heuristics were **removed** (2026-07-05); music typing
  uses specialist providers, not a fake GS1 type table.
- `LOCALE_LANGUAGE_ORDER = ["fr","en"]` — a business/locale preference; fine, but
  belongs in config/env, not a code constant.

---

## Ordre recommandé (mis à jour 2026-07-25)

1. ~~**P4 codes région / langue**~~ — **fait 2026-07-25**, mais pas comme prévu :
   la piste ISO était mauvaise (voir P4). Ce qui a été corrigé, c'est la
   duplication de la taxonomie d'affichage.
2. ~~**P4 stopwords**~~ — **fait 2026-07-25** : les listes étaient déjà
   dérivées, seul le token `"video"` était patché à trois endroits.
3. ~~**Résidus**~~ — **fait 2026-07-25** : seuil d'alignement nommé partout (32
   sites), phrases de `boardGameSignal.ts` passées en vocabulaire dérivé.

**Les trois points de cet ordre sont soldés.** Ce qui reste du P4 est assumé :
le jargon vendeur est de la donnée maison (aucune source externe propre), et
les mots-nombres restent anglais-only faute d'équivalent FR fiable.

> **Leçon** : avant de remplacer une liste maison par un dataset complet,
> vérifier ce que la liste _fait_. Un vocabulaire de reconnaissance gagne à être
> complet ; un vocabulaire de **suppression** appliqué à des titres gagne à être
> minimal — le compléter le rend destructeur.

Le jargon vendeur reste volontairement de la donnée maison : aucune source
externe propre n'existe, et il est désormais structuré en définitions dont les
autres listes se dérivent.

---
