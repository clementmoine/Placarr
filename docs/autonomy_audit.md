# Autonomie du conteneur — audit

Mesuré le **2026-08-15**. Objectif produit, tel qu'énoncé : _« Je le lance, je
l'héberge, il se débrouille tout seul. Après moi je viens juste rajouter du
contenu dans mes collections. »_ Un Plex-like.

Conséquences de ce cadrage, à garder en tête pour toute décision :

- **La page admin est un outil de debug**, pas une surface de production. Elle
  sert à relancer quand quelque chose a cassé, à initialiser, ou quand un
  contrat a changé. Dimensionner son ergonomie en conséquence.
- **Aucun ajout de provider en production.** Un provider nouveau, c'est un
  build et un déploiement. Ne pas construire de mécanique de plugin à chaud.
- **Ce qui n'est joignable qu'en CLI n'existe pas au quotidien.** `tsx` est bien
  dans l'image (le Dockerfile copie l'arbre complet pour que le worker tourne),
  donc la CLI _pourrait_ s'exécuter — mais personne n'ouvrira un SSH sur le NAS.

## Ce qui tourne déjà tout seul

Le squelette est là, et il est bon.

| brique                  | état                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init.sh`               | _« All-in-one entrypoint (Plex-style): migrate → workers → Next »_. Migrations, deux workers (`interactive`, `icollect` en concurrence 1), puis le serveur.                                                             |
| supervision             | si un worker meurt, **init.sh descend le conteneur** — un conteneur sain avec un worker mort arrêtait l'enrichissement en silence. La politique de redémarrage Docker fait le reste.                                    |
| fraîcheur               | `catalogueAutoSync` — _« Plex-like: enqueue refresh when status().stale »_. Contrôle horaire, découverte par le registre, jamais par id.                                                                                |
| file                    | persistée en base : `attempts`, `maxAttempts = 3`, délai de reprise. Un job échoué repart seul et survit à un redémarrage.                                                                                              |
| anti-blocage            | `scrapeAccessBlocked()` détecte 403/429/503 **et** les signatures Cloudflare (« just a moment », « cf-browser-verification », « enable javascript and cookies ») ; `fetchGetWithFlareFallback` bascule automatiquement. |
| couverture FlareSolverr | **29 providers sur 65** — exactement ceux qui scrapent. Les 36 autres sont des API sans mur. Ce n'est pas un trou.                                                                                                      |
| cadence                 | déclarée par provider (`minRequestIntervalMs`, `maxConcurrentRequests`) ; `providerQueueSettings` en dérive la forme de queue.                                                                                          |
| quotas                  | `retry.ts` sait qu'un 429 est un signal de quota **à ne pas réessayer** — le marteler aggrave.                                                                                                                          |

## Ce qui manque

Trois manques, tous étroits. Aucun n'est un chantier d'architecture.

### 1. Le cooldown persistant ne couvre que 3 packs

`providers/shared/softban.ts` écrit sur disque un « ne pas rappeler avant »,
qui survit au redémarrage du processus. C'est ce qui empêche de re-marteler un
hôte qui nous a bannis pour la soirée.

Il n'est consommé que par **dbscg, dbsfw, pokemontcglive**. Les 62 autres
providers repartent innocents après un restart, et ré-attaquent un hôte qui
venait de fermer la porte.

### 2. Dix-huit endroits contournent le client HTTP commun

`fetch` nu au lieu de `httpGet`. Ils y perdent trois choses que le client
garantit : le **signal d'abandon ambiant** (annuler un job depuis l'admin ferme
réellement ses sockets), la déduplication des GET identiques en vol, et un
timeout uniforme.

Conséquence concrète : sur un crawl de 259 pages, « annuler » n'annulait pas —
la tâche gardait un slot de worker jusqu'au timeout de chaque page.

Relevé le 2026-08-15 : `coverproject/cdnLookup`, `howlongtobeat/fetch` (×2),
`lorcanatcg/{dumpWeb,scrapeCards}`, `narutoccg/{buildCoverageChecklist,scrapeCards×2,waybackSiteMirror}`,
`pokemontcglive/{audit_tcgdex_map×3,cdn×3,sources,syncLiveOwned}`.
`shared/dbscards/scrapeList` en faisait partie — corrigé (`25305a2`).

### 3. `refresh` est tout-ou-rien

`ProviderCatalogHooks` n'expose que `dataPack`, `status`, `refresh`, et
`refresh` ne reçoit que `{ auto }`. En bout de chaîne, `refreshDbsCgCatalog`
appelle `runDbsCgPackPipeline([])`.

Donc l'admin — et la boucle horaire — ne savent dire qu'une chose : « rafraîchis
ce pack en entier ». Pas d'étape isolée, pas de langue, pas de `limit`.

**Priorité basse**, et c'est un changement par rapport à l'analyse initiale :
l'admin étant un outil de dernier recours, cette granularité sert quand quelque
chose casse, pas au quotidien. Elle reste souhaitable — c'est elle qui rendrait
la CLI dispensable — mais elle ne bloque pas l'autonomie.

### 4. Aucun job n'est récupéré après une coupure

`BackgroundWorkJob` porte `status`, `attempts`, `updatedAt`, et `updatedAt` est
mis à `NOW()` au moment où un worker réclame le job. Mais **rien ne balaie les
jobs restés `running` dont le worker a disparu** — le module le dit lui-même :
_« they would sit `running` forever »_.

Un conteneur qui redémarre en plein travail laisse donc un job mort en base,
qui bloque son `replaceOpenForKind` et n'est jamais repris.

**Politique voulue**, et `updatedAt` suffit à la mettre en œuvre :

| depuis le dernier signe de vie           | décision                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| < quelques minutes                       | un worker est probablement encore vivant — ne pas toucher                |
| lease dépassé, coupure récente (~15 min) | **reprendre** là où on en était                                          |
| coupure ancienne (~24 h)                 | **repartir de zéro** : le monde a bougé, une reprise partielle mentirait |

**Ce qui rend la reprise utile, c'est le point de contrôle**, pas la décision
elle-même. Nos étapes sont déjà idempotentes — la passe de faces saute ce qui
existe, source par source — donc « repartir » n'est pas dangereux, seulement
long. Le coût réel est de refaire les étapes déjà finies avant d'atteindre
celle qui manquait.

Concrètement : si le payload notait l'étape atteinte, une reprise sauterait
directement à `faces` au lieu de refaire 166 scrapes de séries et 387 pages de
liste.

### Cas observé — 2026-08-15

Le worker de développement tourne sous `tsx watch`, qui surveille `src/` (le
script n'exclut que `data/`, `.next/` et `node_modules/`). Une session
d'édition a redémarré le worker à répétition ; à chaque fois il a relancé le
pipeline **depuis le début**, et l'enfant `tsx src/providers/dbscg/cli.ts`
précédent a survécu en orphelin.

Résultat entre 15:36 et 18:32 : au moins six pipelines complets empilés, chacun
refaisant 76 séries FR + 90 EN + 259 + 128 pages dbscards + le clone Arena,
alors que seules les faces restaient à finir. Le compteur `bridé` est monté à
563 sans que le refroidissement persistant se déclenche.

Trois défauts cumulés, tous listés ci-dessus : pas de point de contrôle, enfant
non rattaché au cycle de vie du worker, et un `softban` qui n'a pas mordu.

## La cause commune

Ces comportements vivent dans des modules partagés **qu'il faut penser à
importer**. Rien ne les impose. `softban` est disponible pour les 65 providers ;
3 s'en servent. Le client HTTP commun est disponible ; 18 endroits l'évitent.

C'est le même défaut que celui relevé dans [card_pack_contract.md](card_pack_contract.md)
et [structure_vs_tako.md](structure_vs_tako.md) : **un contrat déclaratif
n'impose rien, et ce qui n'est pas dans le chemin commun finit par ne pas être
appliqué.** Une base exécutable — classe ou factory — le corrigerait
structurellement, en rendant l'oubli impossible plutôt qu'en le documentant.

## Ordre suggéré

1. **Un garde de test** qui interdit `fetch(` nu dans `src/providers` (liste
   d'exceptions explicite au besoin). Empêche la régression avant de corriger
   l'existant.
2. **Reprendre les 18 contournements**, en commençant par ceux qui tournent en
   tâche de fond longue — `narutoccg/scrapeCards`, `pokemontcglive/cdn`.
3. **Généraliser `softban`** au chemin commun plutôt qu'au bon vouloir de chaque
   pack.
4. La granularité de `refresh` — quand le reste est fait.
