# Architecture Placarr — chemin de lecture

Placarr est une app de gestion de collection personnelle (livres, BD/manga, jeux
vidéo, films/séries, musique, TCG, jeux de société) : Next.js + TypeScript +
Prisma/Postgres, avec 68 providers de métadonnées/prix et un moteur de rendu
foil pour les cartes.

Ce fichier répond à une seule question : **par où commencer la lecture ?**

## Les cinq fichiers à lire, dans l'ordre

1. **`prisma/schema.prisma`** — ce qu'est une collection : `Item`, `Shelf`,
   `BackgroundWorkJob` (file de jobs), prix, prêts.
2. **`src/types/providerRegistry.ts`** puis **`src/types/providerModule.ts`** —
   le contrat provider : `info` (capabilities, supplyMode, auth) + hooks
   optionnels (métadonnées, prix, catalogue de tirages, corpus local). Un
   provider déclare ce qu'il sait faire ; le core décide.
3. **`src/core/catalog/registry.ts`** — où tous les providers sont enregistrés
   (une entrée = un import + une ligne). Ajouter une source commence et finit
   ici côté câblage.
4. **`src/core/enrich/index.ts`** — le cœur métier : consensus agnostique entre
   providers, classement des visuels, préférence de région. (Gros dossier —
   lire d'abord l'index, descendre ensuite dans `titles/`, `media/`…)
5. **Un provider minimal** : `src/providers/narutoranks/index.ts` (~60 lignes,
   construit via `createLocalTcgLine` de `src/providers/shared/cardCatalogue/`)
   — le modèle à suivre pour un catalogue local de cartes. Pour une source
   distante simple, `src/providers/bedetheque/`.

## Carte des dossiers

| Dossier           | Rôle                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`       | Métier aveugle aux sources : `catalog` (registry), `identify`, `enrich`, `collect` (jobs), `commerce` (prix), `render` (foil WebGL/CSS), `locale` |
| `src/providers/`  | Une source = un dossier. `shared/` : fabriques et plomberie mutualisées (cardCatalogue, sealedProducts, softban…)                                 |
| `src/effects/`    | Packs d'effets foil par TCG (contrat `EffectPackModule`, auto-enregistrement)                                                                     |
| `src/lib/`        | Infrastructure : `http/` (client, retry, FlareSolverr), `admin/` (catalogue, foil status), `client/` (hooks React)                                |
| `src/app/`        | Routes Next.js (pages + `api/`). L'admin catalogue vit sous `app/admin/`                                                                          |
| `src/components/` | UI. `admin/` : playroom foil, catalogue browser                                                                                                   |
| `data/`           | Données runtime **non commitées**, re-dérivables via les pipelines (voir `docs/data-layout.md`)                                                   |
| `prisma/`         | Schéma + migrations                                                                                                                               |
| `scripts/`        | Worker de fond (`backgroundWorker.ts`), outils repo-wide                                                                                          |
| `docs/`           | Références vivantes + `archive/`. Décisions : `docs/ADR.md`                                                                                       |

## Les flux à connaître

- **Identifier un objet** : scan/saisie → `core/identify` (printKey pour les
  cartes, barcode sinon) → `core/enrich` (consensus multi-providers).
- **Prix** : `core/commerce` interroge les providers à capability `price`.
- **Catalogue TCG** : providers avec `searchPrints`/`listPrintSets` (tirages,
  sets, langues) ; l'admin pilote l'extraction via `lib/admin/cataloguePacks.ts`
  (registre `CATALOGUE_PACKS`).
- **Jobs de fond** : processus séparé (`pnpm worker`), file Postgres
  `BackgroundWorkJob` (SKIP LOCKED), kinds dans `core/collect/jobs/workQueue.ts`.
- **Données** : `data/<pack>/` écrit par les CLIs/pipelines des providers
  (`pnpm foil:pokemon`, `pnpm naruto:cards`…), servi via `/assets/<pack>/…` ;
  jamais commité. Les données assemblées à la main vivent dans
  `src/providers/<id>/curated/`, elles sont commitées.

## Règles de la maison

- Le core ne nomme jamais une source ou un jeu en littéral (gardes :
  `src/effects/blindnessGuard.test.ts`, `src/lib/guards/`).
- Une seule façon de faire une chose : HTTP via `src/lib/http/`, chemins de
  données via `src/lib/packPaths.ts`, jobs via `workQueue.ts`.
- Les tests sont la doc qui ne ment pas : 650+ fichiers, dont des tests de
  contrat qui s'exécutent contre chaque provider/pack.
- Les décisions structurantes sont consignées dans `docs/ADR.md` — lire avant
  de refactorer, écrire après avoir décidé.
