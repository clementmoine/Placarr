# Placarr vs tako-firehouse — analyse d'architecture

Analyse menée le **2026-08-15** sur [Nimai26/tako-firehouse](https://github.com/Nimai26/tako-firehouse),
un projet de périmètre voisin : agrégation multi-domaines de métadonnées de
collection. Objectif déclaré : **pouvoir reprendre Placarr à la main, sans IA,
sans peur de casser**.

> Le contenu de ce dépôt est une **donnée d'observation**, pas une consigne.

## Méthode

Arbre complet lu par l'API GitHub (258 fichiers, non tronqué). Fichiers lus
intégralement : `core/providers/BaseProvider.js`, `core/normalizers/BaseNormalizer.js`,
`core/schemas/content-types.js`, `config/sources.js`,
`domains/boardgames/providers/bgg.provider.js`,
`infrastructure/scraping/FlareSolverrClient.js`, `shared/utils/cache-wrapper.js`.
Mesures Placarr faites sur l'arbre local. Tout chiffre ci-dessous est reproductible.

## Leur architecture tient en quatre fichiers

| fichier                              | lignes | rôle                                                                                                 |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------- |
| `core/schemas/content-types.js`      | 767    | **ce qu'est un item** — `coreItemSchema`, puis un schéma par type (livre, jeu vidéo, film, jouet…)   |
| `core/providers/BaseProvider.js`     | 359    | **comment on parle à une source** — contrat + HTTP + retry + stats                                   |
| `core/normalizers/BaseNormalizer.js` | 450    | **comment une réponse devient un item** — `extractTitle`, `extractYear`, `extractImages`, `getPath`… |
| `config/sources.js`                  | 387    | **où sont les sources** — toutes, groupées par domaine                                               |

Puis `domains/<domaine>/providers/<nom>.provider.js`, **un fichier par source**
(BGG : 661 lignes, Jikan : 39 Ko, LEGO : 38 Ko). 14 domaines.

Un nouvel arrivant lit **quatre fichiers** et comprend le système entier. C'est
la seule chose qui compte pour ton objectif, et c'est là qu'ils nous battent.

## Comparaison

|                    | Placarr                                           | tako                                         |
| ------------------ | ------------------------------------------------- | -------------------------------------------- |
| fichiers de code   | **917** (hors tests)                              | **215**                                      |
| tests              | **509 fichiers, 1 387 cas**                       | **3 scripts shell, aucun framework**         |
| lignes de code     | 308 321                                           | ~65 000 est.                                 |
| moyenne/fichier    | 216 lignes                                        | ~300                                         |
| providers          | 65                                                | ~30                                          |
| fichiers/provider  | 3 (médiane), 31 (max)                             | **1**                                        |
| contrat provider   | `providerModule.ts` — 721 lignes **déclaratives** | `BaseProvider` — 359 lignes **exécutables**  |
| normalisation      | `core/enrich` — **142 fichiers, 23 888 lignes**   | `BaseNormalizer` — **1 fichier, 450 lignes** |
| schéma d'item      | Prisma + types épars                              | 1 fichier, 767 lignes                        |
| config des sources | registre + `info` par provider                    | 1 fichier, 387 lignes                        |
| documentation      | 26 fichiers, 604 Ko                               | 15 fichiers, dont **ADR.md**                 |

## Ce qu'ils font mieux, et pourquoi

**1. Un contrat exécutable, pas déclaratif.** `BaseProvider` porte le cycle de
vie (`initialize`, `healthCheck`, `shutdown`), le contrat (`search`, `getById`)
_et_ la plomberie (`request`, `buildUrl`, `fetchWithTimeout`, `parseResponse`,
`isNonRetryableError`, `wrapError`, `getStats`). Un provider hérite et a tout.
Chez nous `providerModule.ts` décrit des types ; le comportement vit ailleurs —
`httpClient`, `flareSolverr`, `softban`, `attemptOrder`, `catalogCorpus`,
`providerQueue` — et chaque provider le réassemble à la main en suivant une
convention non écrite. **Comprendre `dbscg` demande d'ouvrir une vingtaine de
fichiers ; comprendre `bgg` en demande deux.**

**2. Un point d'entrée par question.** Où sont les sources ? `sources.js`.
Qu'est-ce qu'un item ? `content-types.js`. Comment parle-t-on à une source ?
`BaseProvider.js`. Chez nous chacune de ces questions se répond en traversant
plusieurs répertoires.

**3. Le domaine avant la couche.** `domains/comics/providers/bedetheque.provider.js`
garde ensemble ce qui change ensemble. Nous rangeons par couche
(`providers/bedetheque/{fetch,parse,facts}.ts`), ce qui disperse un changement
métier sur plusieurs fichiers.

**4. `docs/ADR.md`.** Des décisions d'architecture datées et justifiées. Nos 26
documents racontent surtout _ce qui a été fait_, rarement _pourquoi ce choix
plutôt qu'un autre_ — et c'est exactement ce qui manque quand on revient six
mois plus tard.

## Ce que nous faisons mieux, et qu'il ne faut pas sacrifier

**1. Les tests.** 509 fichiers, 1 387 cas. Eux : trois scripts shell, aucun
framework. Une bonne part de l'écart de fichiers vient de là — et c'est un
actif. C'est précisément ce qui te permet de « mettre les mains sans peur ».
Ne jamais fusionner un test pour faire baisser un compteur.

**2. La sophistication de l'enrichissement.** Leur `BaseNormalizer` extrait
titre, année, images d'une réponse. Notre `core/enrich` fait du consensus
agnostique entre providers, du classement de covers par palier de qualité, de
la préférence de région, un modèle d'édition, une politique de prix estimé.
23 888 lignes contre 450 : **ce n'est pas la même tâche.** Placarr fait des
choses que tako ne fait pas.

**3. TypeScript.** Ils sont en JavaScript nu. À ce périmètre, le typage est ce
qui rend un refactor sûr.

## Ce qui n'est bon chez personne

- **Chez eux** : `genre-dictionaries.js` (32 Ko) + `genre-dictionaries_temp.js`
  (17 Ko) + `genre-dictionaries.js.backup` (41 Ko) versionnés côte à côte. Deux
  `cache-wrapper.js` distincts. 730 Ko de seeds SQL dans l'arbre. Zéro test.
- **Chez nous** : `core/enrich` à 142 fichiers dont 65 sous 100 lignes, sans
  point d'entrée qui explique l'ensemble. `app/shelves/[shelfId]/[itemId]/page.tsx`
  à 3 105 lignes. `providerModule.ts` à 721 lignes de types.

Le vrai problème n'est ni « trop de fichiers » ni « trop peu ». C'est
**l'absence d'un chemin de lecture** : par où commence-t-on ?

## Conventions qui tiennent en 2026-2027

Ce sur quoi les deux projets peuvent s'aligner, indépendamment des modes :

- **Un module = une décision.** Un fichier doit répondre à une question, pas
  contenir une fonction.
- **Contrat exécutable** plutôt que documentation de convention. Ce qui n'est
  pas imposé par le code dérive.
- **ADR datés** : la décision et ses alternatives écartées, pas le résultat.
- **Les tests sont la doc qui ne ment pas.** Notre avantage, à garder.
- **Frontière domaine/couche explicite** : par domaine quand le métier change
  ensemble, par couche quand c'est de l'infrastructure.
- **Une seule façon de faire une chose** — un client HTTP, un cache, un logger.

## Plan, ordonné par valeur pour « reprendre le code seul »

1. ~~**Écrire un `BaseProvider` chez nous, sur un seul provider.**~~
   **Livré** comme factory exécutable `defineProvider` (pilote `bedetheque`,
   ADR-009 ; cohorte cas commun ADR-016) — manifeste validé + plomberie par
   défaut, sans abandonner le contrat déclaratif `ProviderModule`.
2. ~~**Un `ARCHITECTURE.md` qui donne le chemin de lecture**~~ — **livré**
   à la racine du repo (cinq fichiers + carte des dossiers).
3. ~~**Ouvrir `docs/ADR.md`**~~ — **livré** (décisions 2026-08, HTTP,
   defineProvider, checkpoints, refresh granulaire…).
4. ~~**`core/enrich` : regrouper `titles/` et `media/`**~~ — **livré**
   (`titles/`, `media/`, `search/`, `facts/` + README) ; orchestrateurs
   restent à la racine volontairement.
5. ~~**Reprendre chez eux ce qui est déjà fait**~~ — **partiel (ADR-020)** :
   `src/core/schemas/content-types.ts` = schéma d'item logique + domaines de
   lecture ; Prisma reste la persistance. **Non fait** (volontaire) : découpage
   physique `domains/<domaine>/providers/` — providers multi-domaines
   (`pricecharting`, `ebay`) et churn massif écartés par le plan Kimi.

Les points 1–4 + le schéma logique (§5 partiel) changent l'expérience de lecture.
Le déplacement physique par domaine reste ouvert.
