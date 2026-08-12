# Backlog

> Dernière vérification : **2026-08-11** (border-radius fullscreen Location/BREAK → fait ; foil Pokémon intégration à terminer).
> Index docs : [README.md](README.md).

## Plan perf métadonnées — terminé (2026-07-25)

Suite de l'audit refresh (#1 passes parallélisées et #2 split des pools déjà
livrés).

| Priorité | Item                             | Détail                                                                                                                                                                                                                                                                               |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~#3~~   | ~~Client HTTP partagé~~          | **Fait 2026-07-25** — `src/lib/http/httpClient.ts` : timeout par défaut, signal d'abort ambiant, dédup des GET identiques en vol. Tous les appels `src/providers` + `src/core` y passent (guard test).                                                                               |
| ~~#4~~   | ~~Correctifs ciblés~~            | **Fait 2026-07-25** — `retry()` par défaut 5 → 3 (aucun appelant ne s'appuyait sur 5 ; les jobs background étaient déjà à 3) ; FlareSolverr : solve par défaut 30 s (`FLARESOLVERR_MAX_TIMEOUT_MS`) et abandon au-delà de 45 s d'attente en file (`FLARESOLVERR_MAX_QUEUE_WAIT_MS`). |
| ~~#5~~   | ~~Mode light-refresh~~           | **Fait 2026-07-25** — `src/core/enrich/lightRefresh.ts` : fiche à cover canonique + titre aligné + galerie complète + prix < 7 j ⇒ la passe scrape est sautée entièrement (même les fiches épinglées). Un manque de capability Tier 0+1 l'emporte toujours.                          |
| ~~#6~~   | ~~Double-throttle admin-enrich~~ | **Fait 2026-07-25** — la route ne fait que stamp + enqueue ; le rythme réel est celui du pool I/O background. Le `runWithConcurrency(2)` en plus ne freinait que la réponse admin.                                                                                                   |

**Contrainte post-#2 levée 2026-07-25** : les queues par provider ne sont plus
toutes en concurrency 1. Chaque provider déclare `minRequestIntervalMs` /
`maxConcurrentRequests` dans son `info` ; `providerQueueSettings` en dérive la
forme de la queue (scrape, `rateLimited` ou intervalle déclaré ⇒ sérialisé ;
sinon `API_PROVIDER_CONCURRENCY` = 3). Les deux tables id → valeur du core ont
disparu.

## Ouverts

| Priorité | Item                         | Détail                                                                                                                     |
| -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ~~P1~~   | ~~TCG — plein écran holo + dos~~ | **Fait** — foil masqué (CSS/WebGL), flip Face/Dos, dos pack (print > set > pack). Plus de `Shelf.cardBackUrl`. Voir [tcg_support.md](tcg_support.md) §6. |
| ~~P2~~   | ~~TCG — border-radius fullscreen (Location / BREAK)~~ | **Fait** — clip *dans* le `OrientedMediaRotator` (pas d’ancêtre `clip-path` au-dessus du `rotate`) + radii pré-rotate `3%/4%` (`cardFaceRadius` / `cardFaceClipPath`). Portrait et paysage (BREAK / Location). |
| **P1**   | **TCG — foil Pokémon : terminer l’intégration** | Pack + dumps CDN **branchés** ; la **fidélité** n’est pas finie. **(A) WebGL** — vérifier leaf par leaf Live/Unity (app / playroom Comparer) vs Placarr (`materials` + frags GLES) : light/tilt/TBN, CC, scrolls `_Time`, pas de wash. **(B) CSS** — adapter **depuis Live** (plaques + intention frag) ; Simey / poke-151 = **appui d’analyse** seulement (mixes, composition) — **pas** les mêmes layers → adaptation intelligente (pas de port aveugle). Contrats : [foil_effects.md](foil_effects.md), [foil_css_sources.md](foil_css_sources.md). |
| ~~P3~~   | ~~TCG — Pocket effets~~    | **Supprimé** (jamais imprimé). Code Pocket retiré. |
| P2       | TCG — autres jeux            | Pokémon (TCGdex, prix en €), Magic, Yu-Gi-Oh gratuits ; One Piece / Dragon Ball via clé apitcg.                            |
| P2       | Regroupement des doublons    | Transform d'affichage générique (tous types) : `Elsa foil ×3`. Voir [tcg_support.md](tcg_support.md) §4.                   |
| P2       | Recadrage libre à 4 coins    | Redressement de perspective façon scan iPhone — voir ci-dessous.                                                           |
| P3       | `loose` est une variante     | L'enum `Condition` mélange état et complétude — voir ci-dessous.                                                           |
| P3       | Vue 3D retournable           | Cartes : livré (Face/Dos). À étendre aux jeux / boîtes ensuite.                                                              |
| P3       | Revoir title-IDF (`data/indexes/title-idf`) | Index DF titres offline (`token-df.json`, `pnpm title-idf:update`) — découvert late, opaque. Clarifier / documenter le contrat, décider si on garde le dossier top-level, le merge ailleurs, ou on simplifie le chemin (qui build, qui lit, fallback sans fichier). Voir `tokenCorpusIndex.ts` + [archive/word_list_audit.md](archive/word_list_audit.md). |
| ~~P3~~   | ~~Renommer / scinder `data/<pack>/foil/`~~ | **Fait** — `cards/{set}/{lang}/{card}/` + `foil/` rendu + `catalog.sqlite` + `cards-index.json` v1 + URL `/assets/<pack>/…` + `staging/`. Voir [data-layout.md](data-layout.md). |
| P3       | Audit mécanismes temporaires oubliés | Passer code + docs + routes data (hors `docs/archive/`) à la recherche de shims / dual-path / « transition » / « legacy » / « compat » / « temporaire ». Ex. déjà retiré : fallback `/foil/` `.webp`↔`.png`. Pour chaque hit restant : **supprimer**, ou **documenter comme contrat permanent**. Dette déjà notée ailleurs : `croppedImageUrl`. |
| ~~P2~~   | Sync catalogue TCG local (fraîcheur) | **Fait** — sync auto `foilCatalogSync` (staleness) + manuel admin/CLI ; indexes data-only ; gaps admin/`foil:audit-gaps` ; APK vs réseau : [foil_apk_sources.md](foil_apk_sources.md). |
| P3       | ~~Foil CSS fallback (Simey / Pokebox)~~ | **Livré** — simey → `HoloShader` + `cssRecipes.ts` (pas `/foil/lorcana/web`). Contrat packs : [foil_effects.md](foil_effects.md). |

### Foil via TCG Live

**CLI :** `pnpm foil:pokemon` · `pnpm foil:pokemon:scrape` · `pnpm foil:pokemon:sources` · `pnpm foil:pokemon:index-cards` · audits via `tsx scripts/pokemon/audit*.ts` · `pnpm foil:lorcana` · `pnpm foil:lorcana:cards`.

**Infrastructure (extrait / pack) — largement en place ; intégration rendu = ouverte.**

| # | Tâche | Note |
| - | ----- | ---- |
| 0 | ~~Matrice sources~~ | `pnpm foil:pokemon:sources` |
| 1 | Catalogue sans device | Config-cache local ; **Malie** `databases`/`export` (amorce multi-lang) ; API op-core **TBD** |
| 2 | ~~Update CDN~~ | `pnpm foil:pokemon` |
| 3 | **WebGL — parité Live** | **À terminer.** Dump + `paperMaterial` branchés ≠ fidèle. Comparer Unity (app Mac / playroom) vs canvas Placarr leaf par leaf : drivers tilt (`_LightDirection` / camera / TBN), `_Time` idle, CastAndCure, masks WP. Corriger frags/binds/mats quand le Comparer diverge. |
| 4 | ~~Audit store~~ | `tsx scripts/pokemon/audit_store.ts` — shaders / masques / `cards.json` |
| 5 | **CSS — adaptation Live (+ Simey analyse)** | **À terminer.** Recettes `holoShadersPokemon` / `cssRecipes` branchées ; dosage + chorégraphie encore faux sur plusieurs leaves (ex. SunPillar wash, Ultra Gold idle). Vérité = Live ; Simey = structure/mixes **sans** bijection de layers — adapter intelligemment. Checklist : [foil_css_sources.md](foil_css_sources.md) §2. |

**Scrape intelligent (anti soft-ban) — règles figées :**

1. **Inventaire union** — APK/config (`card-database` + setnums) ∪ Malie DBs → `scrape-inventory.txt`. Malie-miss → `logs/malie-unavailable-stems.txt` ; CDN-miss → `logs/cdn-unavailable-stems.txt` (+ `scrape-availability.json`). Optionnel : dump `manifest_{lang}_{bucket}` puis intersect.
2. **Une langue à la fois** — défaut `fr`, puis `--langs en` (etc.).
3. **Un seul process** — jamais 2 `update.ts` en parallèle.
4. **Dir primaire** — `dirProbe=primary` (`10101_0000`) ; `--probe-all-dirs` seulement pour résidus rares.
5. **Content base** — `GameSettings.json` → `android_contentpath` (host non stable) ; fallback synthétique.
6. **Cadence** — défaut `workers=1` / `delay=0` (séquentiel RTT-paced, comme ptcgl.dev) ; HTML `Request blocked…` = pause + cooldown persisté ; XML `AccessDenied` = miss honnête.
7. **Skip existing** — reprise gratuite ; ne pas re-HEAD le catalogue déjà sur disque.

```sh
pnpm foil:pokemon -- --langs fr
pnpm foil:pokemon -- --langs en   # après FR + soft-ban dissipé
# Admin Extract Pokémon = inventory APK∪Malie → CDN (misses logged)
```

**Dépendance :** foil runtime = CDN ; catalogue Malie et/ou `card-database-*` → `catalog.sqlite`.

### Recadrage manuel — livré (2026-07-26)

Le recadrage automatique est **retiré** : il réécrivait l'URL stockée vers un
fichier dérivé `_crop`, ce qui détachait la couverture de son attachment (perte
de la source et de la région, cf. [cover-crop-breaks-provenance]) et ne laissait
aucun retour en arrière. Il se trompait aussi souvent : logos dont la marge est
voulue, visuels de cartes déjà bord à bord.

Retiré aux 4 endroits qui l'appliquaient sans qu'on le demande :
`POST /api/items` (création + édition), `resolveMetadataCoverHero`, et le défaut
`trim` de `POST /api/upload` (devenu opt-in). La géométrie est conservée sous
forme de **suggestion** : `suggestCropBox()` renvoie un rectangle, `applyCropBox()`
l'applique — rien ne recadre sans qu'on le lui dise.

L'outil manuel est en place (`ImageCropModal`, `react-image-crop` v11, ISC,
115 Ko, aucune dépendance runtime) : un bouton sur **chaque image de la
galerie**, au-dessus de l'agrandissement, visible d'emblée au tactile via
`@media (hover: hover)`.

Ce qui rend le recadrage réversible :

- Le rectangle appliqué est mémorisé dans un sidecar `_crop.json`, à côté du
  fichier produit — pas en base, parce que le même éditeur sert les objets, les
  étagères et les avatars. Rouvrir affiche le cadrage **en cours**.
- L'éditeur repart toujours du fichier d'origine, jamais d'un recadrage
  précédent : réajuster dix fois ne dégrade rien.
- « Auto » repropose la suggestion de `suggestCropBox()`, « Rétablir
  l'original » revient à l'image entière.
- Une réécriture porte le même nom de fichier, donc l'URL affichée reçoit un
  `?v=` (affichage seul, la valeur stockée reste propre) — sans quoi la vignette
  ne se rafraîchissait qu'au rechargement de la page.

Reste ouvert :

- **Dette liée** : `croppedImageUrl` traverse encore ~30 sites de
  `storage.ts` / `croppedCoverSync.ts` / `syncItemAfterMetadataStore.ts` alors
  qu'il ne transporte plus qu'une couverture non recadrée. Renommage à faire
  avec le mode libre, pas avant — c'est une couche peu couverte.
- **Sidecars orphelins** : supprimer un `_crop.jpg` laisse son `_crop.json`.
  Inoffensif, à balayer si le dossier `uploads` est un jour nettoyé.

### Recadrage libre à quatre coins (redressement de perspective)

Le recadrage livré est **rectangulaire** : quatre poignées liées, ça découpe.
La demande suivante est un **quadrilatère à quatre coins indépendants**, façon
scan de document iPhone : on pose les coins sur une photo prise de biais et
l'image est redressée à plat.

Ce n'est pas un réglage du recadrage actuel, c'est une autre opération —
une découpe versus une **homographie**. Deux conséquences vérifiées :

- **`sharp` ne sait pas le faire.** Il expose `affine()` (matrice 2×2 +
  translation), qui ne peut pas représenter une perspective : un trapèze ne
  redevient pas un rectangle par transformation affine. Vérifié sur sharp
  0.35.2 / libvips 8.18.3, aucune méthode `perspective`/`distort`.
- **`react-image-crop` ne sait pas le faire non plus** : la lib est
  rectangulaire par conception. Le mode libre demande un éditeur maison —
  overlay SVG, 4 points glissables en pointer events (souris + tactile), tracé
  du polygone.

Chemin proposé, sans nouvelle dépendance native :

1. **UI** : un sélecteur de mode dans `ImageCropModal` — « Rectangle » (la lib
   actuelle) et « Libre » (l'éditeur quadrilatère). Les deux modes partagent le
   même enregistrement et le même retour arrière.
2. **Serveur** : homographie en JS pur dans `imageTrim.ts` — lire les pixels
   bruts via `sharp().raw()`, calculer la matrice inverse depuis les 4 coins,
   échantillonner en bilinéaire, ré-encoder par sharp. Sur une image de carte
   (~1468×2048, 3 Mpx) c'est de l'ordre de quelques centaines de ms, à borner
   comme `MAX_TRIM_PIXELS` le fait déjà.
3. **Persistance** : le sidecar `_crop.json` accueille soit une `CropBox`, soit
   un quadrilatère de 4 points — la réouverture restaure l'un ou l'autre.

Alternative écartée : OpenCV / ImageMagick feraient ça en une ligne
(`-distort Perspective`), mais ajoutent une dépendance native au conteneur
pour une seule fonction.

### Variantes par exemplaire — livré (2026-07-27)

`Item.variant` porte la finition de l'exemplaire. Le sélecteur de tirages la
demande à l'ajout quand le tirage existe en plusieurs finitions — une seule
finition n'est pas un choix, elle est appliquée sans demander — et le formulaire
d'objet permet de la corriger après coup, re-cliquer l'option active l'efface.

**Les options ne sont pas persistées** : elles sont demandées au provider par
clé de tirage (`lookupPrint`). Première tentative, abandonnée : les publier
comme faits structurés. `Metadata.facts` est reconstruit depuis les
`FieldEvidence` après chaque stockage, donc un `kind` maison devait survivre à
**deux** listes blanches distinctes pour arriver au client — et n'aurait été
qu'une copie qui dérive quand un set est corrigé. Ce qu'un tirage _est_
appartient au provider.

La demande se généralise au-delà des cartes — une PS3 a ses modèles (Phat,
Slim, Super Slim), un jeu ses éditions (Standard, GOTY, Collector) — et le
mécanisme est déjà là : `searchPrints` n'a rien de spécifique aux TCG, c'est
« choisir quelle variante exacte on possède ». Étendre aux consoles = un
provider qui renvoie des candidats de modèle, rien à changer dans le core ni
dans le sélecteur.

**La distinction à ne pas perdre**, et c'est elle qui porte tout le reste :

|                                | Nature                                                                  | Où ça vit                                            |
| ------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Modèle / édition / tirage      | un **autre objet** : métadonnées, photos, prix distincts                | identité — `Metadata` + `printKey`, choisi à l'ajout |
| Finition (foil, reverse, holo) | **le même objet imprimé autrement** — même carte, même numéro, même set | l'**exemplaire** — `Item`                            |

Confondre les deux est le piège. Si le foil devenait une entrée de métadonnées
séparée, on aurait deux fiches « Elsa 42/204 » et chaque comptage, prix et
galerie doublerait.

Reste à faire :

1. Le **regroupement des doublons** s'appuie dessus : c'est ce qui fait marcher
   « Elsa foil ×3 » sans mélanger le foil et le classique.
2. Faire migrer `Condition.loose` sur cet axe (voir ci-dessous) — le champ est
   générique exprès, ce n'est pas une colonne TCG.
3. Étendre aux **consoles** : un provider qui renvoie des candidats de modèle.
   Rien à changer dans le core ni dans le sélecteur.

Réserve pour le **matériel** : l'axe variante d'une console est surtout le
_modèle_, donc de l'identité, pas de la finition. Les consoles ont besoin de
meilleurs candidats `searchPrints`, pas d'une finition par exemplaire. Besoin
différent, même mécanisme.

### `Condition.loose` est de la variante déguisée en état

`new` / `used` / `damaged` décrivent la **santé** d'un exemplaire ; `loose`
décrit **ce qu'on possède** (cartouche seule vs boîte complète) et pilote une
gamme de prix distincte. Les deux axes cohabitent dans la même enum.

Conséquence pratique : le regroupement des doublons (P2) exclut l'état de sa
clé mais doit y inclure la variante — tant que `loose` vit dans `Condition`,
un jeu loose et le même jeu complet se regrouperaient à tort. À traiter quand
l'axe variante existera (chantier TCG), pas avant : la migration touche des
données réelles.

### Vue 3D retournable — nice to have

Le plein écran des **cartes** aura un onglet dos + un retournement 3D
(voir [tcg_support.md](tcg_support.md)). L'idée vaut au-delà : une jaquette de
jeu a un dos, un livre a une quatrième de couverture. On a déjà les galeries
par provider avec des rôles d'attachment (`cover_back` existe dans la
taxonomie d'observations), donc la donnée est en partie là.

À faire seulement après les cartes, et sans généraliser à l'aveugle : tous les
objets n'ont pas de dos exploitable, et une boîte de jeu de société se
photographie sous six faces, pas deux.

| Priorité | Item                        | Détail                                                                                                          |
| -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P1       | Build Docker jamais vérifié | 4 causes de casse corrigées à l'aveugle, **aucun build complet n'a abouti**. Voir ci-dessous avant de déployer. |

### Build Docker — corrigé sans preuve

Découvert 2026-07-26 en durcissant l'image : `docker build` échouait, et pas à
moitié. Quatre causes indépendantes, révélées une par build (~8 min chacun) :

1. `postinstall: prisma generate` sans le schéma dans le stage `deps`
   (introduit par le commit Prisma 7 de cette branche) ;
2. `next.config.js` importe un `.ts` — illisible par le Node 22.16 de l'image
   alors que l'hôte tourne en 26 (ancien, commit `feat(media)`) ;
3. Node 26 ne fournit plus `corepack`, donc `pnpm` introuvable (conséquence
   du correctif 2) ;
4. `next build` charge `auth/config.ts`, qui **throw** sans `NEXTAUTH_SECRET`.

Les quatre sont corrigées, et un build lancé côté utilisateur le 2026-07-26 a
confirmé qu'il n'y a **pas de cinquième cause** : `pnpm run build` passe (402 s)
et le stage runner se déroule jusqu'au bout. Il a buté sur un défaut de mon
propre durcissement, corrigé depuis :

- `RUN chown -R node:node /app` recursait sur `node_modules` (~900 paquets) —
  55 s et une couche entière réécrite. L'appartenance est désormais posée par
  le `COPY --chown`, gratuitement, et le `chown` explicite ne touche que les
  points de montage (vides à ce stade).
- l'avertissement `SecretsUsedInArgOrEnv` a disparu : le placeholder de build
  est passé en ligne au `RUN` au lieu d'un `ENV`, donc il ne rentre plus dans
  les métadonnées de l'image. `docker build --check` ne renvoie plus rien.

**Reste à vérifier** : un build complet après ces deux correctifs (le stage
`builder` sera réinvalidé, ~7 min), puis que le conteneur démarre bien en
`node` et non en root.

**Leçon de méthode** : lancer `docker build` _avant_ de toucher à l'image. Un
seul build aurait montré que la chaîne était déjà morte, au lieu d'un build par
couche découverte.

| Priorité | Item                                     | Détail                                                                                                                       |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| P2       | `GameLookupInputs` : buckets marketplace | Deux slots nommés (`ebay`, `freakxy`) et un ordre de préférence provider dans `pickMovieTitleFromListings`. Voir ci-dessous. |

### `BarcodeLookupPayload` — fait 2026-07-25

Les 10 slots nommés par provider ont quitté le core. Chaque module déclare
désormais **son type** (`declare module` sur `BarcodeLookupSlots`) et **sa
valeur vide** (`barcodeLookupSlots`), côte à côte dans le même fichier.

Le point qui avait fait échouer la première tentative est réglé :
`createEmptyBarcodeLookupPayload()` **exige** les défauts en paramètre, fournis
par `barcodeLookupSlotDefaults()` — le seul module qui importe le registre.
Construire un payload sans eux est une erreur de compilation, au lieu d'un
`undefined` silencieux derrière un type qui promettait une valeur.

Deux garde-fous, tous deux vérifiés par mutation :

- `barcodeLookupSlots.test.ts` apparie, dans la source de chaque provider, les
  slots **typés** et les slots **enregistrés** — l'augmentation étant effacée à
  la compilation, aucun contrôle runtime ne peut voir un slot typé mais absent ;
- le même fichier vérifie qu'aucun slot n'est `undefined` et que les slots
  tableau ne sont pas partagés entre deux payloads.

**Reste** : les slots à clé abrégée (`ss`, `pc`, `sd`, `ice`, `mb`, `ol`,
`amc`, `leDenicheur`) appartiennent chacun à un provider mais leur clé ne
ressemble pas à son id — le guard ne les voit pas. Même mécanisme applicable,
sans urgence. Les six `cal*` sont un cas à part : une seule tâche provider que
le core éclate par type de média.

### `GameLookupInputs` — ouvert, et bloqué par le payload

`gameLookup.ts` nomme deux buckets marketplace (`ebay`, `freakxy`), et
`pickMovieTitleFromListings` encode une **préférence de provider** : eBay avant
AchatMoinsCher avant ChasseAuxLivres. C'est du biais de classement dans le
core, pas seulement un nom en dur.

**Tentative du 2026-07-26 — annulée.** Le design semblait évident : chaque
source déclare `info.listingTitleQuality`, le core trie dessus. Il bute sur
ceci : pour lire le poids d'un provider, le core doit le **nommer**, et les
trois buckets ne se déduisent pas de leur slot (`amc` ≠ achatmoinscher,
`calDvd` ≠ chasseauxlivres). Le prototype a introduit trois
`listingTitleQualityForProvider("ebay")` dans `lookups.ts` — que
`blindnessGuard` a immédiatement rejetés, à raison. On échangeait un ordre
documenté contre trois ids quotés dans le core.

**Ce qui débloquerait** : le même chantier que le payload. Une fois les slots
possédés par les providers (`barcodeLookupSlots`), le registre sait quel
provider remplit quel bucket, et le poids se lit sans jamais nommer personne.
Faire les deux ensemble, pas l'un sans l'autre.

**Piège relevé au passage, à ne pas retenter** : `sourceWeight` semble être le
poids tout trouvé, mais il classe ces trois sources dans **l'ordre inverse**
(chasseauxlivres 0.16 > achatmoinscher 0.12 > ebay 0.10). Il note la fiabilité
d'une source comme _preuve d'identité_, pas la qualité de ses titres bruts : un
comparateur de livres est une meilleure preuve et un bien plus mauvais nom de
DVD. Deux concepts, deux traits — s'en servir aurait inversé le comportement en
silence.

Les deux fichiers restent sur `ALLOWED_PROVIDER_KEYS` dans
[`blindnessGuard.test.ts`](../src/core/catalog/blindnessGuard.test.ts).

Le reste du fichier = journal / historique.

| Priorité   | Item                                         | Détail                                                                                                                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**P0**~~ | ~~SSOT identité / covers / liens~~           | **Fait 2026-07-24** — étapes 1–7 + dead hardware titleMatch + present purge unique.                                                                                                                                                                                                                                                           |
| ~~**P1**~~ | ~~List present sans `priceOffers.rawValue`~~ | **Fait 2026-07-24** — covers persistées à l’écriture prix ; `itemListMetadataInclude` sans priceOffers.                                                                                                                                                                                                                                       |
| ~~**P2**~~ | ~~Word-lists → consensus / IDF~~             | **Fait 2026-07-24**: DRY → `IDENTITY_*` ; IDF MVP + offline DF + boot/cron ; GENERIC fully listing/IDENTITY-derived.                                                                                                                                                                                                                          |
| ~~**P2**~~ | ~~Scrape-yield / call efficiency~~           | **Fait 2026-07-24** — SearchYield durable + LaunchBox FTS measure + No-Intro dump path. Voir [archive/scrape_yield.md](archive/scrape_yield.md).                                                                                                                                                                                                              |
| ~~**P2**~~ | ~~FlareSolverr vs workers~~                  | **Fait 2026-07-24** — cap concurrency ≤3 si `FLARESOLVERR_URL` ; logs outcomes Flare ; `WORKER_CONCURRENCY_FORCE` pour override.                                                                                                                                                                                                              |
| ~~**P3**~~ | ~~Découpe god files~~                        | **Fait 2026-07-24**.                                                                                                                                                                                                                                                                                                                          |
| ~~**P3**~~ | ~~Local full-set / dump sync~~               | **First cut 2026-07-24** — iCollect + LaunchBox. **No-Intro Tier0 + checksum path + DAT sync + enrich wire + client dump hash 2026-07-24**.                                                                                                                                                                                                   |
| ~~**P3**~~ | ~~LaunchBox / dumps~~                        | **LB prebuild 2026-07-24** ; **No-Intro multi-DAT Tier0 2026-07-24** ; **FTS measure 2026-07-24** (`pnpm launchbox:bench-fts`).                                                                                                                                                                                                               |
| ~~**P4**~~ | ~~Table GS1 audio~~                          | **Différé 2026-07-24** — GS1 n’a pas de plage type « Bookland » pour la musique (seulement des company prefixes). Les heuristiques audio ont été **supprimées** (2026-07-05) ; le typage musique = spécialistes Discogs/MusicBrainz/Deezer. Réouvrir seulement avec une allowlist prouvée + goldens untyped (pas une table GS1 « complète »). |
| ~~**P4**~~ | ~~Server dump hashing~~                      | **Différé 2026-07-24** — `hashRomFile` client suffit ; dumps ne vivent pas sur le serveur. Réouvrir seulement si upload / worker / batch folder ingest devient un besoin produit.                                                                                                                                                             |

**Ne plus rouvrir sans raison** : blindness allowlist vide, merge dé-biaisé, workers hors Next, URL-first prix + external-links, corpus barcode 21/21, debias covers traits, cluster confidence + platform pick decide-late, GENERIC→IDENTITY, title-IDF offline index, No-Intro dump path, AUDIO-1/GS1, server dump hashing.

---

## État actuel (snapshot)

| Métrique                  | Valeur                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| Providers audités         | **46**                                                              |
| Mapping `ok`              | **45** · `empty` 1 · `partial` 1 · `blocked` 1 · `error` 0          |
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

| Priorité   | Item                                                       | État                              | Prochaine action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**P2**~~ | ~~Cluster confidence `sourceScore` + tier observations~~   | **Fait 2026-06-29**               | `barcodeClusterObservationContribution` (= `barcodeEvidenceTier × CLUSTER_CONFIDENCE.observationTierScale` + `barcodeEvidenceObservationSourceWeight`) branché dans le base score de `scoreEvidenceCluster` ; `observationTierScale: 0.01`. Leaders/platformKeys **inchangés**, seules les 6 valeurs `compile.confidenceLock.test.ts` montent (+0.06 sur cas ancrés : Ghost Recon 0.55→0.61 / 0.45→0.53 / 0.47→0.53, TMNT II Arcade 0.51→0.57 ; deux cas plafond 0.98 stables). Suite complète verte (1217). Cap `listingOnlyCap` intact (clusters listing-only restent ≤ 0.45).                                                                                                                                                                                                                                                              |
| ~~**P2**~~ | ~~`pickPlatformKey` tier-dominant~~                        | **Fait 2026-07-05**               | Decide-late en 2 passes (`platformPick.ts`) : pass 1 tier-agnostic (`barcodeEvidencePlatformAmbiguityWeight`) → `null` si scores proches ; pass 2 petit nudge tier (`observationTierScale: 0.05` + bonus canonique `0.22`) seulement si pass 1 tranche. Ghost Recon Classics / Island Thunder / PC consensus verrouillés dans `compile.confidenceLock.test.ts` + `platformPick.test.ts` + `observations.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **P5**     | Fixtures golden-master barcode (`tests/fixtures/barcode/`) | **Fait 2026-07-02**               | **21/21** enregistrées + REPLAY déterministe (slim, PC 429 retry, iCollect platform guard, HttpReplay brotli).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **P3**     | PicClick → eBay Browse API                                 | **Fait 2026-07-02**               | Module `ebay/` (OAuth, Browse + Catalog API, barcode multi-types) ; PicClick retiré. Sans clés eBay → no-op gracieux.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **P2**     | External-link systématique + refresh prix URL-first        | **Fait 2026-07-05**               | À chaque hit provider : `external-link` persisté (merge + write-back prix). Refresh réutilise `providerProductUrlsFromMetadataFacts` avant seek. Gate EAN retailers (Philibert/PrestaShop/Shopify/Okkazeo/CAL). Doc : [provider_external_links.md](provider_external_links.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **P2**     | Titres multilingues + région utilisateur                   | **Fait 2026-06-30**               | `regionOrderForUiLocale` / `languageOrderForUiLocale` dans `preference.ts` ; cookie `preferred-locale` sync client→API ; `withRequestUiLocale` sur routes items/shelves/explore/loans ; couverture read-time via `getCoverImage(item, locale)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **P4**     | Wikidata / Google Books champs ciblés                      | **Fait 2026-07-02**               | Wikidata : P136/P178/P123/P856 mappés (`resolver.ts` + tests). Google Books : champs étendus (`resolver.ts` + tests). Relancer `pnpm providers:audit:mapping` après cooldown quota TheGamesDB.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **P4**     | Provider **TricTrac** (`trictrac.net`)                     | **Abandonné 2026-07-05**          | Base FR intéressante mais **inaccessible sans auth CNRL** (toutes les routes `/api/*` → `login-silent`). Pas d’API publique, scrape déconseillé. **MyLudo** couvre le besoin metadata FR ; réouvrir seulement si TricTrac/CNRL propose un accès read-only officiel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **P4**     | Provider **MyLudo** (`myludo.fr`)                          | **Fait 2026-07-05 (partiel)**     | Module `boardgames` metadata : recherche titre + détail jeu (`fetch.ts`, `resolver.ts`), `external-link`, observations joueurs/durée/âge/note, `trustedRetailer`. **Barcode** : endpoint mobile existant mais résultats incohérents sans session → pas d’ancrage scan fiable ; reste metadata-only. Contact éditeur pour API officielle si besoin EAN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **P4**     | Provider **SensCritique** (`senscritique.com`)             | **Fait 2026-07-19 (multi-types)** | Module `senscritique/` : GraphQL GET `gql.senscritique.com`, `searchResult` + `product(id)`. Apports : note FR + votes, synopsis FR, genres FR, covers `/0/`. `requiresTitleAlignment` + guard catalogue. **Types** : games + books/comics + movies/TV + musics (`SENSCRITIQUE_UNIVERSES_BY_TYPE`). Pas d'EAN — name-search uniquement. `artists` souvent null (skip conscient).                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **P4**     | Provider **Full Set** (`full-set.net`)                     | **Fait 2026-07-10**               | Module `fullset/` : scraping `recherche.php?q=` + fiche item (⚠️ attributs HTML sur lignes séparées). Facts : **cote médiane FR** (kind `price`, « 15,00 € (177 annonces) »), **indice de rareté** (kind `rarity` inédit, « 18/100 »), genre/année/dev/éditeur. Gate plateforme strict (`fullSetHitMatchesPlatform` via `detectPlatformKey` sur le label console — un shelf console n'adopte jamais la cote d'un autre support, plateforme irrésolue = rejet) + gate catégorie « Jeux » + title alignment. ⚠️ **Pas de jaquettes** (correction vs évaluation) : la galerie fiche = photos d'annonces eBay (parfois d'un autre jeu !) et robots.txt interdit `/visuel/` → facts uniquement, aucun attachment (décision consciente). ⚠️ **429 agressif** sur requêtes rapprochées (ban long) → `rateLimited: true` + `mappingProbeRetry: true`. |
| **P4**     | Providers livres / BD-manga FR (nationaux)                 | **Fait 2026-07-17**               | File close — ~~Decitre~~ → ~~BD Fugue~~ → ~~Babelio~~ → ~~Planète BD~~ → ~~Vivlio~~ → ~~Izneo~~ → ~~Gibert~~ → ~~Canal BD~~ → ~~Furet~~. ~~Momie~~ / ~~Eurolivre~~ abandonnés (search cassé / 429). Exclus : AbeBooks (déjà), Indigo.ca, Walt’s, Hizuku, ActuaBD, boutiques locales. Détail : [§ Providers livres FR](#providers-livres--bd-manga-fr-2026-07-16).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ~~**P1**~~ | ~~Golden-master « vide honnête »~~                         | **Fait 2026-06-29**               | `compile.honestEmpty.test.ts` : marketplace-only sans ancre + DB miss (`confrontWithDatabase` mocké `null`) ⇒ `compileResultForType` renvoie `null`, même sur consensus de 3 marketplaces (majority noise). Encode la moitié manquante de la règle produit (l'autre moitié = `confidenceLock`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

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

> **Provider-blindness : migration TERMINÉE** — allowlist du guard `src/core/catalog/blindnessGuard.test.ts` **vide** (0 littéral provider hors `providers/` ; liste des ids **dérivée du registry**). Docs `archive/hardcoding_audit.md` / `archive/provider_agnostic_architecture.md` / `archive/unbiased_ranking.md` rebannerisées (tableaux = historique).

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
| ~~**P3**~~ | ~~ItemModal orchestration → react-query~~            | **Fait 2026-07-05** | `useItemModalMetadataMutations` pour preview/suggestions ; init par `sessionKey` (remount logique) — **0 disable `set-state-in-effect`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ~~**P1**~~ | ~~Double « durée » d'une même source~~               | **Fait 2026-07-03** | IGDB émettait ses durées avec `source: "How Long to Beat"` **codé en dur** (187 h ≠ vrais chiffres HLTB) : attribution corrigée (`IGDB`), arbitrage merge trait-driven (`timeToBeatSource` autoritaire écarte les durées des autres sources — l'ancien filtre par `kind` gardait la mauvaise génération), et **dédup par créneau sémantique** (principal/complétion, priorité max) dans `normalizeMetadataFacts` → les items déjà pollués s'auto-réparent à la lecture (vérifié sur 7 Days to Die : 4 facts → 2). Test : `facts.timeSlots.test.ts`.                                                                                                                                                                                                                                                                 |
| ~~**P1**~~ | ~~Scan : possédé sans code-barres invisible~~        | **Fait 2026-07-03** | `QuickScanModal` ne cherchait l'existant que par `barcodeExact` — la branche « match par titre » était **morte** (le pool ne contenait que des items à code-barres). Second pool par titre résolu (`/api/items?q=` : nom+aliases+titre metadata), fusion des candidats sans code-barres, alignement `isMetadataTitleAligned` (≥0.58) au lieu d'égalité stricte ; « Compléter » pose le code-barres scanné sur l'item existant. Vérifié : « 7 Days to Die » (sans code-barres) remonte sur le scan 711719268369.                                                                                                                                                                                                                                                                                                     |
| ~~**P1**~~ | ~~Serveur injoignable pendant les refreshs massifs~~ | **Fait 2026-07-18** | Next n’exécute plus l’enrichissement : stamp + enqueue `BackgroundWorkJob`, process dédié `pnpm worker` (`scripts/backgroundWorker.ts`, SKIP LOCKED). Compose `worker` (dev + prod). Cancel / orphan guard tiennent compte des jobs DB. Ancienne file in-process (`backgroundWorkQueue`) reste pour I/O CPU local (covers) et icollect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ~~**P2**~~ | ~~Priorité providers dynamique + progressive store~~ | **Fait 2026-07-19** | `providerRuntimeStats` (EMA latence / hit / cover) + cold-start via traits registry (`bookCoverPriority`, `slowScanScrape`…) ; soft timeout par provider ; merge progressif mid-batch quand cover/titre s’améliore. **Pas** d’early-stop ni blacklist. Concurrency worker défaut 4 (`WORKER_CONCURRENCY`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ~~**P1**~~ | ~~Mesure durée jobs (`lockedAt`)~~                   | **Fait 2026-07-19** | `completeBackgroundWorkJob` / fail terminal gardent `lockedAt` (clear `lockedBy` seul) → durée locked→finished mesurable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **P1**     | Garde-fou taille fixtures                            | **Fait 2026-07-02** | Une capture de sitemap non tronquée (362 Mo) dans un commit local bloquait le push (limite GitHub 100 Mo). Historique local **non publié** réécrit (blob purgé, arbre final identique), poussé en fast-forward ; `tests/fixtureSize.test.ts` verrouille < 25 Mo par fixture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **P1**     | Persistance données Docker                           | **Fait 2026-07-02** | Les uploads (`/app/public/uploads`) n'étaient montés sur aucun volume → perdus à chaque recréation du conteneur. Volumes nommés `placarr-uploads` + `placarr-cache` (index SQLite providers) ; `outputFileTracingExcludes` sort uploads/cache du standalone (cause de l'ENOSPC) ; `.dockerignore` exclut données runtime **et `.env`** (secrets hors layers). Migration : `docker cp` des uploads existants avant recréation.                                                                                                                                                                                                                                                                                                                                                                                      |

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

| Item                                                     | État                | Détail                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PriceCharting MatchContext** (aliases + stem + accept) | **Fait 2026-07-19** | Sac titres partagé ; stems franchise génériques (`lookupTitles`) ; accept `allowFranchiseStem` après hit search (sous-titre régional FR/EN vs titre court PC) ; filtre guides ; cas Spider-Man 2 FR, Baten Kaitos, Pokémon Yellow.                                                                               |
| **RAWG plateforme shelf + facts**                        | **Fait 2026-07-19** | `pickRawgSearchMatch` refuse Web-only ; sanitize plateformes (drop Web si consoles), stores (drop itch.io sur cartouche), tags fangame/GameMaker sur étagère console.                                                                                                                                            |
| **PriceCharting PAL sans cote → NTSC**                   | **Fait 2026-07-19** | Pages `pal-atari-2600/…` souvent à `-` ; si `isPal` et table vide, retry NTSC (Millipede, Jr Pac-Man, Galaxian, Joust, Football…).                                                                                                                                                                               |
| **PriceCharting productName / URL**                      | **Fait 2026-07-19** | Offres PC stampent le titre fiche ; à la lecture, `sourceUrl` → titre (slug) pour filtrer une mauvaise page (ex. FIFA 2002 → `…/fifa-2002-road-to-fifa-world-cup`).                                                                                                                                              |
| **Loose sans cote cartouche**                            | **Fait 2026-07-19** | Match Atari (n° console) ; faux amis FIFA World Cup / Bond ; « Loose » dans le titre → bucket loose ; CIB en ~estimate si pas de loose observé.                                                                                                                                                                  |
| ~~ChocoBonPlan / retailers titre faible~~                | **Fait 2026-07-19** | `listingLooksLikeMerchAccessory` étendu (coque/ipod + kits `lego`/`playmobil`/`funko`/`nendoroid`) ; gate dans `isMetadataTitleAligned`, attachments, et `priceListingSharesItemIdentity`. LEGO Minecraft ne matche plus un item « Minecraft » (seuil Choco 0.42 inclus) ; un vrai set LEGO shelf reste accepté. |

### P1 — Providers / scrape

| Item                                      | Action                                                                                                        | Doc                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| ~~**Apriloshop IQIT**~~                   | **fait** — `searchStrategy: iqit`, parse `product-miniature`, `id_product` extrait                            | `prestashop/parse.ts`      |
| ~~**Chasse aux Livres probe `empty`**~~   | **fait** — fallback FlareSolverr + hint probe                                                                 | `chasseauxlivres/fetch.ts` |
| ~~**PicClick probe timeout**~~            | **fait** — retry probe + `blocked` sur timeout scrape                                                         | `picclick/index.ts`        |
| ~~**ScreenScraper probe quota**~~         | **fait** — `blocked` si quota/credentials ; timeout 15s + retry search ; health via `jeuRecherche`            | `screenscraper/`           |
| ~~**TheGamesDB audit**~~                  | **fait** — `blocked` clé absente ou quota + `mappingProbeConfigHint`                                          | `thegamesdb/index.ts`      |
| ~~**Chasse aux Livres probe `partial`**~~ | **fait** — metadata adapter `map:ok`, observations typées ; gate EAN page vs slug interne ; hint FlareSolverr | `chasseauxlivres/`         |
| ~~**Apriloshop**~~                        | **retiré** — search/controller 403 côté boutique ; stack IQIT couverte par Chipweld                           | —                          |

### Providers livres / BD-manga FR (2026-07-16)

Critère : **catalogue national / large**, pas une boutique de quartier. Déjà en place : Booknode, Bedetheque, BDovore, BDphile, Chasse aux livres, Google Books, OpenLibrary, AbeBooks.

| Ordre | Provider          | Site              | Rôle attendu                                                                                                                                                                                                                        | État                                                                                                        |
| ----- | ----------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1     | **Decitre**       | `decitre.fr`      | Retailer national — ISBN → résumé, auteurs, éditeur, pages, couverture, prix                                                                                                                                                        | **Fait 2026-07-16** — module `decitre/` (JSON-LD Book + attributs, FlareSolverr)                            |
| 2     | **BD Fugue**      | `bdfugue.com`     | Spécialiste BD/manga national — ISBN, stock, prix                                                                                                                                                                                   | **Fait 2026-07-16** — module `bdfugue/` (Magento JSON-LD + attributs, FlareSolverr)                         |
| 3     | **Babelio**       | `babelio.com`     | Catalogue social FR — notes, tags, résumé, covers (scrape anti-bot / cookie)                                                                                                                                                        | **Fait 2026-07-17** — module `babelio/` (AJAX `/aj_recherche.php` + fiche microdata ; ISBN = evidence only) |
| 4     | **Planète BD**    | `planetebd.com`   | Critiques / notes BD-manga (pas un stock magasin)                                                                                                                                                                                   | **Fait 2026-07-17** — module `planetebd/` (mot-clef + fiche album)                                          |
| 5     | **Vivlio**        | `shop.vivlio.com` | Boutique ebook FR — JSON-LD Product/Book riche (ISBN, auteur, éditeur, série/collection, cover `cdn.vivlio.com`), **sans Cloudflare** sur le shop. ⚠️ Éditions **numériques** : l’ISBN ebook peut différer du print scanné en rayon | **Fait 2026-07-17** — module `vivlio/` (`?search=` + JSON-LD ; ISBN evidence only)                          |
| 6     | **Izneo**         | `izneo.com`       | Plateforme BD/manga numérique — titres, séries, covers                                                                                                                                                                              | **Fait 2026-07-17** — module `izneo/` (API web search/v2 + volumes + album)                                 |
| 7     | **Gibert**        | `gibert.com`      | Chaîne livres nationale neuf/occasion — ISBN + prix                                                                                                                                                                                 | **Fait 2026-07-17** — module `gibert/` (Magento + FlareSolverr)                                             |
| 8     | **Canal BD**      | `canalbd.net`     | Portail réseau librairies BD — ISBN BD, série, offres multi-librairies                                                                                                                                                              | **Fait 2026-07-17** — module `canalbd/` (recherche + fiche + HTMX offers)                                   |
| 9     | **Furet du Nord** | `furet.com`       | Chaîne livres Nord (stack Decitre / di-static) — ISBN + prix                                                                                                                                                                        | **Fait 2026-07-17** — module `furet/` (`/rechercher/result` + FlareSolverr)                                 |

**Secondaire abandonné** (2026-07-17) :

- **Momie** (`momie.fr`) — BD/manga niche ; recherche serveur cassée (POST `/transformsearch` → homepage) ; slug requis pour `/product/show/{isbn}/{slug}` → pas de découverte ISBN.
- **Eurolivre** (`eurolivre.fr`) — méta-recherche ISBN qui chevauche CAL/AbeBooks ; **HTTP 429** dès la première fiche, payload vide.

**Exclus** : librairies locales (Comptoir du rêve, Garganmots, Mouette à la page, Carnet à spirales, Tours & Détours, Gérard…), Hizuku (Réunion), Walt’s Comic Shop (US), Indigo.ca, ActuaBD (média), AbeBooks (déjà intégré).

Chaque entrée = module `providers/<id>/` + registry + tests + `pnpm providers:audit:mapping` (checklist [provider_integration_checklist.md](provider_integration_checklist.md)).

### P2 — Ranking sans biais (gros chantier)

Voir [archive/unbiased_ranking.md](archive/unbiased_ranking.md) et [archive/word_list_audit.md](archive/word_list_audit.md).

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

| Provider    | unused | Piste                                                      |
| ----------- | ------ | ---------------------------------------------------------- |
| wikidata    | ~11    | Champs ciblés **faits** ; reste = variantes langue (bruit) |
| googlebooks | 9      | Repasser mapping si régression suspectée (optionnel)       |
| rawg        | ~7     | ~~`clip` gameplay~~ **fait 2026-07-05** ; reste bruit      |

**Providers communautaires FR** :

| Provider     | Type visé                                          | Statut                                                                                      |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| trictrac     | metadata FR (rating, EAN, avis)                    | **Abandonné** — auth CNRL obligatoire ; MyLudo suffit pour metadata FR                      |
| myludo       | metadata FR (+ barcode si API OK)                  | **Fait partiel** — module metadata titre ; barcode non fiable sans session API              |
| senscritique | metadata FR multi-types (note, titre FR, synopsis) | **Fait 2026-07-19** — games + books + movies + musics                                       |
| full-set     | rareté + cote médiane FR (jeux rétro)              | **Fait 2026-07-10** — facts only (pas de jaquette exploitable), rate-limited (voir Roadmap) |

Ne pas chasser le compte `unused` brut — voir note audit 2026-06-23 dans l'historique.

#### P2-audit — Couplage nommage locale _(fait 2026-07-05)_

- `BGG_LANGUAGE_ROLE_MAP` / `mapBggLanguageToAttachmentRole` → `LANGUAGE_NAME_TO_ATTACHMENT_ROLE` / `mapLanguageNameToAttachmentRole` (`preference.ts`) — logique générique langue → rôle attachment, plus de nom provider dans le core.

### P5 — Qualité / tests

- ~~**Corpus barcode multi-types**~~ — **fait** : livre `9780140328721`, musique `0724384960650`, film `7321906123457`, JdS `3558380126133` + `3421272109517` (Mille Sabords, scan sans type)
- ~~**Fixtures replay** (`resolver.fresh.test.ts`)~~ — **fait 2026-07-02** : **21/21** enregistrées (`pnpm test:record:all`, un process par cas) ; rejeu déterministe via intercepteur partagé (`tests/helpers/httpReplay.ts`).
- ~~**Pricing manga** — lots/bundles filtrés ; mauvais volume PicClick quand seules annonces hors-sujet~~ **fait** (`priceListingVolumeConflictsWithItem`)

### P6 — Architecture core _(fait 2026-07-05)_

Réorganisation **`src/core/`** en 5 piliers (`identify`, `enrich`, `collect`, `commerce`, `catalog`) + coalescing modules couplés. Voir [core_architecture.md](core_architecture.md). Scripts de migration one-shot supprimés.

| Priorité   | Item                                        | État                          | Détail                                                                                 |
| ---------- | ------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| ~~**P3**~~ | ~~Découper `enrich/storage.ts`~~            | **Fait 2026-07-24**           | Orchestrateur + leaves media (gallery / cover-hero / item sync) ; re-exports inchangés |
| ~~**P3**~~ | ~~DRY titres identify ↔ enrich~~           | **Fait 2026-07-19 (partiel)** | `normalizeForTokens` → `enrich/titles/normalize.ts` ; matchers volontairement séparés. |
| ~~**P4**~~ | ~~`platformSources.ts` → data file~~        | **Fait 2026-07-19**           | Snapshots SS/LB → `platforms/data/*.json`.                                             |
| ~~**P2**~~ | ~~Imports core → `@/providers/icollect/*`~~ | **Fait 2026-07-19**           | Traits stampés ; allowlist blindness vide.                                             |

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

#### ~~AUDIO-1~~ — Détection audio GS1 _(différé 2026-07-24)_

- **État 2026-07-05** : préfixes audio heuristiques (`602`, `498`, `45`…) **supprimés** — pas fiables. Seul **Bookland 978/979** conservé (`BOOK_BARCODE_PREFIX`, test `scoring.prefix.test.ts`). Typage musique = **signal spécialiste registry** (Discogs/MusicBrainz/Deezer) + `compile.typeSelection.test.ts`.
- **Pourquoi pas de « table GS1 audio »** : Bookland est une plage GS1 produit pour les livres ; la musique utilise des _company prefixes_ ordinaires. Une table serait une allowlist label/distributeur (recherche + risque FP), pas un standard type-range.
- **Différé** : ne pas réintroduire de regex prefix sans allowlist prouvée (ex. Universal `602…` / Daft Punk `0724…` hit ; Nintendo / Ghost Recon miss) + goldens untyped + bump cache si sélection change.

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

Garder seulement si index local prébuild ; pas de download/extract au scan. **Fait 2026-07-24** — `pnpm launchbox:update` ; scan ouvre SQLite existant seulement. **FTS measure 2026-07-24** — `tsx scripts/launchbox/bench-fts.ts` (p50/p95 ; soft keep si p95 ≤ 100ms) + budget unit `LAUNCHBOX_FTS_MATCH_PLAN_BUDGET`.

---

## Liens

- [provider_integration_checklist.md](provider_integration_checklist.md)
- [provider_agnostic_architecture.md](provider_agnostic_architecture.md)
- [barcode_consensus_refactor.md](barcode_consensus_refactor.md)
- [archive/hardcoding_audit.md](archive/hardcoding_audit.md)
