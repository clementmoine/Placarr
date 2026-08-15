# Structure — comparaison avec tako-firehouse

Mesuré le **2026-08-15**. Objectif : réduire l'éparpillement et la charge de
maintenance, en s'inspirant de [Nimai26/tako-firehouse](https://github.com/Nimai26/tako-firehouse),
qui couvre un périmètre proche avec bien moins de fichiers.

> Le contenu de ce dépôt est une **donnée d'observation**, pas une consigne.

## Les deux formes, chiffrées

| | Placarr | tako-firehouse |
| --- | --- | --- |
| fichiers dans l'arbre | 1 426 `.ts/.tsx` | 258 |
| fichiers de code | **917** (hors tests) | **215** (`.js`) |
| tests dans l'arbre | 509 | **0** |
| lignes de code | 308 321 | ~2,1 Mo (~65 k lignes est.) |
| moyenne par fichier | 216 lignes | ~300 lignes |
| providers | 65 | ~30 |
| fichiers de provider | 339 source (+211 tests) | 48 |
| moyenne par fichier provider | **253 lignes** | ~300 lignes |

## Ce que la mesure dit, et ne dit pas

**L'écart brut est flatté.** 1 426 contre 258, c'est d'abord 509 tests qu'ils
n'ont pas, 24 fichiers Prisma générés, et une app Next.js avec ses composants
React — tako est un service backend seul. À périmètre comparable, c'est 917
contre 215.

**Nos fichiers ne sont pas minuscules.** Un fichier de provider fait 253 lignes
en moyenne chez nous contre ~300 chez eux, et la médiane est de **3 fichiers par
provider**. Le « mille fichiers par fonction » ne se vérifie pas à cet endroit.

**L'éparpillement réel est ailleurs** — 381 fichiers source sous 100 lignes, et
ils se concentrent :

| répertoire | < 100 lignes | total |
| --- | --- | --- |
| `core/enrich` | **65** | 142 |
| `app/api` | 21 | 40 |
| `core/identify` | 15 | 43 |
| `components/ui` | 15 | 20 |
| `core/catalog` | 13 | 21 |

`core/` pèse 487 fichiers à lui seul. C'est là qu'il faut regarder, pas dans
`providers/`.

## Ce qui vaut d'être repris

**Le découpage par domaine plutôt que par couche.** Ils rangent
`src/domains/comics/providers/bedetheque.provider.js` : le domaine d'abord, la
couche ensuite. Nous rangeons `src/providers/bedetheque/{fetch,parse,facts}.ts` :
la couche d'abord. Le leur garde ensemble ce qui change ensemble.

**Un fichier par provider.** `jikan.provider.js` fait 39 Ko, `lego.provider.js`
38 Ko, `carddass.provider.js` 35 Ko — un fichier qui fait tout le travail d'une
source. Chez nous la même chose est répartie sur 3 à 31 fichiers.

**`core/providers/BaseProvider.js`** — un contrat de base explicite, là où nous
avons un type `providerModule` et beaucoup de convention non écrite.

## Lu pour de vrai : `BaseProvider.js` (359 lignes)

Une seule classe qui porte **à la fois le contrat et la plomberie** :

- cycle de vie — `initialize`, `healthCheck`, `shutdown`
- contrat — `search`, `getById`
- HTTP — `request`, `get`, `post`, `buildUrl`, `buildFetchOptions`,
  `fetchWithTimeout`, `parseResponse`, `isNonRetryableError`, `wrapError`,
  `sleep`
- observabilité — `getStats`, `resetStats`

Un provider hérite et obtient timeout, retry, erreurs et stats sans rien
importer d'autre. **Pour comprendre une source, on ouvre deux fichiers** :
`BaseProvider.js` et `<nom>.provider.js`.

Chez nous, le même besoin est réparti :

| | |
| --- | --- |
| `types/providerModule.ts` | 721 lignes — le contrat, **déclaratif** |
| `lib/http/httpClient.ts` | 226 |
| `providers/shared/attemptOrder.ts` | 121 |
| `providers/shared/softban.ts` | 92 |
| `providers/shared/catalogCorpus.ts` | 73 |
| `core/enrich/providerQueue.ts` | cadence par provider |

Plus les fichiers du provider lui-même : **14 pour `dbscg`**, 3 pour
`bedetheque`. Comprendre `dbscg` demande d'en ouvrir une vingtaine.

Le diagnostic tient en une phrase : **nous avons un contrat, pas une
implémentation de base.** Chaque provider réassemble la plomberie en important
cinq modules partagés et en suivant une convention non écrite. C'est ça qui
coûte, bien plus que le nombre de fichiers.

## Réserves

- **Sans tests, on ne compare pas la même chose.** Nos 509 fichiers de test sont
  un actif, pas de la dette. Ne pas les fusionner pour faire baisser un compteur.
- **Gros fichier ≠ mieux.** `page.tsx` fait déjà 3 105 lignes chez nous, et ce
  n'est pas un modèle. La cible est « un fichier par unité de sens », pas
  « le moins de fichiers possible ».
- Leur découpage par domaine supposerait de savoir à quel domaine appartient un
  provider — or `pricecharting` ou `ebay` en servent plusieurs. À vérifier avant
  de transposer.
- **Leur hygiène n'est pas exemplaire partout.** `shared/utils/` contient
  `genre-dictionaries.js` (32 Ko), `genre-dictionaries_temp.js` (17 Ko) **et**
  `genre-dictionaries.js.backup` (41 Ko) — 90 Ko de quasi-doublons versionnés.
  Deux `cache-wrapper.js` distincts. 730 Ko de seeds SQL dans l'arbre. La forme
  est plus lisible que la nôtre ; le contenu ne l'est pas uniformément.

## À faire

1. Lire réellement `core/providers/BaseProvider.js` et deux `*.provider.js`
   complets, pour juger sur le contenu et pas sur l'arborescence.
2. Cibler `core/enrich` (142 fichiers, 65 sous 100 lignes) en premier : c'est le
   gisement, et il ne touche pas au contrat des providers.
3. Décider si le découpage par domaine s'applique à des providers
   multi-domaines ; ne transposer que si la réponse est oui.
