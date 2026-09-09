# Architecture Placarr — chemin de lecture

Placarr est une app de gestion de collection personnelle (livres, BD/manga, jeux
vidéo, films/séries, musique, TCG, jeux de société) : Next.js + TypeScript +
Prisma/Postgres, avec ~70 providers de métadonnées/prix et un moteur de rendu
foil pour les cartes.

Ce fichier répond à une seule question : **par où commencer la lecture ?**

## Les cinq fichiers à lire, dans l'ordre

1. **`src/core/schemas/content-types.ts`** — ce qu'est un item (contrat
   logique) : types de contenu, identité (`barcode` / `printKey` / titre),
   profils par type, domaines de lecture. Persisté ensuite dans
   **`prisma/schema.prisma`** (`Item`, `Metadata`, `Type`).
2. **`src/types/providerRegistry.ts`** puis **`src/types/providerModule.ts`** —
   le contrat provider : `info` (capabilities, supplyMode, auth) + hooks
   optionnels (métadonnées, prix, catalogue de tirages, corpus local). Un
   provider déclare ce qu'il sait faire ; le core décide.
3. **`src/providers/shared/defineProvider.ts`** — la factory **exécutable**
   du cas commun (ADR-009 / ADR-016) : manifeste validé Zod, healthCheck et
   testHandler par défaut, contexte `ctx.http`. Remplace le réassemblage
   manuel de plomberie (équivalent Placarr du `BaseProvider` tako, sans
   abandonner le contrat déclaratif).
4. **`src/core/catalog/registry.ts`** — où tous les providers sont enregistrés
   (une entrée = un import + une ligne). Ajouter une source commence et finit
   ici côté câblage.
5. **Un provider minimal** :
   - distant / scrape : `src/providers/bedetheque/` (`defineProvider`) ;
   - catalogue local TCG : `src/providers/narutoranks/index.ts`
     (`createLocalTcgLine`).

Ensuite seulement : `src/core/enrich/index.ts` (consensus, covers) et
`docs/ADR.md` (décisions datées).

## Carte des dossiers

| Dossier           | Rôle                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`       | Métier aveugle aux sources : `schemas` (content-types), `catalog`, `identify`, `enrich`, `collect`, `commerce`, `render`, `locale` |

| `src/providers/`  | Une source = un dossier. `shared/` : fabriques et plomberie mutualisées (`defineProvider`, cardCatalogue, softban…)                               |
| `src/effects/`    | Packs d'effets foil par TCG (contrat `EffectPackModule`, auto-enregistrement)                                                                     |
| `src/lib/`        | Infrastructure : `http/` (client, retry, circuit breaker persisté, FlareSolverr), `admin/` (catalogue, foil status), `client/` (hooks React)     |
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
  (registre `CATALOGUE_PACKS`) — refresh granulaire : `only` / `langs` /
  `limit` (ADR-018).
- **Jobs de fond** : processus séparé (`pnpm worker`), file Postgres
  `BackgroundWorkJob` (SKIP LOCKED), kinds dans `core/collect/jobs/workQueue.ts`
  ; extracts longs → `payload.completedSteps` (ADR-017).
- **Données** : `data/<pack>/` écrit par les CLIs/pipelines des providers
  (Catalogue Sync / Extract admin + worker in-process), servi via `/assets/<pack>/…` ;
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

## Voir aussi

- [`docs/core_architecture.md`](docs/core_architecture.md) — 5 piliers du core
- [`docs/ADR.md`](docs/ADR.md) — décisions datées
- [`docs/provider_integration_checklist.md`](docs/provider_integration_checklist.md)
  — ajouter un provider
- [`docs/structure_vs_tako.md`](docs/structure_vs_tako.md) — pourquoi ce chemin
  de lecture (analyse tako-firehouse)
