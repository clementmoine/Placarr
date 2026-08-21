# Naruto CCG / Carddass / JCC — backlog des sites

Inventaire **site par site** des hôtes cités pendant le développement du
provider `narutoccg`. À parcourir un par un pour faces, dos, displays,
boosters / starters, titres et détails — **FR / IT / EN / JA**.

Canvas filtrable (même corpus) : ouvrir `naruto-source-sites-backlog` à côté
du chat. Favoris navigateur 2026-08-17 pliés dans les tables (CDX, `_r4108`,
`256824`, Amazon 05110, Digigame, AnimeCollection).

**Périmètre catalogue** : même jeu tabletop Bandai (Carddass FR/IT/JA + CCG Bandai USA).
Ne pas **promouvoir** dans `cards/` sans attestation : Data Carddass DN/NM, Fansets /
Shinobi’s Dream, Kayou / Mythos / Panini Ultra, TCG 2026–2027 — mais **archiver
quand même** sous `staging/` quand la source le permet.

**Méthode** : pour chaque hôte, **télécharger / archiver d’abord** sous
`data/naruto/carddass/staging/` (faces, titres JSON, HTML, PDF, packshots…).
Ensuite seulement décider ce qui monte dans `cards/` (`art.<source>.*`) ou
`products/`. Ne pas refuser un dump à la source — skip = promotion catalogue
seulement, pas suppression de données.

### Indexes à ouvrir en premier (pas seulement la fiche)

| Index                                                                                                 | Naruto trouvé (2026-08-17)                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ccgtrader.net/games/](https://www.ccgtrader.net/games/)                                              | **1** jeu : [`naruto-ccg`](https://www.ccgtrader.net/games/naruto-ccg/) — pas de Carddass / JCC à part. 35 slugs de sets (dont `shinobis-dream` = skip). HTML des sets souvent vide ; API `api.ccgtrader.co.uk` = faces Vintage. |
| [retrotcg.net/games](https://retrotcg.net/games)                                                      | **1** jeu : [`naruto-ccg`](https://retrotcg.net/games/naruto-ccg) — mêmes sets + tins (`fierce-ambitions`, `untouchables`, `ultimate-battle`, `rebirth`). Locales `/fr/` `/es/` = même jeu.                                      |
| [tcg-db.nikita.jp/explist/](https://tcg-db.nikita.jp/explist/)                                        | jeu `nrt` déjà listé (Carddass JA).                                                                                                                                                                                              |
| Coleka ombrelle `_r4102`                                                                              | skip (mix). Branche utile = `_r41705` → feuilles S1–S5 (`_r4108` = S1 Pays du Vent, 184 cartes).                                                                                                                                 |
| [TCDB Gaming N / Years](https://www.tcdb.com/ViewAll.cfm/sp/Gaming?Let=N&MODE=Years)                  | S1–S12 + S14–S18 en marques séparées ; **pas** S13 ni S19–S28. Sid [`256824`](https://www.tcdb.com/ViewSet.cfm/sid/256824/2002-Bandai-Naruto-The-Path-to-Hokage) mal daté ≠ `116757`.                                            |
| [Wayback CDX `bandaicg.com/naruto/*`](https://web.archive.org/web/*/http://www.bandaicg.com/naruto/*) | Calendrier, pas une fiche. Hub d’époque : [`home.php` 2009-02-11](https://web.archive.org/web/20090211193529/https://www.bandaicg.com/naruto/home.php).                                                                          |
| [Wayback CDX `carddas.com/naruto/*`](https://web.archive.org/web/*/http://www.carddas.com/naruto/*)   | Même corpus que le dump `staging/carddas-jp/`.                                                                                                                                                                                   |
| [carddass.fr racine](https://web.archive.org/web/20111228103710/http://www.carddass.fr/)              | Hub multi-jeux 2011. Naruto = `/naruto/` (déjà dumpé).                                                                                                                                                                           |
| [nikita `?mode=img`](https://tcg-db.nikita.jp/cardlist/nrt/?mode=img)                                 | Vue faces du jeu `nrt` (pas seulement `/explist/nrt/`).                                                                                                                                                                          |

Corpus miné : `docs/naruto_*.md`, `src/providers/narutoccg/curated/sources/*.json`,
mémoires Claude (promo, liveinternet, Coleka, S6 IT), ce trip Cursor, share
ChatGPT [6a7c988f](https://chatgpt.com/share/6a7c988f-d050-83eb-8092-32606c2748b2).
Gemini / Codex : aucun hôte Naruto supplémentaire.

Statuts : **harvest** = encore à extraire · **recheck** = déjà utilisé, gaps
d’asset · **done** = épuisé pour notre scope · **watch** = live only, pas
d’archive · **skip** = piège / autre ligne.

---

## Session 2026-08-18 — inventaire named+noArt + harvest

Index `cards-index.json` (5955 cartes) : **named locale sans `art`**.

| Locale | Restant | Notes                                                                                                                                                                                           |
| ------ | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IT** |     336 | Titres Magento S1–S5, pas de JPEG. CDX `media.cardgame-club.it/catalog/product/*` = **autres jeux** (`38-1554.jpg`…). Originaux `4/-/4-107.jpg` **absents** du CDX. Cache Magento toujours 404. |
| **JA** |     717 | Dont tabletop ni/te/ta/cl **363**. Extras : gaku 39, shi 132, mju 99, msa 35, promo 49.                                                                                                         |
| **FR** |      41 | S1–S5 named+art **complet**. Reste : S6 jamais imprimée (`cl0033`, ni0257–283, ni0309, ta0240, te0263), stubs `*-promo`, `pr0096` (EN CCG en main).                                             |
| **EN** |      15 | `n1715`…`n1852` — noms génériques / tin unique. Fichiers Drive `n1852.png` sous **Fansets**. Ne pas promouvoir.                                                                                 |

Cette passe a **installé 10 faces JA** déjà en staging carddas mais non mappées (`*_7` / `*_17` / `shinobi-352.gif` / `shinobi_372_16.gif`) : ni0146, ni0352, ni0353, ni0364, ni0372, te0348, te0357–te0360. Les dumps `/card/saku-214.gif` et `shinobi-314.gif` sont des **ids séquentiels du site**, pas 作-214 / 忍-314 — filtrés.

Épuisé en plus : Suruga 巻ノ pages 1–21 = 0 listing neuf ; CDN des 22 listings encore sans JPEG = **404** ; recherches 幕ノ / 忍伝-学 / PR忍 = figurines, 0 carte tabletop.

Pas de VPN JP dans le container : **Wayback + nikita live + CDN Suruga
seulement**. Le harvest HTTP Drive fichier-par-fichier reste trop lent /
incomplet — dump local préféré.

## Session 2026-08-19 — P0 exécutés, trous mesurés

Les trois P0 de la veille sont **passés**. Résultat mesuré, pas déclaré :

1. **Drive Enhanced → `cards/`** : `pnpm naruto:cards -- --only scrape --locale drive`
   → **0 écrits, 4312 sautés, 0 échecs**. La promotion avait déjà eu lieu le
   2026-08-18 (les `art.drive.webp` datent de 00:03) ; le P0 était périmé, pas
   en attente. Restent **87 fichiers non parsés** côté Enhanced et **351** côté
   Fansets — noms de fichiers que `parseNarutoCcgDrive` ne sait pas mapper.
2. **Layout GAKU / SHI / MJU / MSA** : vérifié, la migration a bien eu lieu —
   `gaku/gaku0001` et `mju/mju00NN` portent les octets. Ce qui reste sous
   `ninja/gaku0001` et `jutsu/mju00NN` sont des **dossiers vides** (243 en tout
   avec les `-us`), invisibles pour `buildIndexFromDisk` : l'index est
   identique avant/après (5942 tirages). À balayer un jour, sans urgence.
3. **Purge `art.jpg`** : les 128 de `art-jpg-safe-delete.txt` sont sortis de
   `cards/` vers `logs/art-jpg-purged-2026-08-19/`, sauvegarde
   `logs/art-jpg-backup-2026-08-19.tar.gz` (65 Mo, **1888** fichiers = tous les
   candidats, pas seulement les 128). Re-index après : 5942 tirages inchangés,
   `foldedUnsourced.kept` passe de 1889 à **1761** — exactement les 128.

**Le garde-fou « ne pas bulk-delete les 1761 orphelins EN » est caduc** : ils
l'étaient au moment du rapport (2026-08-17 22:30), avant que la promotion Drive
(2026-08-18 00:03) ne leur donne un `art.drive.webp`. Mesure du jour, source par
source : les 1888 `art.jpg` restants ont tous un frère nommé **au moins aussi
grand dans les deux dimensions** (1887 EN en 525×735 ou 321×450 face à du Drive
750×1050 ; 1 FR `ni0211` en 1009×1428 face à `art.carddass.jpg` au même format).
Les 1760 non purgés attendent une décision, pas une preuve.

### Trous mesurés — index du 2026-08-19 (5950 cartes, 7178 tirages)

| Locale | Tirages | Avec face |     % | Nommé sans face | Face sans nom |
| ------ | ------: | --------: | ----: | --------------: | ------------: |
| **EN** |    4437 |      4437 |  100% |               0 |           176 |
| **JA** |    1442 |       796 | 55,2% |         **646** |            68 |
| **FR** |     900 |       859 | 95,4% |              41 |            15 |
| **IT** |     434 |       122 | 28,1% |         **312** |            25 |

_(fin de session : 5959 tirages. Début : 5942, JA 716 / 50,4 %, IT 75 / 18,2 %.)_

_(fin de session : 5955 tirages. Début : 5942, JA 716 / 50,4 %, IT 75 / 18,2 %.)_

_(fin de session : 5955 tirages. Début : 5942, JA 716 / 50,4 %.)_

_(fin de session : 5950 tirages. Début de session : 5942, JA 716 / 50,4 %, IT 75 / 18,2 %.)_

_(mesures de fin de session : 5949 tirages, après les 騎, アヴァロン, NI-020 et les
scans Suruga 依-41/42 ; au début de la session : 5942 tirages, JA 716 / 50,4 %.)_

Deux trous dominent : **JA** en volume (705), **IT** en proportion (18 %). Le FR
restant est surtout la S6 jamais imprimée ; l'EN n'a plus de trou d'image, mais
176 faces sans titre (96 en promo).

### JA — le catalogue lui-même est incomplet

[cardcheckbox.com](https://cardcheckbox.com/a06a-bandai-3/cdds-naruto-cg.html)
publie les **plages de numérotation par sortie**, 巻ノ一 → 巻ノ十七. Union =
忍 1-417, 術 1-361, 作 1-337, 依 1-46, 騎 1-8. Confronté à notre index :

| Famille | Max officiel | Tenus | Avec face | **Absents** | Sans face |
| ------- | -----------: | ----: | --------: | ----------: | --------: |
| 忍 ni   |          417 |   357 |       242 |      **60** |       115 |
| 術 te   |          361 |   335 |       227 |      **26** |       108 |
| 作 ta   |          337 |   316 |       201 |      **21** |       115 |
| 依 cl   |           46 |    42 |        31 |       **4** |        11 |
| 騎 ki   |            8 |     0 |         0 |       **8** |         0 |

**119 cartes numérotées manquent au catalogue**, et la famille **騎** n'existe
nulle part chez nous — ni dossier disque, ni préfixe dans `collectorIdentity`
(seul `PR騎` est connu, via `prki`). Elle est née du 拡張ファイリングシート
(騎-1〜6, 2005-08) et de 巻ノ十三 (騎-7〜8). Ledger :
`curated/sources/cardcheckbox-jp.json` (dates, plages, livres de starter,
formats jumbo).

### Sources vérifiées le 2026-08-19

| Hôte                                                                                   | Verdict                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [cardcheckbox.com](https://cardcheckbox.com/a06a-bandai-3/cdds-naruto-cg.html)         | **Retenu** — numérotation JA complète, 0 image. Page sœur 疾風伝 pour la ligne maku.                                                                                                                                                         |
| [アヴァロン `csid=24`](https://dp00013984.shop-pro.jp/?mode=cate&cbid=1910612&csid=24) | **Retenu** — 39 singles 巻ノ avec ref imprimée + nom JA + photo `{pid}.jpg` 265×400. EUC-JP. Photo boutique, pas un scan : dernier recours. `csid=133` = ナルティメット, autre ligne.                                                        |
| `media.cardgame-club.it/catalog/product/4/-/*`                                         | **Mort, confirmé** — CDX vide sur les deux formes d'hôte. Seuls `38-*` / `39-*` (autres jeux) sont capturés. Le Magento redirige vers le Shopify `cardgameclub.it`.                                                                          |
| [primegame.it](https://www.primegame.it/Singole/Naruto)                                | **0 stock** sur les 9 rubriques IT (S1–S6 + Promo + deux noms inconnus de notre catalogue : _Sete di Potere_, _Il Vento del Cambiamento_ — à qualifier avant d'en tirer des tirages, `/ajax/get_singles` non sondé).                         |
| [lppcollecting.it](https://lppcollecting.it/altrigiochi/cartesingole.php?id=303)       | **Skip** — page en erreur PHP, et sa liste de jeux ne connaît que _Naruto Mythos_.                                                                                                                                                           |
| delcampe.net                                                                           | **Non concluant** — résultats rendus en JS, rien dans le HTML statique. Même classe qu'eBay : photos de vendeurs, à coller à l'unité.                                                                                                        |
| Coleka ombrelle `_r4102`                                                               | 43 branches énumérées : EN s12→s28, FR `_r41705`, S6 IT `_r41388`, Kayou, _Dual Story 1_, _Royaume des cartes_, _The Will of Fire_. **Aucune branche IT S1–S5.** La s12 EN (`_r39476`) existe, contrairement à ce que dit la file (item 12). |

**IT reste sans piste systématique.** Les faces italiennes sont des scans
distincts (texte italien) — le FR ne peut pas y suppléer.

### IT — la chasse à la source systématique (2026-08-19, mesurée)

Le trou italien (336 tirages nommés sans face, 18,7 %) a été creusé dans les
deux directions demandées. Résultat : **il n'existe pas de source systématique
publique**, et c'est maintenant mesuré, plus supposé.

| Piste                                                | Mesure                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media.cardgame-club.it/catalog/product/` sur le CDX | **2 874 captures 200** — dont `small_image` 1 408, `thumbnail` 1 321, `image` 52. Naruto (`4/-/4-N.jpg`) : **7 captures, 4 images distinctes** (`4-196`, `4-623`, `4-625`, `4-1064`) sur ~700 attendues. Les 121 URLs de `staging/cardgameclub-it/faces.json` ont été construites depuis le HTML des listings ; elles n'ont jamais été capturées. **Hôte clos.** |
| Site officiel italien                                | `carddass.it`, `bandai.it/naruto*`, `narutocardgame.it`, `narutoccg.it` : **0 capture**. Il n'y a pas d'équivalent italien de `carddass.fr`, qui reste la raison pour laquelle le FR est à 95 % et l'IT à 19 %.                                                                                                                                                  |
| Coleka `/it/`                                        | Mur de vérification dès la racine italienne. L'ombrelle `/fr/` (43 branches) n'a **aucune** branche IT S1–S5 — seulement la S6 `_r41388`.                                                                                                                                                                                                                        |
| eBay.it vivant                                       | Recherche large « naruto card game carta », **154 annonces → 17 refs distinctes**. Le vendeur qui a fourni NI-20 (`domenicoq4256`, Santa Maria Capua Vetere) a **14 objets Naruto**. C'est un filet d'eau, pas une source.                                                                                                                                       |
| primegame.it                                         | 9 rubriques IT, **0 stock** (déjà noté).                                                                                                                                                                                                                                                                                                                         |
| narutogt.it                                          | Fansite italien vivant, **aucune section cartes**.                                                                                                                                                                                                                                                                                                               |

**Piste catalogue, pas image** — les deux rubriques primegame inconnues de notre
catalogue s'alignent sur la ligne **CCG Bandai USA**, pas sur le Carddass :
_Sete di Potere_ = TCDB « Naruto **Series 7**: Quest for Power », _Il Vento del
Cambiamento_ ≈ « Series 11: Approaching Wind », et _Rivalità Eterna_ = « Series
6: Eternal Rivalry » que nous avons déjà en IT. Si l'Italie a reçu la ligne CCG
au-delà de la S6 en italien, ce ne sont pas des images qui manquent mais **des
tirages entiers**. À qualifier avant d'en minter quoi que ce soit — le piège
`SALE-DE` / `STO3-DE` (Mawo, allemand) rappelle qu'une locale d'un set CCG
n'ouvre pas une nouvelle numérotation.

### PS — trouvées : les quatre ont leur face

**Ce que c'est**, d'après la page officielle `carddas.com/naruto/cardlist/promo.shtml`
puis le mini-site du jeu chez Bandai : les quatre 忍-n（PS） sont le
**予約特典 (bonus de précommande) du jeu PlayStation「NARUTO -ナルト-
忍の里の陣取り合戦」** (Bandai, 26 juin 2003, 5 800 ¥). Le set porte un nom
officiel — **「NARUTO -ナルト-」カードゲーム 忍の里の陣取り合戦！編（4枚セット）**,
annoncé comme une **スペシャルカードダス** en quantité limitée.

**Correction importante** : ce ne sont **pas des réimpressions**. Bandai écrit
`書き下ろしイラスト` — illustration inédite — et la maquette est propre au set
(fond rouge, pas le cadre 巻ノ). Le ledger disait « PlayStation reprint » ; c'est
corrigé.

| Id          | Imprimé     | Nom            | Slot |
| ----------- | ----------- | -------------- | ---: |
| `ni0011-ps` | 忍-11（PS） | はたけカカシ   |    0 |
| `ni0003-ps` | 忍-3（PS）  | 春野サクラ     |    1 |
| `ni0001-ps` | 忍-1（PS）  | うずまきナルト |    2 |
| `ni0002-ps` | 忍-2（PS）  | うちはサスケ   |    3 |

**Deux visuels officiels trouvés**, tous deux composites :

- [TV Tokyo goods](https://www.tv-tokyo.co.jp/anime/naruto2002/goods/playstation.html) →
  `images/ps2/card.gif`, **470×300**, les 4 côte à côte sous 初回予約特典!! ;
- le mini-site du jeu chez Bandai, retrouvé via `games_naruto.html` → chemin réel
  `/list/naruto_si/` (94 captures Wayback, 87 en 200) → `img/card.gif` **220×315**
  en 2×2, et `yoyaku.html` qui donne le nom du set.

Découpés à leur taille native (**106×159**) et installés en **`thumb.jpg`**, pas
en `art.*` : une tranche d'image promotionnelle n'est pas un scan. Le catalogue
les expose maintenant (`langs.ja.thumb`), là où il n'avait rien. Ledger,
provenance et boîte de découpe : `curated/sources/ps-yoyaku-tokuten.json`.

**Puis les vraies faces sont arrivées** — lot Mercari
[m28811788058](https://jp.mercari.com/item/m28811788058), 10 photos : la 1ʳᵉ
montre les 4 ensemble, la 2ᵉ les dos, puis **recto/verso carte par carte**. Les
photos 3 / 5 / 7 / 9 sont les quatre rectos en **810×1080**, sous pochette, de
face, plein cadre. Installées en `art.mercari.jpg` (ledger `mercari.json`), à
côté des vignettes officielles qui restent en `thumb.jpg`.

Lu sur les cartes : 忍-1 3/1 · 1/0 · coût 0 · 忍 | 忍-2 3/1 · 0/0 · coût 0 · 炎 |
忍-3 1/1 · 0/1 · coût 0 · 武 | 忍-11 5/3 · 3/2 · coût 4 · 幻 — toutes marquées
**NOT FOR SALE · BANDAI 2003 MADE IN JAPAN**.

Corroboration : Suruga-ya **kaitori GL734891** sert un scan à plat de 忍-11（PS）
(348×512). **Ne pas l'ajouter au TSV Suruga** : `PRINTED_RE` n'y connaît pas
（PS）, la ligne serait lue « 忍-11 » et le scan atterrirait sur la carte de
booster. Les ids voisins (GL734886…894) sont d'autres jeux — pas de bloc
contigu.

Ce qui n'a rien donné avant ça, pour mémoire : Fril (6 requêtes), eBay (4),
buyee (202 vide), zenmarket (403 Cloudflare), jauce, aucfan, le dump officiel
carddas.com, le CDX du mini-site Bandai. **Yahoo Auctions reste 403 EEA** depuis
ce conteneur.

## Complétude — la vue à quatre axes (`logs/completeness.md`)

« Le catalogue est-il complet ? » n'a pas une réponse mais quatre, et les
confondre a longtemps fait croire le catalogue plus pauvre qu'il n'est. Un
tirage peut avoir un **numéro** sans **titre**, un titre sans **image**, une
image sans **détail de jeu**. `buildCompleteness.ts` produit la vue par axe,
avec la **provenance** de chaque face, à chaque `--only known`.

État au 2026-08-19 :

| Locale | Tirages |            Image |             Titre | Détail de jeu | Image sans titre | Titre sans image |
| ------ | ------: | ---------------: | ----------------: | ------------: | ---------------: | ---------------: |
| **FR** |     904 |     859 (95,0 %) |  889 (**98,3 %**) |             0 |               15 |               45 |
| **EN** |    4437 | 4437 (**100 %**) | 4261 (**96,0 %**) |             0 |              176 |                0 |
| **JA** |    1442 |     796 (55,2 %) | 1368 (**94,9 %**) |  393 (27,3 %) |               74 |              646 |
| **IT** |     434 |     122 (28,1 %) |  410 (**94,5 %**) |             0 |               24 |              312 |

**Le numéro, lui, est presque complet** — mesuré contre les plages publiées par
Bandai :

| Famille   |    Publié |     Tenus | Absents |
| --------- | --------: | --------: | ------: |
| 忍        |       417 |       391 |      26 |
| 術        |       361 |       351 |      10 |
| 作        |       337 |       334 |       3 |
| 依        |        46 |        42 |       4 |
| 騎        |         8 |         8 |       0 |
| **total** | **1 169** | **1 126** |  **43** |

**96,3 % de l'univers publié est au catalogue.** Ce qui manque n'est donc pas
« des cartes » mais **des images** (JA, IT) et **des détails de jeu** (partout
sauf un quart du JA).

**D'où viennent les faces** — et c'est une mesure de fragilité autant que de
couverture :

- **FR** : carddass 724, coleka 120, reconstructed 10, corrected 5
- **EN** : **drive 4193**, vintage 242, goat 1, legacy 1
- **JA** : suruga 439, nikita 195, fril 100, carddas 26, yahoo 11, avalon 10, ebay 9, mercari 5, zabuza 1
- **IT** : coleka 71, ebay 50, cardgameclub 1

L'EN tient à **94 % d'un seul dump Google Drive**, le FR à 84 % de carddass.fr.
Si l'un des deux disparaît, il n'y a pas de second exemplaire — ce sont eux
qu'il faut sauvegarder en priorité, pas les combler.

### Les 7 hôtes du 2026-08-19 — 5 déjà tranchés, 2 neufs

| Hôte                                                                                               | État                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ccgtrader.net/games/naruto-ccg](https://www.ccgtrader.net/games/naruto-ccg)                       | **harvest** au backlog depuis le 17/08. 35 slugs de sets, HTML souvent vide, assets = l'API Vintage qu'on a déjà (`art.vintage` 750×1050). L'EN est à **100 % de faces** — rien à y gagner en image.                |
| [Goat CrystalCommerce](https://goatcardsshop.crystalcommerce.com/catalog/naruto_ccg_singles/3837)  | **recheck**. `art.goat` 350×490 déjà installées s1–s27, packshots display s16/s19/s21–23/s27 faits.                                                                                                                 |
| [Narutopedia CCG](https://naruto.fandom.com/wiki/Naruto_Collectible_Card_Game)                     | **skip** — saute la s24, article encyclopédique sans scans.                                                                                                                                                         |
| [lineage2universe](https://naruto.lineage2universe.com/)                                           | **skip** — set 29 custom, pas de CDN Bandai.                                                                                                                                                                        |
| [Neokyo](https://neokyo.com/blog/naruto-cards-guide-rare-valuable-cards-and-how-to-identify-them/) | **skip** — argumentaire proxy, « Japan-only » faux.                                                                                                                                                                 |
| **narutodex.com**                                                                                  | **NOUVEAU → piège**. 3 504 captures Wayback, mais les visuels sont `NR-BP-008`, `NR-CR-016` : c'est du **Kayou**, et les articles parlent de grades et de boxes Kayou. Autre éditeur, déjà sur la liste des pièges. |
| **narutocards.net**                                                                                | **NOUVEAU → à exploiter, pour les noms.** Voir ci-dessous.                                                                                                                                                          |

### narutocards.net — la base EN vivante qui manquait au backlog

**2 289 fiches**, filtres symbole / type / coût / combat / rareté, slugs qui
portent **le nom ET la ref** (`akamaru-n-036`, `prompt-instruction-m-us043`), et
un **sitemap de 178 Ko** qui énumère tout : un seul fichier, aucun crawl.

**Images : rien à prendre.** Le HQ est en `cards-hq/{id}.webp` mesuré à
**640×912**, sous nos 750×1050 (`art.vintage`, `art.drive`) — et l'EN est déjà à
100 % de couverture.

**Noms : c'est là que ça vaut.** Le vrai manque EN, ce sont les **176 cartes qui
ont une face et aucun titre**. Mesuré sur le sitemap : **82 sont nommables ici** —

| Préfixe     | Nommables |
| ----------- | --------: |
| `nus` (tin) |        34 |
| `jus` (tin) |        17 |
| `prus`      |        15 |
| `pr`        |        13 |
| `mus`       |         2 |
| `cus`       |         1 |

2 258 des 2 289 slugs se parsent ; 28 échappent (`-n-c013`, `-pr-008r`, suffixes
de variante à qualifier). **Réserve à trancher avant d'écrire** : le nom se
déduit du slug, donc il hérite de leurs coquilles (`...-spell-fomula-j-006`) et
perd la ponctuation. C'est un nom **dérivé**, pas attesté — ledger
`narutocards-net.json`, `ingest: none` en attendant l'arbitrage.

### « 428 cartes JP » — l'arithmétique complète

Le compteur du site est vérifiable ligne à ligne, et **rien ne se perd** :

```
428 <tr> dans le HTML  →  428 lignes parsées  (0 perdue)
                       →  393 cartes distinctes
                          ├─ 386 numéros 巻ノ (ni/te/ta/cl/ki)
                          └─   7 promos (PR忍-6/10/12, PR作-3/6/16/21)
                       +  35 lignes surnuméraires = 33 numéros listés 2 ou 3 fois
```

Les 7 promos sont au catalogue avec leur face `art.nikita`. Les 35 lignes en
trop, elles, méritaient mieux qu'un repli — voir ci-dessous.

Confronté aux plages publiées par Bandai (`cardcheckbox-jp.json`), le site
couvre **386 des 1 169 numéros** :

| Famille   |  nikita |    Publié | Jamais listé |
| --------- | ------: | --------: | -----------: |
| 忍        |     123 |       417 |          294 |
| 術        |     128 |       361 |          233 |
| 作        |     119 |       337 |          218 |
| 依        |      15 |        46 |           31 |
| 騎        |       1 |         8 |            7 |
| **total** | **386** | **1 169** |      **783** |

Ses trous commencent au premier volume : **忍-3, 忍-17, 忍-19, 忍-20, 忍-22〜25,
忍-30, 忍-31**. Des 騎士 il n'a que 騎-7 — nos huit viennent d'eBay. Le
« (428 枚) » compte **leurs** fiches, doublons compris ; ce n'est pas la taille
du jeu.

Notre catalogue JA tient **1 442 tirages** : **1 071** numéros 巻ノ (92 % des
1 169 publiés), **313** des lignes annexes 疾風伝 / 忍者学校, **58** promos.
**Le catalogue dépasse largement nikita en entrées** — ce qui manque, ce sont
des images.

### Les 33 doublons n'en étaient pas tous — correctif

Premier jet : les 33 numéros listés plusieurs fois étaient repliés sur une seule
fiche, l'autre libellé de set conservé dans `alsoListedIn`. Vérification faite,
**5 d'entre eux divergent pour de bon** :

| Id       | Ce qui change                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| `ni0001` | seconde **réplique** : « 風雲姫は、オレが守るンだってばよ！！ » (tie-in film) au lieu de « オレってば、もう二度と… » |
| `ta0043` | seconde réplique : « 顔を出さないで！敵に気付かれます！ »                                                            |
| `ta0116` | 巻ノ六 → 巻ノ八, texte de règle reformulé (`術の応酬` → `術の応酬の`)                                                |
| `te0146` | 巻ノ八 → 巻ノ十, effet précisé (`目標は+2/±0` → `目標はターン中、+2/±0`)                                             |
| `te0160` | 巻ノ八 → 巻ノ十, `精神属性+中忍` → `精神属性＋中忍`                                                                  |

Ce sont des **réimpressions**, pas du bruit : replier, c'était effacer la seule
trace que la carte a été imprimée deux fois avec un texte différent. `factsByDiskId`
garde désormais ces lignes **entières** dans `variants`, et ne réduit à
`alsoListedIn` que les doublons **strictement identiques** (27 sur 33). Deux
tests couvrent la distinction.

### Le plafond JA / IT, mesuré (2026-08-19)

Objectif demandé : 100 % en JA et IT. **Ce n'est pas atteignable depuis les
sources publiques**, et voici le chiffre derrière chaque mur plutôt qu'une
impression.

**Où en est le manque** — JA 646, IT 312 :

| JA, ce qui manque                                                           |       N | Où ça se joue                                                                                                      |
| --------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------ |
| lignes annexes 疾風伝 / 忍者学校 (`shi` 129, `mju` 94, `msa` 34, `gaku` 39) | **296** | Autre produit : nikita `nrts` n'en a que **13** (toutes ingérées). Le reste n'a **aucune source d'images connue**. |
| tabletop 巻ノ (`ni` 99, `te` 101, `ta` 100, `cl` 9)                         | **309** | Places de marché uniquement                                                                                        |
| promos (`prni`, `prta`, `opni`…)                                            |  **41** | Collage à l'unité                                                                                                  |

| IT, ce qui manque                   |       N |
| ----------------------------------- | ------: |
| `ni` 150, `te` 93, `ta` 47, `cl` 22 | **312** |

**Les sources vivantes sont à leur fond :**

- **Fril** : passé de 3 à **12 pages par requête** — 174 annonces, 123 ids
  distincts, **+5 faces seulement**. La courbe est plate : le stock réel de la
  place de marché pour ce jeu tourne autour de 123 cartes, on les a.
- **アヴァロン** : 39 fiches, pas de pagination.
- **nikita** : 393 (巻ノ) + 13 (疾風伝) — **tout est téléchargé**. Le site annonce
  428 cartes pour un univers de ~1 169 numéros : il ne couvre qu'un tiers.
- **Suruga** : 44 CDN encore en 404, recherche derrière Cloudflare.
- **Yahoo Auctions** : **403 EEA** depuis ce conteneur — le plus gros gisement
  japonais, inaccessible sans accès JP.
- **Archives** : mesurées mortes plus haut (cardgame-club 4 images sur ~700,
  aucun site officiel JA/IT archivé avec ses visuels).

**Ce qui reste réellement possible**, dans l'ordre de rendement : un accès JP à
Yahoo Auctions ; du minage Mercari à l'unité (les URLs `static.mercdn.net` se
téléchargent sans session) ; d'autres boutiques eBay.it à titres disciplinés
comme `davidborghfbperfectcards` ; et pour les lignes 疾風伝, un scan physique —
personne ne les a publiées.

### nikita — les autres jeux du site ne valent pas une intégration

Mesuré le 2026-08-19 : `dbfw` **464 cartes**, `dbs` **68**, `lor` **6**. Or notre
pack `dbs/fw` tient déjà **3 003 cartes JA** et `dbs/cg` 8 434 : nikita
n'apporterait aucune couverture, seulement d'éventuels champs de jeu en japonais
sur un sous-ensemble. Lorcana à 6 cartes est du bruit. **Rien à brancher.**

### 疾風伝 — les préfixes imprimés ne se repliaient pas

`忍伝-037` / `術伝-023` / `作伝-026` rendaient **null** : seule la forme latine
(`shi037`) était comprise, donc aucune face 疾風伝 ne pouvait être jointe. Même
classe de bug que le `K` du 騎士 ce matin. Corrigé dans `collectorIdentity`
(忍伝 → `shi`, 術伝 → `mju`, 作伝 → `msa`, avec 忍伝-学 → `gaku` testé **avant**
puisque c'est un préfixe plus long), et gardé par trois tests.

Dans la foulée, le jeu `nrts` de nikita est branché : **13 faces**, les seules
que nous ayons pour cette ligne. Piège consigné dans le code — sous `nrts`,
`N-037.jpg` est 忍伝-037, pas 忍-37 ; joindre sur la lettre aurait posé une face
疾風伝 sur une carte de booster.

### nikita — la vue texte est branchée : 393 fiches de jeu

On n'en prenait que les images (`?mode=img` → 393 `art.nikita`). La vue texte
`/cardlist/nrt` est une **base de données de jeu**, désormais exploitée.

`parseNikitaCardlist.ts` lit une ligne par carte et en sort : nom, famille,
**set** (巻ノ…, プロモーションカード, ※確認中), **シンボル** (un ou deux : 水／土),
**コスト**, 戦闘力, 支援力, 負傷戦闘力, 負傷支援力, **特徴**, **戦闘属性**,
**【目標】** et **【効果】** séparés, et la réplique. Quatre maquettes
différentes selon la famille — 忍/騎士 ont les valeurs de combat, 術/作戦 ont
目標+効果, 依頼人 a 特徴+効果 — le parseur les gère toutes.

`scrapeNikitaCardlist.ts` récupère la page, l'archive en staging et écrit
**`data/naruto/carddass/facts-ja.json`**, clé = id disque. Câblé dans l'étape
`scrape` du CLI.

Passe du 2026-08-19 : **428 lignes → 393 ids**, **0 non mappé**.

| Champ             | Cartes |
| ----------------- | -----: |
| coût              |    291 |
| valeurs de combat |    127 |
| 特徴              |    142 |
| effet             |    366 |
| réplique          |   ~426 |

Deux pièges rencontrés, tous deux couverts par des tests :

- le ref du **騎士 est écrit en latin** (`K-7`) alors que toutes les autres
  familles sont en kanji — replié vers 騎-7 ;
- **32 numéros sont listés deux ou trois fois**, une fois sous un volume et une
  fois sous les seaux « ※確認中 » du site, stats identiques. Le volume confirmé
  gagne quel que soit l'ordre du document, et les autres libellés sont gardés
  en `alsoListedIn` plutôt que jetés.

Les faits vont dans **leur propre fichier**, pas dans `cards-index.json` : la
forme `CardsIndexLangFiles` est partagée par tous les packs, un bloc de stats
Naruto n'a rien à y faire (même raisonnement que le `masters_superset.json` de
DBS). Reste à faire : une table `print_facts` dans `catalog.sqlite` et
l'exposition côté fiche — le fichier est prêt, la jointure ne l'est pas.

### PR騎-1 — à ne pas confondre

`prki0001` = **PR騎-1 テムジン**, le 騎士 de la **スペシャルファイリングシート** du
_Vジャンプ_ de septembre 2005 : feuille de 4 envoyée sur demande postale (200 ¥) —
PR忍-015, PR騎士-001, PR作-018, PR依-001. Ni 騎-1 ni 騎-7 (les deux テムジン de la
série normale, tous deux en image). Séquence promo, carte distincte, stub nommé
sans face.

### Lot de 18 URLs du 2026-08-19 — tout est déjà tenu

13 annonces Mercari distinctes + 1 Fril + 1 buyee + 3 Suruga déjà connues.
Identifiées une par une (photo lue, pas titre de vendeur) : **騎-1 ×1, 騎-2 ×2,
騎-4 ×3, 騎-5 ×1, 騎-6 ×2, 騎-7 ×3, 騎-8 ×1**. Aucun 騎-3, aucun numéro neuf —
la famille était déjà complète, et nos faces eBay (1200–1600 px, scan à plat sur
fond neutre) sont au-dessus de ces photos de vendeur (cartes en biais, sur tissu,
certaines filigranées). **Rien ingéré : ce serait un doublon de moindre qualité.**

Ce que le lot a apporté, c'est un hôte : l'annonce Fril remontée depuis buyee a
ouvert **Fril / ラクマ**, ci-dessous.

### eBay.it `davidborghfbperfectcards` — +45 faces IT, la meilleure passe italienne

La boutique que tu as repérée tient **50 annonces Naruto** avec des titres
normalisés : `NARUTO TCG <SET ITALIEN> <PERSONNAGE> <REF> [HOLO] ITA NM`. Lue
une fois au navigateur (URL fournie), **traitée comme un collage** : les 50
lignes sont entrées au ledger `ebay.json` et c'est `installEbayFaces` — qui ne
lit que le ledger — qui a posé les fichiers. **Aucun crawler n'a été écrit**, la
règle « pasted CDN URLs only, do not crawl seller stores » tient.

**45 ingérées, 5 rejetées.** IT : **77 → 122 faces, 18,7 % → 28,1 %** ; tirages
nommés sans face 335 → 312. Et la qualité est la meilleure de toutes les sources
italiennes : scans holo sur fond noir, carte plein cadre.

Ce que les rejets disent :

- **quatre promos à numéro en S** — `NI-S12`, `NI-S02`, `NI-S15`, `ST-S04` :
  une **séquence promo italienne que notre modèle ne connaît pas**. Rejetées,
  pas inventées. C'est une vraie question ouverte de catalogue.
- **un doublon de ref** : deux annonces disent `TE-05` pour deux cartes
  différentes (_Tecnica Superiore_ et _Tecnica delle Lame di Vento_). L'une des
  deux est mal étiquetée par le vendeur ; on ne devine pas laquelle, la seconde
  est écartée.

Deux choses lues sur les cartes elles-mêmes :

- les familles s'appellent **NINJA / TECNICA / STRATEGIA** en italien — et
  `ST-69` est bien un `ta` (Strategia), ce qui confirme le mapping ST → mission ;
- pied de carte `BANDAI 2006 MADE IN BELGIUM`, même presse que le FR.

**`setCode` laissé nul volontairement** : les noms de séries italiens sont notés
(_La Forza della Foglia_, _Le Spire del Serpente_, _Vendetta e Redenzione_,
_La Maledizione della Sabbia_) mais l'ordre n'est pas vérifié — `TE-173` sort en
_Vendetta e Redenzione_ alors que `TE-144` sort en _Maledizione della Sabbia_.
Le numéro suffit à joindre ; l'appartenance de série reste à qualifier.

### Fril / ラクマ — ingesteur livré, +47 faces JA

`parseFrilListing.ts` + `scrapeFrilShop.ts` (étape `scrape` du CLI) : 5 requêtes
par famille, 3 pages max, une requête à la fois avec délai. Chaque résultat
porte ses propres attributs — id, titre propre, prix — et une image paresseuse
sur `data-original` ; on lit ceux-là, jamais le balisage autour. La photo passe
de `/m/` à `/l/`.

Passe du 2026-08-19 : **154 annonces retenues → 119 ids distincts → 119 faces
écrites, 0 échec, 446 annonces écartées**. **43 cartes n'avaient aucune image.**
JA : **734 → 781 faces (51,4 % → 54,3 %)**, 694 → 657 tirages nommés sans face.

Ce que le module refuse — c'est là qu'est le travail :

| Garde               | Ce qu'elle attrape                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lots                | まとめ / セット / **2枚 et plus** / plages `忍-25～27` / une ref suivie de nombres nus (`忍-220 221 222`, le vendeur cesse de répéter le préfixe). `1枚` reste un single.                                                                            |
| autres lignes       | 疾風伝, 忍伝, 術伝, データカードダス, ミラクルバトル, ウエハース, Kayou, ROAD TO NINJA, ナルティメット, Boruto                                                                                                                                       |
| plusieurs refs      | deux refs distinctes dans un titre = lot                                                                                                                                                                                                             |
| **bornes publiées** | un numéro hors de ce que Bandai a imprimé (忍 1-417, 術 1-361, 作 1-337, 依 1-46, 騎 1-8, d'après `cardcheckbox-jp.json`) **ne mint rien** — c'est une coquille de vendeur. Les séquences promo (PR忍, OP忍) n'ont pas de maximum publié et passent. |

Et ce qu'il ne refuse pas, exprès : `＆` n'est **pas** un signal de lot — 忍-264
est imprimé _奈良シカマル&テマリ_, une seule carte avec deux personnages.

**Le module mint, et c'est voulu** : une ref dans les bornes publiées que le
catalogue ne tenait pas devient un tirage. Cinq sont apparues ainsi
(忍-181, 忍-343, 忍-367, 忍-391, 忍-392, 術-303) — elles existent, elles
n'étaient nulle part ailleurs. Les noms leur manquent encore : Fril donne une
face, pas un nom (les titres de vendeurs sont trop libres pour ça).

`art.fril` est classé en dernier recours, sous nikita / carddas / suruga : ce
sont des photos de vendeur, parfois en biais sur un bureau. Vérifié à l'œil sur
un échantillon — 術-24, 術-171, 術-231, 術-303 sont bien des cartes seules,
correctement mappées.

### Noble Knight — scellé EN, 53 SKU à inventorier

[eu.nobleknight.com](https://eu.nobleknight.com/Products/Naruto-CCG---Booster-Boxes-and-Packs)
tient encore un rayon **Naruto CCG scellé : 53 produits annoncés**. C'est la
meilleure piste packshots EN vue jusqu'ici (Goat ne couvre que s16 / s19 /
s21–23 / s27). Non inventorié aujourd'hui : la grille produits ne se rend pas
hors navigateur complet — aucune tuile dans le DOM après défilement, seules les
images de chrome du site sortent. Ledger : `curated/sources/nobleknight.json`,
`ingest: none` en attendant un rendu JS.

**Conclusion opérationnelle** : l'IT se remplit carte par carte depuis les
places de marché (eBay.it, Subito, Delcampe), exactement comme NI-03 et NI-20
ce jour. Ce qui vaudrait le coup, c'est d'outiller ce geste — coller une URL,
lire la ref sur la carte, installer — plutôt que d'attendre un dump qui
n'existe pas.

### 騎士 — une famille entière ajoutée, 8/8 en images

`騎` n'existait nulle part chez nous : ni dossier disque, ni préfixe
(`collectorIdentity` ne connaissait que `PR騎` → `prki`), et
`parseNikitaNrt` sautait la clé `K` « not a collector prefix we mint ». Trois
attestations indépendantes ont retourné cette décision :

- **cardcheckbox** donne les plages 騎-1〜6 (拡張ファイリングシート, 2005-08-25)
  et 騎-7〜8 (巻ノ十三) ;
- **nikita** sert `K-007.jpg`, et sa vue par type
  [`?ctype=騎士`](https://tcg-db.nikita.jp/cardlist/nrt?ctype=%E9%A8%8E%E5%A3%AB)
  ne liste qu'**1 carte** : K-7 テムジン, 巻ノ十三, R, 火, coût 4, 5/2, 騎士／男／ゲレル ;
- la **fandom pt-br** l'explique : « **Cavaleiro (騎士, Kishi)** — foi um quinto
  tipo de carta específico para os guerreiros de _A Lenda da Pedra de Gelel_,
  visto que eles não se encaixavam na categoria de Ninja ». Sa page porte aussi
  l'échelle de rareté N / R / SR / UR et le scan `(Guerreiro).png` = 騎-7 en
  724×1024.

Donc **cinquième famille de base**, pas une ligne annexe : `knight` dans
`NarutoCollectorFamily`, dossier `cards/knight/`, préfixe disque `ki`, needle de
recherche `ki`, `騎` → `ki` au repli kanji, `Chevalier` côté catégorie affichée,
et `K` rendu au parseur nikita. `PR騎` reste promo — `narutoCollectorsMatch("騎-1",
"PR騎-1")` est faux, et un test le garde.

État après la passe : **la famille est complète — 8 numéros sur 8, tous avec image**.

| Ref  | Nom             | Source                 | Note                                                                        |
| ---- | --------------- | ---------------------- | --------------------------------------------------------------------------- |
| 騎-1 | テムジン        | eBay 1600×1600         | BANDAI 2005 MADE IN **CHINA**                                               |
| 騎-2 | —               | **introuvable**        | Aucun hôte ne l'a servi. Absent aussi du bloc Suruga.                       |
| 騎-3 | Haido's Soldier | eBay + Suruga          |                                                                             |
| 騎-4 | Kamira          | eBay + Suruga          |                                                                             |
| 騎-5 | Ranke           | eBay + Suruga          |                                                                             |
| 騎-6 | フガイ          | eBay + Suruga          |                                                                             |
| 騎-7 | テムジン        | eBay + nikita + fandom | BANDAI 2005 MADE IN **JAPAN** — deux tirages distincts dans la même famille |
| 騎-8 | Haido           | eBay + Suruga          |                                                                             |

Les refs ont toutes été lues sur les cartes (recadrage du coin bas-gauche), pas
sur les titres de vendeur. Le bloc Suruga `GL406888`→`GL406895` s'enchaîne
依-41, 依-42, 騎-3 … 騎-8 : il **saute 騎-1 et 騎-2**, cohérent avec deux produits
d'origine différents. `依-41` (紅明) et `依-42` (ヒトデ) étaient nommés sans image
— désormais servis.

Les **noms JA sont lus sur les cartes** (bandeau de nom recadré, pas le titre du
vendeur qui romanise) et consignés dans `ebay.json` avec le coût :
騎-1 テムジン (4), 騎-3 ハイド兵 (0), 騎-4 カミラ (3), 騎-5 ランケ (3),
騎-2 ハイド (1), 騎-6 フガイ (3), 騎-7 テムジン (4), 騎-8 ハイド (2). Deux ハイド
(騎-2 coût 1, 騎-8 coût 2) et deux テムジン (騎-1, 騎-7) coexistent dans la
famille. **Ils ne sont pas encore
joints au catalogue** : les titres JA passent par `mergeAttestedLedgers`
(`parseCarddasJpExtras` pour gaku / maku / promo) et il n'existe pas encore de
ledger de noms 騎 — les 7 cartes ont donc une image et pas de nom. C'est le
prochain petit pas.

Corrigé au passage : `installEbayFaces` n'acceptait que du webp
(`extFromMagic(buf) !== ".webp"` → rejet). eBay sert `s-l1600` en jpg sur
certaines annonces, dont les sept 騎 — il lit maintenant les octets, pas
l'extension.

### アヴァロン — ingesteur livré

`scrapeAvalonShop.ts` (+ `parseAvalonShop.ts` et ses tests) : une page de
catégorie, décodée EUC-JP, dont on ne garde que les titres ouvrant sur une ref
忍/術/作/依/騎 — ce qui écarte d'un coup la barre latérale du site (ONE PIECE,
遊戯王…) et la ligne ナルティメット de la même boutique. Câblé dans l'étape
`scrape` du CLI. Première passe : **39 faces écrites, dont 8 sur des cartes qui
n'avaient aucune image**. `art.avalon` est enregistré en dernier recours dans
`NARUTO_FACE_PRIORITY` (photo boutique 265×400, pas un scan).

### NI-020 うちはサスケ — 5 URLs collées, 2 faces installées

| URL                                                                 | Verdict                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [eBay 383885835404](https://www.ebay.com/itm/383885835404)          | **Installée** → `ni0020/it/art.ebay.webp` (1054×1410). Italien lu sur la carte : SASUKE UCHIHA / _Villaggio della Foglia / Genin / Uomo / Sharingan_ / AGIRE IN SOLITARIO / FUOCO ; pied « BANDAI 2006 MADE IN BELGIUM ». **Première face IT de cette carte.** Le lien `.ca` renvoie 403 partout, `.com` sert la même fiche. |
| [Mercari m31428055920](https://jp.mercari.com/item/m31428055920)    | **Installée** → `ni0020/ja/art.mercari.jpg` (810×1080). Version non-holo, de face, plein cadre, sans pochette. `curated/…/ja/source.mercari.jpg` — le `source.jpg` du dossier appartient déjà au scan Yahoo.                                                                                                                 |
| [Mercari m60230568071](https://jp.mercari.com/item/m60230568071)    | Ledger `ingest: false` — holo mais en biais, sous pochette, reflet sur l'art.                                                                                                                                                                                                                                                |
| [Suruga GL410578](https://www.suruga-ya.jp/product/detail/GL410578) | **Nouvelle ligne au TSV** (`GL410578 忍-20`, 458 lignes) : cet id n'y était pas. La fiche HTML est en 403 Cloudflare mais le CDN sert `gl410578.jpg` — scan à plat, 348×512, le mieux cadré des quatre, le plus petit.                                                                                                       |
| clubpatio.sedarim.shop                                              | **Piège** — pas une boutique : un miroir Mercari. Sa photo produit _est_ une URL `static.mercdn.net`, son SKU `[m3597232Mzcs]` un id Mercari maquillé, à 43 333 ¥ pour un 忍-20. Ne pas l'ouvrir comme un hôte.                                                                                                              |

Deux constats en passant :

- **`static.mercdn.net` se télécharge sans session JP** (5 photos tirées en direct
  le 2026-08-19). Le commentaire « mercdn dies without a JP session » de
  `installMercariFaces.ts` ne vaut plus pour les URLs `item/detail/orig/photos/`.
- La face JA affichée **reste le scan Yahoo** : le classement note la surface du
  fichier (900×1200) et ne voit pas que la carte n'y occupe que ~40 % du cadre,
  contre ~95 % chez Mercari. Même défaut que Coleka FR vs carddass — réglé
  là-bas par `NARUTO_FR_PUBLISHER_SOURCES`, sans équivalent ici (les deux sont
  des photos de collectionneur).
- `ni0020/it` **a une face et pas de nom italien** — comme `ni0002`. Les 273
  titres IT de `cardgameclub-it-cardlist.json` ne couvrent ni NI-02 ni NI-20,
  alors que le nom est lisible sur la carte elle-même.

---

### P0 du 2026-08-18 — exécutés le 2026-08-19 (état réel plus haut)

1. **Promouvoir Drive Enhanced → `cards/`** — **pas fait**. Les 6 zips Google
   (`~/Downloads/Naruto CCG/Naruto CCG-20260817T223052Z-1-00{1–6}.zip`, ~12 Go)
   sont extraits et fusionnés : **5450** fichiers sous
   `data/naruto/carddass/staging/naruto-ccg-drive/hub/` dont **4405** PNG
   Enhanced. Fansets restent staging. Commande (skip unzip si hub déjà là) :

   ```sh
   pnpm naruto:cards -- --only scrape --locale drive
   # optionnel : --sets s1,s2,s28
   # prochaine fois, unzip auto :
   pnpm naruto:cards -- --only scrape --locale drive --staging-only \
     --drive-local "$HOME/Downloads/Naruto CCG"
   ```

   Code : `ingestNarutoCcgDriveLocalExport.ts` (`--drive-local` /
   `NARUTO_DRIVE_EXPORT_DIR`). Google découpe en zips **indépendants** (~2 Go),
   pas un split `.001`.

2. **Index / layout GAKU SHI MJU MSA** — code disque (`gaku/` `shi/` `mju/`
   `msa/`) + `migrateNarutoCardLayout` livrés. **Vérifier** que
   `pnpm naruto:cards -- --offline --only index` (ou sync admin) a bien
   déplacé `ninja/gaku0001` etc. `--only migrate-layout` **n’existe pas**.
   Regenerer `known-cards.md` / `coverage.md` après.

3. **Purge `art.jpg` safe-delete** — **pas exécuté**. 128 fichiers
   (`art.jpg` + `art.drive.webp`, `face.json` → drive). Liste :
   `data/naruto/carddass/logs/art-jpg-safe-delete.txt`. **Ne pas** bulk-delete
   les **1761** orphelins EN (thumbs 200×285 / 321×450, seule face) — rapport
   `art-jpg-orphans.json`. 0 jumeaux byte-identiques.

### NI-003 JA (忍-3 / 春野サクラ) — 2026-08-18

Face JA **ingérée** depuis Mercari `m63902869042` :
`cards/ninja/ni0003/ja/art.mercari.jpg` (curated `source.jpg`).
Printed **忍-3** (sans préfixe OP/PR), BANDAI **2002**, pose debout main
sur la hanche = FR NI-03.

Les 7 URLs collées (eBay / Mercari / Rakuma) sont **OP忍-3** 2005
(art timide + sakura) — déjà `opni0003`. Lot eBay `235949420497` =
OP忍-3 + **忍-69**. Ledger : `curated/sources/mercari.json`
(`ingest: false` sur les OP). Ne pas crawler Mercari.

Faux positifs déjà notés (Yahoo) : NFS 2003 combat ; BANDAI 2004 manteau.

Hôtes toujours vides pour _cette_ face : carddas.com `shinobi-003_1.gif`
(404), nikita `N-003.jpg` (404), Suruga search 0 listing 忍-3.
`ni0003-ps` reste un stub titre. `prni0003` / `opni0003` ont leurs scans
Yahoo.

### P1 visuels manquants

4. **IT cardgame-club Magento** — scraper faces livré (`--locale s6it`). HTML
   Wayback S1–S6 OK (**123** titres, **121** URLs dans
   `staging/cardgameclub-it/faces.json`). **JPEG cache 404** (Wayback). Extract
   2026-08-18 a **timeout 2400s** en retentant chaque JPEG 45s. Désormais :
   ledger existant → skip crawl ; **3 404 consécutifs → skip le reste**
   (timeout 8s). Relancer CDX `media.cardgame-club.it/catalog/product/*` plus
   tard, puis `redownloadOnly` si des captures apparaissent.

5. **Coleka S6 IT** — **71** `art.coleka` réinstallés. **64** fiches sans
   photo (`ni309` / `ta240` / `te263` + le reste). Re-scrape `_r41388` plus
   tard (mur verify).

6. **JA Suruga** — **33** CDN 404 à retenter (URLs déjà au ledger, pas de
   scrape HTML Cloudflare).

7. **JA carddas Wayback** — CDX 2182 hits déjà en staging. Mapper étendu :
   `shinobi-146_7` / `jutsu-348_17` / dumps `/card/shinobi-352.gif` **si**
   l’id est au cardlist officiel. 10 faces installées cette passe. nikita
   **392** déjà sur disque, 0 nouveau. Tabletop JA named+noArt **363**.

8. **FR Ultrajeux `serie_1`–`4`** — **pas harvesté**. VF seulement (pas IT).
   S5 trous déjà `art.ultrajeux`. CDX
   `ultrajeux.com/images/naruto/scan/normal/vf/serie_*/` ; S1 ~37 JPEG
   échantillonnés.

### Encore ouvert (pas touché cette session)

- Reprints **PS** (toujours ouvert).
- Coleka FR S1–S5 : **542/741**, mur verify `?p=2` s1/s4/s5 ; `te080` sans
  image. Pas de captcha.
- Coleka EN covers **s7–s12** absents.
- eBay IT : coller des URLs (NI-01/02/19 déjà là) — pas de crawl boutique.
- GAKU faces : 1/40 ; Maku 3/269 (titres ledger, visuels manquent).
- Toysanta « GAKU » = **シールウエハース**, pas 忍伝-学 — ne pas mélanger.

---

## Queue (ordre de passage)

1. Coleka FR `_r41705` (~741) puis feuilles S1–S5 (`_r4108` = S1, 184) — faces `art.coleka` + noms S2 (−20 vs Coleka). **Pass 2026-08-17 : 542/741** (s1 96, s2 138, s3 124, s4 96, s5 88). Mur verify Coleka sur les dernières pages s1/s4/s5 ; `te080` sans image. Relancer plus tard, pas de captcha.
2. Ultrajeux Wayback `serie_5/` — 6 JPEG officiels des trous S5. **Done 2026-08-17** : `art.ultrajeux` + `staging/ultrajeux/serie_5/`. `pnpm naruto:cards -- --locale ultrajeux`.
3. liveinternet.ru `community/naruto_boys` — **Pass 2026-08-17** : hub Wayback 2008-05-25. 4 attachments nommés (ni089/142/155, ta151) déjà `art.carddass`. Trous S5 absents. Permalinks de posts 404. Pas de brute-force.
4. [RetroTCG `/games`](https://retrotcg.net/games) → `naruto-ccg` + tins. **Pass 2026-08-17** : 1 jeu, mêmes slugs que Vintage + `shinobis-dream` skip. Assets = `api.ccgtrader.co.uk` (`7le1t5u9evswcck4`). Pas de second dump.
5. TradeCardsOnline Wayback `game_id/48`. **Pass 2026-08-17** : HTML 2008-12-05 récupéré (formulaire s1–s10 + promo). Pas de scans. `/goal/DC` = fan.
6. cardgameclub.it — sealed IT S4–S6. **Pass 2026-08-17** : Shopify n’a que S1–S3 (6 SKUs collés). Handles S4–S6 devinés `na04ven` / `na06riv`… = 404. Pas de crawl `/collections/naruto`.
7. cardgame-club.it Magento — titres IT. **Pass 2026-08-18** : listings Wayback S1–S6 parsés (123 titres, 121 URLs faces). JPEG cache Magento **404** sur Wayback (`im_`/`id_`). Shopify live toujours sealed-only. `staging/cardgameclub-it/faces.json` prêt si le CDX images revient.
8. SciFi-Universe gamme — **Pass 2026-08-17** : S1–S4 (pas S5). 200 px = last-resort packshots (Tric Trac / Via / eBay / Manga-News gagnent). Vignette S1 + shots combinés S3/S4 non attachés.
9. Via Ludibunda — **Pass 2026-08-17** : Maître Hokage dumpé (`s/t/starter-naruto-serie-1-maitre-hokage.jpg`). Search `q=naruto` = 3 SKUs S1, pas de S2+. Tric Trac reste préféré.
10. GameXFood / Martina’s Fumetti — **Pass 2026-08-17** : GameXFood URL 404, CDX vide. Martina = starter **Il Fascino del Male** (réf. 93214), pas un booster. SKU `starter-il-fascino-del-male`.
11. Goat sealed `3970` — displays EN Coleka-missing. **Déjà fait** : s16/s19/s21–s23/s27. Ne pas minter `display-s1`…`s6`.
12. Coleka EN covers — displays **s7–s12** encore absents du paste (s13–s15/s17–s18/s20/s24–s26 + s28 déjà là).
13. Pojo spoilers + GitHub `vimbzy/NarutoCCG` xlsx s1–s5 + r/Narutoccg sheets.
14. BGG au-delà du xls S1.
15. nikita.jp — **Pass 2026-08-18** : 392 faces live, déjà `art.nikita` (0 nouveau). Reste ~600 titres 巻ノ sans scan.
16. Suruga-ya.jp — **22 CDN 404** encore (listings au TSV, JPEG boutique
    parti). 巻ノ search entièrement paginée, 0 neuf. 幕ノ / 忍伝-学 / PR忍 =
    figurines, pas de singles tabletop.
17. narutoccgfrance — fils restants (tome 12 blister, 7ᵉ inédite, présentoir Kana).
18. OCTGN `.o8g` / `set.xml` (fil Havre creux — chercher le paquet).
19. [CCG Trader `/games/`](https://www.ccgtrader.net/games/) → unique `naruto-ccg` → chaque set (sauf Shinobi’s Dream) + TCDB faces.
20. 2ᵉ tin box FR (Amazon « premier coffret ») + PicClick tin.
21. Amazon starter S1 [B0019R7M2W](https://www.amazon.fr/Bandai-Cartes-jouer-Naruto-Starter/dp/B0019R7M2W) (réf. 05110 Pays du Vent) — packshot bytes absents du CDX (404 Wayback). SKU noté dans `amazon-fr.json`. Ne pas déplacer Tric Trac.

---

## Officiel / Wayback

| Site                                                                                                                  | Lang | Faces                    | Dos            | Sealed           | Détails             | Statut  | Prochaine action                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------ | -------------- | ---------------- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [carddass.fr racine](https://web.archive.org/web/20111228103710/http://www.carddass.fr/)                              | FR   | —                        | —              | —                | hub 2011            | done    | Multi-jeux. Faces = `/naruto/`.                                                                                                                                     |
| [carddass.fr/naruto](https://web.archive.org/web/20071111162612/http://www.carddass.fr/naruto/)                       | FR   | dump CDX ~747 + thumbs   | dos FR curated | GIFs S1–S5 + tin | ZOOM séries, promo/ | recheck | S5 Apache jamais sur CDX. Ne pas re-scraper les 933 déjà là.                                                                                                        |
| [bandaicg.com CDX](https://web.archive.org/web/*/http://www.bandaicg.com/naruto/*)                                    | EN   | calendrier               | —              | tins Guardian…   | home + cardlists    | recheck | CDX 2026-08-17 : site 50k (plafond) + images 1096 → mirror 3765 / 944 card assets (surtout thumbs). Forums exclus. Cardlists déjà dans `bandaicg-en-cardlist.json`. |
| [bandaicg.com home.php](https://web.archive.org/web/20090211193529/https://www.bandaicg.com/naruto/home.php)          | EN   | —                        | —              | tins 2009, s13   | news / kits         | done    | Capture 2009-02-11 en staging. _Guardian of the Village_ + _Fateful Reunion_ = `showthread` / `attachment.php` → skip forum. Ledger `bandaicg-home.json`.           |
| [bandaicg.com cardlists](https://web.archive.org/web/20081110102739/http://www.bandaicg.com/naruto/cardlists_s1.html) | EN   | cardlists HTML           | —              | —                | N/J/M printed       | harvest | Relire `cardlists_detail` pour trous Vintage/Goat.                                                                                                                  |
| [bandai.com/naruto/images](http://www.bandai.com/naruto/images/)                                                      | EN   | s20–s27 hotlink Montréal | —              | —                | —                   | done    | Live 404, CDX `cards_s28/*` = 0.                                                                                                                                    |
| [carddas.com/naruto](https://web.archive.org/web/*/http://www.carddas.com/naruto/*)                                   | JA   | GIFs `art.carddas` (~18) | —              | product/ Wayback | 巻ノ, 幕, 忍者学校  | recheck | Live 404. CDX `*` = corpus. Reste `*_spc2.gif`. `5th.shtml` ≠ 巻ノ五.                                                                                               |
| [carddass.com/naruto](https://web.archive.org/web/20160304124212/http://www.carddass.com/naruto/product/)             | JA   | sparse                   | —              | product lists    | —                   | recheck | Moins riche que `carddas.com`. Club moderne `sec.carddass.com` = skip.                                                                                              |
| [bandai.fr](https://www.bandai.fr/)                                                                                   | FR   | —                        | —              | —                | —                   | done    | CDX ciblé : presque rien JCC. Hub = carddass.fr.                                                                                                                    |
| carddas.com.tw/naruto                                                                                                 | —    | —                        | —              | —                | —                   | skip    | Data Carddass TW.                                                                                                                                                   |

---

## Carddass FR

| Site                                                                                                                                                                                                            | Faces                             | Dos | Sealed                        | Détails                               | Statut               | Prochaine action                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --- | ----------------------------- | ------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coleka `_r41705`                                                                                                                                                                                                | thumbs CDN ; `scrape: false`      | —   | —                             | ~741 fiches                           | recheck              | Parent non scrapé. Feuilles S1–S5 : **542/741** `art.coleka` (2026-08-17). Mur `?p=2` s1/s4/s5 : **FlareSolverr** + ne plus s'arrêter à la 1re page mur.                                                                                                                                                                                                                                                        |
| [Coleka `_r4108` S1](https://www.coleka.com/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-01-le-pays-du-vent_r4108) | thumbs S1                         | —   | —                             | 184 fiches                            | recheck              | 96/184 cette passe (pages 0–1). Label Coleka = un starter, pas le nom officiel de série.                                                                                                                                                                                                                                                                                                                        |
| Coleka S6 `_r41388` (fiches FR)                                                                                                                                                                                 | photos = **IT**                   | —   | —                             | titres S6                             | done                 | Ne pas ranger en `s6` FR. Faces → IT.                                                                                                                                                                                                                                                                                                                                                                           |
| Coleka Storm 3 `_r16649`                                                                                                                                                                                        | `art.coleka` s28 FR               | —   | display-s28                   | NI/JU/MI imprimés                     | done                 | Pas l’ombrelle `_r4102`.                                                                                                                                                                                                                                                                                                                                                                                        |
| Coleka `_r4102`                                                                                                                                                                                                 | mix ~7000                         | —   | Kayou + CCG                   | —                                     | skip                 | Ombrelle.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Coleka type holo `_t58531`                                                                                                                                                                                      | —                                 | —   | —                             | filtre type, pas une feuille          | skip                 | Mur verify. Pas un dump. Ledger `coleka-holo-type.json`.                                                                                                                                                                                                                                                                                                                                                        |
| Coleka `_r38199` promos US                                                                                                                                                                                      | Pr-001… photos                    | —   | —                             | EN CCG, ≠ tin FR                      | skip FR / harvest EN | Mapping Pojo seulement.                                                                                                                                                                                                                                                                                                                                                                                         |
| [Manga-News TCG](https://www.manga-news.com/index.php/collection/TCG-Naruto)                                                                                                                                    | peu de faces                      | —   | boosters S1–S5 (pas starters) | NI/TE/TA/CL + rareté                  | recheck              | Hub. Decks : [S1](https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-1) … [S5](https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-5) déjà parsés (`staging/manga-news/`). Nouvelle Série cover = EN s24.                                                                                                                                                                                  |
| [SciFi-Universe gamme](https://www.scifi-universe.com/jeux/10095/naruto-jcc/gamme)                                                                                                                              | —                                 | —   | S1–S4 ~200 px last-resort     | prix 2006–07                          | done                 | Pas S5. Pages produit = 11649. Tric Trac / Via / eBay / MN restent devant.                                                                                                                                                                                                                                                                                                                                      |
| [narutoccgfrance](https://narutoccgfrance.1fr1.net/)                                                                                                                                                            | scans promo                       | —   | tin 5130                      | shuriken, blister Kana                | recheck              | 332 sujets ; Wayback 1 URL — crawler **live** + sauver. Pièges t1132/t1021.                                                                                                                                                                                                                                                                                                                                     |
| forumnarutoccg.com                                                                                                                                                                                              | —                                 | —   | —                             | alias                                 | done                 | Même board.                                                                                                                                                                                                                                                                                                                                                                                                     |
| [TricTrac S1–S4](https://trictrac.net/jeu-de-societe/naruto-jcc-serie-1)                                                                                                                                        | 350×495 = déjà carddass           | —   | boxes starters                | comptes communauté                    | recheck              | CDN `cdn10` sans auth. S4 thumb minuscule. Pas de faces.                                                                                                                                                                                                                                                                                                                                                        |
| [Via Ludibunda](https://vialudibunda.com/naruto-serie-1-booster.html)                                                                                                                                           | —                                 | —   | S1 booster + 2 decks          | SKU shop                              | done                 | Hokage dumpé (original Magento `s/t/…`). Search = 3 SKUs, pas S2+. Tric Trac préféré.                                                                                                                                                                                                                                                                                                                           |
| eBay `s-l1600`                                                                                                                                                                                                  | IT NI-01/02/19 `art.ebay`         | —   | booster S2                    | seller `primegame` / `gametradestore` | watch                | URLs collées seulement. Pas de crawl boutique. `s-l2048` = stub 80×80. Mythos / Data / Kayou = bruit.                                                                                                                                                                                                                                                                                                           |
| [liveinternet.ru/community/naruto_boys](https://www.liveinternet.ru/community/naruto_boys/)                                                                                                                     | raws = carddass.fr                | —   | —                             | —                                     | recheck              | Hub 2008-05-25 : 4 JPEG nommés (déjà officiels). Trous S5 absents. Permalinks `post50678084` etc. 404 Wayback. Ledger `liveinternet.json`.                                                                                                                                                                                                                                                                      |
| Ultrajeux Wayback `serie_5/`                                                                                                                                                                                    | 6 JPEG trous S5 → `art.ultrajeux` | —   | —                             | 734 fiches = copie carddass           | done                 | ni232/236/252/253 + ta221/226. Ne pas dumper le reste de `serie_5/` (déjà `art.carddass`).                                                                                                                                                                                                                                                                                                                      |
| Ultrajeux Wayback `serie_1`–`4`                                                                                                                                                                                 | JPEG VF `scan/normal/vf/serie_N/` | —   | —                             | copie carddass.fr                     | **harvest**          | **FR only**, pas IT. S1 ~37 JPEG CDX. Compléter trous FR si carddass.fr manque.                                                                                                                                                                                                                                                                                                                                 |
| [Amazon starter S1](https://www.amazon.fr/Bandai-Cartes-jouer-Naruto-Starter/dp/B0019R7M2W)                                                                                                                     | —                                 | —   | starter Pays du Vent          | ASIN `B0019R7M2W` / réf. **05110**    | done                 | HTML Wayback 2010 en staging. JPEG `ecx.images-amazon.com` = 404 CDX. Ne pas déplacer Tric Trac. Ledger `amazon-fr.json`.                                                                                                                                                                                                                                                                                       |
| [Digigame](http://digigame.centerblog.net/rub-les-cartes-de-Naruto.html)                                                                                                                                        | scans mal ID                      | —   | —                             | S1 names                              | skip                 | `staging/digigame` retiré (ex. `ni252.jpg` = NI-150). Ne pas réingérer.                                                                                                                                                                                                                                                                                                                                         |
| [cartes-naruto.com manga-cartes](https://web.archive.org/web/20081217130741/http://www.cartes-naruto.com/manga-cartes.html)                                                                                     | —                                 | —   | —                             | checklist ⊆ names                     | done                 | Ledger retiré. Capture 2008-12-17.                                                                                                                                                                                                                                                                                                                                                                              |
| [AnimeCollection `ids=200`](http://www.animecollection.fr/cartes.php?idl=4&idc=87&ids=200)                                                                                                                      | Ninja Ranks                       | —   | —                             | FR merch                              | skip                 | Pas Carddass.                                                                                                                                                                                                                                                                                                                                                                                                   |
| [AnimeCollection `ids=254`](http://www.animecollection.fr/cartes.php?idl=4&idc=113&ids=254)                                                                                                                     | Panini Ultra                      | —   | —                             | 100 + checklist                       | skip                 | Éditeur Panini, sept. 2007.                                                                                                                                                                                                                                                                                                                                                                                     |
| [manga-sanctuary 7397](https://www.manga-sanctuary.com/news/7397/naruto-jcc.html)                                                                                                                               | —                                 | —   | S6 starters **annoncés**      | Le Duel / Quartet                     | done                 | Jamais fabriqués FR.                                                                                                                                                                                                                                                                                                                                                                                            |
| kana.fr / mangakana.com                                                                                                                                                                                         | —                                 | —   | —                             | lien mort t1185                       | recheck              | Annonce Kana introuvable (264 news).                                                                                                                                                                                                                                                                                                                                                                            |
| dl.free.fr Promo.pdf                                                                                                                                                                                            | —                                 | —   | —                             | t1132                                 | done                 | HTTP 500, pas Wayback.                                                                                                                                                                                                                                                                                                                                                                                          |
| Yandex / ayaka / pds3                                                                                                                                                                                           | —                                 | —   | —                             | —                                     | skip                 | Peu/rien ; ne pas contourner CAPTCHA.                                                                                                                                                                                                                                                                                                                                                                           |
| archive.today / Common Crawl                                                                                                                                                                                    | —                                 | —   | —                             | S5 Apache                             | done                 | Trous jamais crawlés.                                                                                                                                                                                                                                                                                                                                                                                           |
| leboncoin / Vinted                                                                                                                                                                                              | photos collector                  | —   | —                             | promos attestées                      | watch                | Items déjà ledgerés : `6135082732` brillante, `6396823637` NI-63, `6462342329` PR-11, `6462335321` NI-92, `6396838490` TA-51, `6396808599` TE-34, `9000139109` Uzumaki, `9638162987` foil. **Nouveau** : [`7862134754`](https://www.vinted.fr/items/7862134754-lot-de-3-cartes-naruto) lot générique 5 € — pas d’ID imprimé. CDN `images1.vinted.net` = asset signé, pas une source. Pas d’archive. CGU scrape. |
| Delcampe                                                                                                                                                                                                        | —                                 | —   | —                             | ville 鳴門                            | done                 | 0 CCG EU.                                                                                                                                                                                                                                                                                                                                                                                                       |
| CardMarket                                                                                                                                                                                                      | —                                 | —   | —                             | —                                     | skip                 | Jeu absent.                                                                                                                                                                                                                                                                                                                                                                                                     |
| PicClick tin                                                                                                                                                                                                    | —                                 | —   | tin box                       | —                                     | **harvest**          | JS ; tin 5130 / 2ᵉ coffret.                                                                                                                                                                                                                                                                                                                                                                                     |
| Skyrock / Skyblog                                                                                                                                                                                               | —                                 | —   | —                             | —                                     | done                 | Purge 2023.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Abysse Corp                                                                                                                                                                                                     | —                                 | —   | —                             | catalogue moderne                     | done                 | Rien 2007–08.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Amazon tin Hobby 5130                                                                                                                                                                                           | —                                 | —   | tin + 2 holo                  | « premier coffret »                   | **harvest**          | 2ᵉ tin ?                                                                                                                                                                                                                                                                                                                                                                                                        |
| [tournoi-de-cartes.forumpro.fr t204](https://tournoi-de-cartes.forumpro.fr/t204-combat-de-cartes-naruto-octgn)                                                                                                  | ?                                 | —   | —                             | OCTGN 2008                            | **harvest**          | Fil creux. Chercher `.o8g` / `set.xml`.                                                                                                                                                                                                                                                                                                                                                                         |

Dos FR : `curated/cards/back.fr.png`. Aucun dos isolé Ultrajeux / Wayback.

---

## Carddass IT

| Site                                                                                                                                   | Faces                                       | Dos | Sealed                           | Détails                     | Statut  | Prochaine action                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --- | -------------------------------- | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coleka S6 Rivalità Eterna                                                                                                              | `art.coleka` ~71                            | —   | —                                | ST→ta                       | recheck | Trous visuels ni309 / ta240 / te263.                                                                                                                                                              |
| [cardgameclub.it](https://cardgameclub.it/) Shopify                                                                                    | —                                           | —   | display/booster/mazzo S1–S3      | ISSN ≠ barcode              | done    | S4–S6 absents (handles 404). Ne pas crawler `/collections/naruto`.                                                                                                                                |
| cardgame-club.it Magento                                                                                                               | listings Wayback S1–S6 ; **JPEG cache 404** | —   | —                                | 123 titres + 121 URLs faces | recheck | HTML listings OK (`staging/cardgameclub-it/faces.json`). Thumbs Magento (`media.cardgame-club.it/.../4-*.jpg`) absents du CDX. Relancer CDX `media.cardgame-club.it/catalog/product/*` plus tard. |
| [GameXFood](https://gamexfood.it/carte-naruto/naruto-card-game-rivalita-eterna-booster-ed-ita)                                         | —                                           | —   | —                                | —                           | done    | Live 404, CDX vide. Ledger `gamexfood.json`.                                                                                                                                                      |
| eBay `gametradestore` (`primegame`)                                                                                                    | IT NI-01/02/19                              | —   | —                                | S1 Bandai 2006 Belgium      | watch   | URLs CDN collées. Ne pas crawler la boutique. Ledger `ebay.json`.                                                                                                                                 |
| [Martina’s Fumetti](https://martinasfumetti.it/Libri-vari/159103-Naruto-Card-Game-rivalit---eterna-serie-6-NUOVO-ed--Bandai-Gd09.html) | —                                           | —   | starter S6 _Il Fascino del Male_ | réf. 93214                  | done    | Photo = deck 40 cartes, pas booster. SKU `starter-il-fascino-del-male`.                                                                                                                           |
| [forumfree.it](https://narutocardgame.forumfree.it/)                                                                                   | ImageShack 404                              | —   | —                                | social                      | done    | `Scambi` en erreur.                                                                                                                                                                               |

Dos IT : `curated/cards/back.it.png`.

---

## Session 2026-08-18 — VPN JP, autres hôtes

Tokyo `154.47.20.228`. **carddas.com/naruto live toujours 404** (VPN n’ouvre pas les GIFs officiels).

Nouveaux ledgers (ingest none, pas de crawl) :

- [JUGGERNAUTS `tbc28nrt.html`](http://card.g1.xrea.com/t2/tbc28nrt.html) — table SKU 巻ノ壱–十七 + jumbos/reprints absents de `sets.json` (極意忍法帳, 忍法法札絵巻, 雪姫忍法帳, 拡張ファイリングシート…). Combo sheets = mix Data Carddass.
- [dream-hobby 2022-07-17](https://dream-hobby.hatenablog.com/entry/2022/07/17/210700) — timeline Bandai (カードダス100 / EX / starters 蝦蟇・守鶴・迅雷…). 巻ノ十六 vending ≠ pack (`火の継承者` / `風の継承者`).
- [TV Tokyo goods](https://www.tv-tokyo.co.jp/anime/naruto2002/goods/card_starter.html) — copy officielle starters 巻ノ五/八/十 ; pages 疾風伝 = 忍伝/術伝 (maku), pas 巻ノ.
- Yahoo Shopping `巻ノ壱` = **vitrine Suruga** (`store.shopping.yahoo.co.jp/suruga-ya/gl636826.html`) — mêmes GL que le TSV. Pas un 2ᵉ dump.
- HobbySearch / Mandarake search : HTML 200, **0 fiche produit** TCG.

Yahoo Auctions (passe faces) reste collé listing-par-listing.

## Carddass JA

| Site                                                                                                             | Faces                         | Dos                 | Sealed                  | Détails               | Statut                          | Prochaine action                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------- | ----------------------- | --------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [nikita.jp nrt img](https://tcg-db.nikita.jp/cardlist/nrt/?mode=img)                                             | `art.nikita` ~392             | —                   | —                       | N/J/S/I → ni/te/ta/cl | recheck                         | Pass 2026-08-18 : listing live 392, **toutes déjà en `cards/`** (skip). Incomplet vs ~998.                                                                                                                                                                            |
| [JUGGERNAUTS xrea](http://card.g1.xrea.com/t2/tbc28nrt.html)                                                     | —                             | —                   | SKU table 巻ノ + jumbos | rules 2020            | done                            | `juggernauts-xrea.json`. Pas de scans. Combo sheets skip Data Carddass.                                                                                                                                                                                               |
| [dream-hobby Hatena](https://dream-hobby.hatenablog.com/entry/2022/07/17/210700)                                 | —                             | —                   | timeline Bandai 壱–十七 | starters の書         | done                            | Pas de packshots. 巻ノ十六 vending ≠ pack.                                                                                                                                                                                                                            |
| [TV Tokyo goods](https://www.tv-tokyo.co.jp/anime/naruto2002/goods/card_starter.html)                            | —                             | —                   | copy starters 五/八/十  | 疾風伝 = maku         | done                            | Live 200. Pas de JPEG faces.                                                                                                                                                                                                                                          |
| Yahoo Shopping 巻ノ壱                                                                                            | —                             | —                   | = Suruga store GL*      | singles               | skip scrape                     | Même ids que `suruga-ya-carddass.json`.                                                                                                                                                                                                                               |
| [Mercari pasted 忍-3](https://jp.mercari.com/item/m63902869042)                                                  | `art.mercari` ni0003          | —                   | —                       | 巻ノ壱 2002           | done                            | `mercari.json`. Les titres « 忍-3 » eBay/Rakuma étaient OP忍-3. Pas de crawl.                                                                                                                                                                                         |
| [HobbySearch](https://www.1999.co.jp/search?searchkey=NARUTO%20カードゲーム)                                     | —                             | —                   | 0 tile                  | —                     | done                            | Hub catégories, pas un rayon TCG.                                                                                                                                                                                                                                     |
| [Suruga-ya.jp 巻ノ](https://www.suruga-ya.jp/search?category=5&search_word=NARUTO-ナルト-%20カードゲーム%20巻ノ) | `art.suruga` 398 ok / 33 fail | —                   | singles                 | 忍/術/作/依           | recheck                         | **Pas** `suruga-ya.com` Data Carddass.                                                                                                                                                                                                                                |
| [zabuza](http://narutozabuza.centerblog.net/14-cartes-naruto)                                                    | 1 JPEG PR忍-1-R               | —                   | —                       | ≠ PR忍-1              | **épuisé (vérifié 2026-08-19)** | Les 8 images du blog relues une par une : **7 sont des captures d'anime + un bandeau cosplay**, une seule est une carte, celle qu'on tient. Le `14` du slug est l'**id du billet**, pas un nombre de cartes — d'où l'impression de sous-exploitation. Ne pas rouvrir. |
| [Slab-Z 2002](https://www.slab-z.com/post/the-definitive-2002-naruto-card-game-vintage-guide-rookies-grails)     | —                             | —                   | starter 40 / booster 6  | rookies               | done                            | Ingest none. Jump Festa 2001 ≠ TCG.                                                                                                                                                                                                                                   |
| [GradedCardCenter](https://gradedcardcenter.com/item/f96806f8-6e60-4dcd-9acd-8592855db527)                       | —                             | verso wrapper       | booster 巻ノ五          | JAN 4543112200365     | done                            | Ne pas crawler `/item/`.                                                                                                                                                                                                                                              |
| carddas JP extras (gaku / maku / promo)                                                                          | 1 face eBay gaku0001          | 疾風伝 verso staged | —                       | PR忍, OP忍, SHI, gaku | recheck                         | Titres ledger. Trous faces. GAKU = 忍伝-学 (忍者学校), même jeu — pas le TCG 2026. Dos 疾風伝 ≠ `back.ja` 巻ノ.                                                                                                                                                       |
| [Neokyo guide](https://neokyo.com/blog/naruto-cards-guide-rare-valuable-cards-and-how-to-identify-them/)         | —                             | —                   | —                       | proxy pitch           | skip                            | « Japan-only » faux.                                                                                                                                                                                                                                                  |

Dos JA : `curated/cards/back.ja.png`.

---

## CCG Bandai USA (EN + copies FR s28)

| Site                                                                                                            | Faces                       | Dos                           | Sealed                | Détails                 | Statut             | Prochaine action                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------- | --------------------- | ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Vintage / CCG Trader API](https://vintagenaruto.com/browse)                                                    | `art.vintage` 750×1050      | —                             | —                     | s1–s28 + TP/tins        | recheck            | Skip Shinobi’s Dream. French = Panini/Ultra ≠ NI/TE/TA.                                                                                                                                                   |
| [ccgtrader.net/games/](https://www.ccgtrader.net/games/)                                                        | index : 1 Naruto            | —                             | —                     | 297 jeux                | **harvest**        | Ouvrir l’index, pas seulement la fiche. Uniquement [`naruto-ccg`](https://www.ccgtrader.net/games/naruto-ccg/) (35 sets). HTML set souvent vide → navigateur. Skip `shinobis-dream`. API faces = Vintage. |
| [ccgtrader.net naruto-ccg](https://www.ccgtrader.net/games/naruto-ccg/)                                         | pages set vides HTML        | —                             | —                     | s1–s28 + TP + promos    | **harvest**        | Chaque slug (`the-path-to-hokage`, `eternal-rivalry`, `ultimate-ninja-storm-3`, `naruto-ccg-promos`, …).                                                                                                  |
| [Goat CrystalCommerce](https://goatcardsshop.crystalcommerce.com/catalog/naruto_ccg_singles/3837)               | `art.goat` 350×490 s1–s27   | non                           | displays trous Coleka | Eternal Rivalry ≠ IT S6 | recheck            | Packshots s16/s19/s21–s23/s27 faits. Pas display-s1…s6.                                                                                                                                                   |
| [stop2shop](https://www.stop2shop.com/) + turbifycdn                                                            | `art.stop2shop` 120/120 s28 | —                             | —                     | Storm 3                 | done               |                                                                                                                                                                                                           |
| [narutocards.ca](https://www.narutocards.ca/)                                                                   | —                           | —                             | —                     | tracker + Kayou         | done               | Skip kayou / set 29.                                                                                                                                                                                      |
| [TCDB Gaming N](https://www.tcdb.com/ViewAll.cfm/sp/Gaming?Let=N&MODE=Years)                                    | index                       | —                             | —                     | S1–S12 + S14–S18        | **harvest**        | Index lettres, pas seulement S1. Pas S13 / S19–S28.                                                                                                                                                       |
| [TCDB S1 2006](https://www.tcdb.com/ViewSet.cfm/sid/116757/2006-Naruto-Series-1:-The-Path-to-Hokage)            | 250×350 **403 hotlink**     | —                             | —                     | PTH/COS/CUS inventés    | harvest?           | Mapping prêt. Promos sid = grab-bag. Pas `cards/s1/en/` collision.                                                                                                                                        |
| [TCDB sid `256824`](https://www.tcdb.com/ViewSet.cfm/sid/256824/2002-Bandai-Naruto-The-Path-to-Hokage)          | —                           | —                             | —                     | « 2002 Path to Hokage » | skip               | Listing mal daté / Carddass-confused. **Reject** — ≠ `116757`.                                                                                                                                            |
| [lineage2universe](https://naruto.lineage2universe.com/)                                                        | search                      | —                             | —                     | set 29 custom           | skip               | Pas CDN Bandai.                                                                                                                                                                                           |
| [Payhip Band of the Hawk](https://payhip.com/BandoftheHawkCardShop)                                             | printables                  | —                             | —                     | custom                  | skip               |                                                                                                                                                                                                           |
| [Naruto Montréal](https://narutomontreal.wordpress.com/)                                                        | quiz2 PNG collide           | —                             | —                     | stop after s28          | done               | Photon 404. Ne pas ingérer quiz.                                                                                                                                                                          |
| [Brasil blog](https://narutocardgamebrasil.blogspot.com/)                                                       | —                           | —                             | YouTube `DCpEW7hH5qA` | rogue list, PR-032 SJ   | done               | PR-032 ≠ s28.                                                                                                                                                                                             |
| [Narutopedia CCG](https://naruto.fandom.com/wiki/Naruto_Collectible_Card_Game)                                  | —                           | —                             | —                     | saute s24               | skip               |                                                                                                                                                                                                           |
| [narutoccg.fandom](https://narutoccg.fandom.com/wiki/Naruto_CCG_wiki)                                           | —                           | —                             | —                     | PTHN-001 piège          | skip               |                                                                                                                                                                                                           |
| [TradeCardsOnline 48](http://www.tradecardsonline.com/im/selectCard/game_id/48)                                 | Wayback HTML 2008           | —                             | —                     | deck 50 = CCG           | done               | Listing = formulaire s1–s10. Pas de faces. `/goal/DC` = fan.                                                                                                                                              |
| [narutoccg.forumpolish.com t97](https://narutoccg.forumpolish.com/t97-tradecardonline)                          | —                           | —                             | —                     | mention TCO             | harvest            |                                                                                                                                                                                                           |
| [RetroTCG `/games`](https://retrotcg.net/games)                                                                 | index : 1 Naruto            | —                             | —                     | 297 jeux                | done               | Uniquement `naruto-ccg`.                                                                                                                                                                                  |
| [RetroTCG naruto-ccg](https://retrotcg.net/games/naruto-ccg)                                                    | mêmes ids Vintage           | —                             | tins listés           | closed line             | done               | `/api/card-image/` = Directus CCG Trader. Skip Shinobi’s Dream. Pas FR NI/TE/TA.                                                                                                                          |
| [BGG 22910](https://boardgamegeek.com/boardgame/22910) + file 20590                                             | —                           | —                             | —                     | S1 titles               | **harvest**        | Au-delà S1. `n-0001` ≠ `ni-0001`.                                                                                                                                                                         |
| [r/Narutoccg](https://www.reddit.com/r/Narutoccg/)                                                              | sheets                      | —                             | —                     | CCG N/J/M               | **harvest** sheets | Ne pas crawler. Thread [1vjw5hb](https://www.reddit.com/r/Narutoccg/comments/1vjw5hb/question_about_rules_effect_vs_cost/) = règles (N-1080), photo téléphone → skip. Ledger : `reddit-narutoccg.json`.   |
| Pojo spoilers                                                                                                   | ?                           | —                             | —                     | NI→N TE→J TA→M          | **harvest**        | Cité, jamais ledgeré.                                                                                                                                                                                     |
| [vimbzy/NarutoCCG](https://github.com/vimbzy/NarutoCCG)                                                         | —                           | —                             | —                     | xlsx s1–s5              | **harvest**        | Seed checklist EN.                                                                                                                                                                                        |
| [Mawo Sage's Legacy](https://www.mawo-cards.com/produkte02/Naruto/Einzelkarten/Boosterserien/Sages-Legacy/)     | DE scans CCG s24            | —                             | —                     | SALE-DE ≠ NI            | skip scrape        | `SALE-DE001` imprimé **NI-1358** → disk `n1358`, jamais `ni1358`. Locale `de` hors pack.                                                                                                                  |
| [Mawo Storm 3](https://www.mawo-cards.com/produkte02/Naruto/Einzelkarten/Boosterserien/Ultimate-Ninja-Storm-3/) | DE scans CCG s28            | —                             | —                     | STO3-DE ≠ NI            | skip scrape        | `STO3-DE001` = **NI-1621** → `n1621`. Même map Coleka FR.                                                                                                                                                 |
| [puja39 DA](https://www.deviantart.com/puja39/gallery)                                                          | —                           | —                             | —                     | 1110 « TG Card »        | skip               | Custom, pas Bandai. Ne pas crawler.                                                                                                                                                                       |
| [Primal Marketplace naruto-ccg](https://marketplace.primaltcg.com/browse/naruto-ccg)                            | CCG Trader 350×490          | —                             | —                     | PTHN ≠ N                | skip scrape        | 33 sets / 4420. `PTHN-001` → `n001`. Promos 194 = grab-bag TCDB. Mix `/guest/sets` + jeu Primal. 0 listing. Ne pas crawler.                                                                               |
| [Collectors Comet Naruto CCG](https://collectorscomet.com/Naruto%20CCG)                                         | PNG 750×1050                | icône 803×471                 | —                     | Promos grab-bag         | skip scrape        | `N-001` → `n0001`. 33 éditions, s1=127. Icône Promos = s1. 47 listings. Ne pas crawler.                                                                                                                   |
| [Medium Naruto CCG app](https://medium.com/@claudio_69833/the-naruto-ccg-app-release-bd7e9a09ccd9)              | screens UI                  | —                             | —                     | Claudio / Primal        | skip               | Lancement 2019. Pas un dump.                                                                                                                                                                              |
| [APKPure com.narutoapp](https://apkpure.com/card-collector-ninja-ccg-edition/com.narutoapp)                     | —                           | —                             | —                     | sets 1–29               | skip APK           | Play 404. Ne pas télécharger. Set 29 = custom.                                                                                                                                                            |
| [Drive Fansets](https://drive.google.com/drive/folders/1tq0OWmtvZ4Slh8ZlDBEx51uLZUcqnh-T)                       | s29–31 fan                  | staging                       | —                     | fan                     | **staging**        | Via hub Card Database. Pas dans `cards/` sans attestation.                                                                                                                                                |
| [Drive Naruto CCG](https://drive.google.com/drive/folders/1PbZ0xYY94xeBNvrUb-Bbr35ZSAzEeBI7)                    | Enhanced s1–s28 + hub       | staging **5450** (2026-08-18) | —                     | nidifie Fansets         | **recheck**        | Hub unzippé (`--drive-local`). **Promote Enhanced → `art.drive.webp` encore à lancer** (`--locale drive` sans `--staging-only`).                                                                          |

Dos EN : `curated/cards/back.en.png` (même sleeve copies FR CCG).

---

## Pièges — ne pas rouvrir comme faces Bandai

| Hôte                                                                                                                                                       | Pourquoi                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Data Carddass DN/NM, Miracle Battle, `suruga-ya.com` category Data                                                                                         | Autre produit                                                                                                   |
| Kayou / Mythos 2026 / CICABOOM / Panini Ultra « French » Vintage                                                                                           | Autre éditeur                                                                                                   |
| AnimeCollection Ninja Ranks (`ids=200`) / Ultra card (`ids=254`)                                                                                           | Pas Carddass ; Ultra = Panini 2007                                                                              |
| [narutocardgame.gg](https://narutocardgame.gg/) / narutocard.io / naruto-cardgame.com                                                                      | TCG 2027 / hub 2026                                                                                             |
| apitcg / Scrydex / TCGdex                                                                                                                                  | Pas de legacy 1re classe                                                                                        |
| narutodb.xyz                                                                                                                                               | Lore API                                                                                                        |
| abel30567/NarutoCCGAPI                                                                                                                                     | Mort                                                                                                            |
| cardgame.fr                                                                                                                                                | **DBS**, pas Naruto (chat DBS)                                                                                  |
| Shinobi’s Dream / Band of the Hawk                                                                                                                         | Custom printables                                                                                               |
| Drive `[Fansets]` `1tq0OWmtvZ4Slh8ZlDBEx51uLZUcqnh-T`                                                                                                      | Uniquement s29+ fan (Mardo / Henrich / Silent Humming / TP5 fan). Pas Bandai.                                   |
| Coleka Kayou rubrique                                                                                                                                      | Skip                                                                                                            |
| Mawo NB02 Shippuden & Boruto Set                                                                                                                           | Chrono Clash 2019 (`Naruto x Boruto Card Game`), pas CCG 2006–2013                                              |
| puja39 DeviantArt « Naruto TG Cards »                                                                                                                      | Templates fan, pas des scans Bandai                                                                             |
| [Blog cartas HD](https://web.archive.org/web/20231223150358/https://aventurasaventurescas7.blogspot.com/2021/08/cartas-de-naruto-em-hd-para-imprimir.html) | Même puja39. Drive `1ZhtFYPyqkupRSKYRNR6FGWYGq0S3DOcv` 404. Ne pas ingérer Downloads/cards.                     |
| Primal Marketplace `/guest/sets` sans `game=naruto-ccg`                                                                                                    | Mélange sets **Primal TCG** (Kickstarter, ST01…) avec le CCG Bandai                                             |
| APKPure `com.narutoapp` « sets 1–29 »                                                                                                                      | Companion Claudio ; set 29 unofficial (même classe que Shinobi’s Dream). Play Store 404. Ne pas extraire l’APK. |

---

## Checklist par type d’asset (toutes langues)

Pour **chaque** hôte encore harvest/recheck :

- [ ] Faces (`art.<source>.*` dans le dossier carte, jamais skip si autre source existe)
- [ ] Dos (isolé officiel vs sleeve curated)
- [ ] Display / booster / starter packshots (SKU sealed, pas un booster inventé)
- [ ] Titres / rareté / printed refs / passwords
- [ ] Langue réelle de l’objet (FR Carddass ≠ FR copies CCG s28 ≠ IT S6 ≠ JA 巻ノ)

Gaps catalogue connus (post 2026-08-18) : **IT faces** (Coleka S6 71 + 3 eBay ;
cardgame-club thumbs morts sur Wayback) et **JA 巻ノ** (~600 hors nikita 392)
= plus gros manques visuels. EN leftover `art.jpg` : 128 safe-delete + **1761
orphelins** (ne pas bulk-delete). Drive Enhanced **en staging**, pas encore
dans `cards/`. FR S1–S5 surtout carddass.fr ; Coleka FR 542/741. Layout GAKU/
SHI à vérifier après `index`.

## 火の国庵 — le relevé japonais qu'on cherchait (2026-08-20)

`hinokunian.konohashigure.com` — trouvé en cherchant une source Data Carddass,
et il couvre bien plus que ça. **53 pages de liste**, une par sortie :

| Famille                                            | Pages |
| -------------------------------------------------- | ----- |
| 巻ノ壱 → 巻ノ十五                                  | 15    |
| Data Carddass (弾 1–4)                             | 4     |
| Starters, feuilles, COIN＋, porte-cartes, stickers | 34    |

**Corroboration** : la page 巻ノ壱 donne **70 références** et
`cardcheckbox-jp.json` annonce « 70+P » pour cette sortie. Deux relevés
indépendants qui tombent d'accord — c'est le meilleur signal qu'on ait eu sur
le japonais.

Ce que ça donne : **référence imprimée + nom japonais + rareté**, pour toute la
ligne. C'est exactement le trou du catalogue japonais — les noms. Ce que ça ne
donne pas : des scans. Les vignettes font 43×64.

### La forme change d'une page à l'autre

- **Volumes** : table à trois colonnes, `忍-1 | うずまきナルト | R`. Propre.
- **`cardbattle1`** : tout est dans l'`alt` des images —
  `DN-001T うずまきナルト -影分身の術-【ノーマル】`.
- **`cardbattle2-4`** : lignes texte `002T うずまきナルト` **sans le préfixe
  DN**, avec des `【2弾再録】` pour les réimpressions et des `【N種類】` par
  rareté.

Un parseur doit donc s'ancrer sur la référence et lire le reste par vocabulaire,
jamais par position de colonne. Et tout est en **SHIFT_JIS** : à décoder avant
la moindre lecture, sinon les noms sortent en mojibake.

Raretés relevées : `ノーマル`, `R`, `激レア`, `爆レア`.

Ledger : `curated/sources/hinokunian-jp.json`, les 53 chemins y sont listés.

### Ce qui a été écarté en chemin

- **nikita** ne porte que `nrt` (428) et `nrts` (13) pour Naruto ; son `dn` est
  ドレッドノート, son `das` ドラゴン☆オールスターズ.
- **Suruga** répond 403 sur la catégorie Data Carddass 501080113 depuis ce
  conteneur, en `.jp` comme en `.com/en`.
- **Wayback** sur `carddass.com` / `carddas.com` : 30 fichiers de carte
  distincts au total, et le staging `carddas-jp` les tient déjà (2 173
  fichiers, les deux hôtes). Rien de neuf.

### Moisson faite (2026-08-20)

`scrapeHinokunian` a lu les 53 pages, **0 échec** : **1 808 fiches**, toutes
nommées, 586 avec une rareté, 398 avec la technique imprimée.

| Préfixe | Fiches |
| ------- | ------ |
| 忍      | 652    |
| 術      | 468    |
| 作      | 447    |
| 依      | 51     |
| 騎      | 8      |
| PR      | 2      |
| DN      | 133    |
| DT      | 41     |
| CAN     | 6      |

**Le rapprochement, mesuré** : 1 148 références distinctes, dont **981 tombent
sur un tirage du catalogue** — et **120 d'entre elles n'avaient aucun titre
japonais**. Les 167 restantes sont les DN/DT : la ligne arcade a ses familles
mais pas encore ses tirages.

#### Deux préfixes que le relevé nous a appris

- **`DT`** — la quatrième vague arcade écrit `DT-002T` là où les trois
  premières écrivent `DN-`. Lu sur la page, pas déduit. Reste à confirmer sur
  une carte s'il s'agit d'un vrai changement de préfixe ou d'une convention du
  site.
- **`CAN`** — le porte-cartes 木ノ葉絵巻, `CAN-1`→`CAN-6`. Et
  `cardcheckbox-jp.json` annonçait déjà « CAN-1〜CAN-6 » : **deuxième
  corroboration** après les 70 références de 巻ノ壱.

#### Les 19 pages qui rendent zéro

C'est le bon résultat : シール烈伝, エッティング, スナック, アイス — des
stickers, des snacks et des glaces, qui ne portent aucune référence de cette
forme. Le parseur refuse de les lire comme des cartes plutôt que d'inventer des
numéros.

### Versement fait — 120 titres japonais (2026-08-20)

`mergeHinokunianJaNamesIntoIndex` verse les noms du relevé dans les fiches qui
n'en ont pas. **JA : 1 368 → 1 488 titres**, exactement la mesure annoncée.

Le versement est **en remplissage seul** : un titre déjà présent n'est jamais
écrasé, et l'étape passe **en dernier** dans la chaîne — tout ce qui précède
vient d'une source officielle ou d'une pièce en main, et garde la main sur un
relevé de fan.

La **rareté** du relevé n'est pas versée. Elle s'écrit en japonais (`ノーマル`,
`激レア`) là où le catalogue mêle déjà trois vocabulaires (`C` / `Common` /
`commune`). Une quatrième écriture n'aiderait personne tant que le vocabulaire
n'est pas unifié.

Deux défauts trouvés en câblant, tous deux silencieux :

- **`DT` manquait à `collectorIdentity`.** Je l'avais appris au parseur du site
  mais pas à la couche d'identité : 47 références `DT-…T` étaient refusées à la
  conversion. Le préfixe, la recherche, le dossier de disque et la règle du `T`
  collé sont maintenant alignés.
- **`hinokunianFactsPath` prenait la racine des données** là où tout ce module
  passe la **racine du pack**. Le chemin doublait (`…/carddass/naruto/carddass/…`),
  la moisson restait introuvable, et le versement nommait zéro carte **sans
  lever d'erreur**. Le premier passage a d'ailleurs rendu 1 368 titres inchangés
  — c'est ce zéro qui a mis la puce à l'oreille.

Les cartes de borne (`DN`, `DT`) restent dans la liste des noms : elles ne
correspondent à aucun tirage aujourd'hui et n'en nomment donc aucun, mais le
jour où la ligne arcade sera frappée, leurs noms seront déjà là.

## Chasse aux sources italiennes — le bilan honnête (2026-08-20)

### Ce qui est mort, et vérifié mort

- **cardgameclub.it** — migré de Magento vers Shopify. Les vieilles URL font 301
  vers `/collections/naruto`, dont `products.json` ne rend que **6 produits, tous
  scellés**. Fermé pour les cartes à l'unité, définitivement.
- **coleka.com** — porte de vérification depuis aujourd'hui. Et surtout : le site
  **n'a pas** les images qui manquent. Les 64 fiches sans visuel affichent
  `no-image.jpg` ; le HTML de liste déjà en staging en porte 68 occurrences.
  Rien à aller chercher.
- **picclick.it** — banni par mes propres sondes. Voir `hosts-blocked.json`.

### Ce que l'archive donne, et ce qu'elle ne donne pas

Wayback a **14 captures** des pages de liste italiennes par série — dont deux
séries que nos relevés ignoraient : **serie-7 « Sete di Potere »** et
**serie-8 « Il Vento del Cambiamento »**.

Seules les captures de **2020** portent la charge JSON d'analytics qui nomme
chaque produit (`CL05 Zori comune -MINT-`) ; celles de 2022-2023, postérieures à
une refonte, n'en ont plus. Et aucune pagination n'est archivée : une page par
série, ~40 produits.

Rendement mesuré : **118 produits, séries 2/3/5 seulement**, et **zéro titre
nouveau** — les 118 ont déjà leur nom au catalogue.

### Le gain réel : les raretés

Le catalogue italien n'avait **aucune rareté** — 0 sur 410 titres. L'archive en
donne **117**, avec l'axe foil que la boutique accolait :

| Rareté          | Cartes |
| --------------- | -----: |
| comune          |     69 |
| rara foil       |     24 |
| non comune      |     17 |
| ultra rara foil |      6 |
| epica foil      |      1 |

Le vocabulaire reste celui de la boutique, non traduit : c'est le mélange
**entre** langues qui pose problème, pas la fidélité à l'intérieur d'une langue.

### Où en est l'italien

97 tirages sur 410 ont une face ; **313 n'en ont pas**, et les trois avenues
connues sont fermées à la machine. Le chemin qui reste est le collage d'URL,
comme pour Suruga et eBay — c'est ce que ces sources imposent, et c'est déjà
outillé.

## sec.carddass.com — la base produit officielle de Bandai (2026-08-20)

Trouvée en cherchant les faces japonaises. Elle n'en donne aucune — mais elle
donne ce qui manquait au **scellé japonais**.

`sec.carddass.com/club/products/?keyword=NARUTO` rend **56 produits** sur six
pages. Vingt-six relèvent de notre ligne ; le reste est de la Miracle Battle
Carddass, un autre jeu, ou des accessoires. Chaque fiche porte un titre
officiel, une date de sortie et un visuel sur le CDN Akamai de Bandai —
**26 sur 26 en ont un**.

C'est précisément le trou : nos 31 SKU japonais scellés n'ont que **2 visuels**,
les 29 autres étant entrés au catalogue sans image, sur la seule foi de
`cardcheckbox-jp.json`.

### Ce que la liste révèle en passant

Onze produits 巻ノ, et **quinze 疾風伝** : la ligne Shippuden compte au moins
**huit 幕**, du 第二幕 au 第八幕, chacun avec sa ブースターパック, son
自販機ブースター et parfois un 構築済みスターター. Notre catalogue n'en connaît
presque rien — le pack `nrts` de nikita n'a que 13 faces.

### Ce qu'il faut trancher avant de verser

Les titres officiels distinguent trois formats que nos specs confondent :
**ブースターパック** (sachet), **自販機ブースター** (distributeur) et
**構築済みスターター** (deck construit). Le distributeur, c'est le même contenu
dans un autre emballage — en faire un SKU distinct ou non est une décision de
modèle, pas un détail d'ingestion. Je ne l'ai pas prise seul en fin de session.

Ledger : `curated/sources/carddass-official-products.json`, les 26 avec JAN,
titre, date et URL de visuel.

### Versement fait — 4 packshots officiels (2026-08-20)

Les visuels Bandai sont posés sur les SKU japonais : **2 → 6 avec image** sur 31.

Le gain s'arrête à quatre parce que la base produit de Bandai s'arrête là : sur
les dix-sept volumes, seuls **4, 12, 16 et 17** ont encore une fiche avec
packshot. Les treize autres restent attestés sans image — c'est le comportement
voulu, pas un échec, et un test le fige.

Source déclarée `carddassofficial`, **en tête de l'ordre japonais** : c'est
l'éditeur qui photographie son propre emballage, aucune photo de vendeur ne
devrait passer devant.

**Reste à trancher** : les 16 produits 疾風伝 (Shippuden) de la même liste. Ils
forment une ligne scellée entière — huit 幕, chacun avec sachet, distributeur et
parfois starter — que le catalogue ne modélise pas du tout. Et le trio
ブースターパック / 自販機ブースター / 構築済みスターター demande d'abord de
décider si le distributeur mérite son propre SKU : c'est le même contenu dans un
autre emballage, mais Bandai lui donne un JAN distinct.

### La ligne 疾風伝 entre au catalogue (2026-08-20)

Quatorze SKU frappés depuis le relevé officiel, **tous avec leur visuel Bandai** :
six ブースターパック, cinq 自販機ブースター, deux 構築済みスターター et le
Coin＋. Actes 2, 3, 4, 6, 7 et 8 — les actes 1 et 5 manquent à la base de Bandai
elle-même.

Le scellé japonais passe de **31 à 45 SKU**, dont **20 avec visuel** contre 2 ce
matin. Total du pack : **70 → 84 SKU**.

**Le distributeur a son propre SKU**, et c'est la décision à retenir :
`自販機ブースター` contient le même tirage que la `ブースターパック`, mais Bandai
lui donne un **JAN distinct**. Un JAN est un code-barres — la définition même
d'un produit commercial séparé, qu'on achète et qu'on possède à part. La
décision suit le code-barres, pas le contenu. Il reste `kind: booster`, son
contenu étant bien aléatoire.

Deux pièges sous test : `自販機ブースター` contient le mot `ブースター`, donc le
distributeur doit être reconnu **avant** le sachet ; et Bandai liste deux fois le
troisième acte, d'où une déduplication par slug. Les actes vivent sous `maku{N}`,
jamais `maki{N}` qui est le code des dix-sept volumes.

### La recherche officielle est littérale (2026-08-20)

`sec.carddass.com` cherche sur la chaîne exacte. `keyword=NARUTO` rend **56**
produits, `keyword=ナルト` en rend **58** — Bandai écrit certains titres en latin
**pleine chasse** (`ＮＡＲＵＴＯ`), qu'une requête ASCII ne trouve pas.

Les deux manquants étaient l'**acte 5** du 疾風伝, booster et distributeur —
précisément les actes que je notais comme « absents de la base de Bandai ».
Ils n'étaient pas absents : ma requête était trop étroite.

La ligne 疾風伝 passe donc de 14 à **16 SKU**, actes 2 à 8 complets, tous avec
leur visuel officiel. Le pack atteint **96 SKU**, dont 22 japonais avec image
contre 2 ce matin.

Leçon pour les autres bases japonaises : chercher **en kana et en latin**, et
comparer. Une seule graphie ne suffit pas.

### Les 巻ノ rattrapent le 疾風伝 (2026-08-20)

Incohérence de ma part, réparée : j'avais frappé tous les formats du 疾風伝
(sachet, distributeur, starter) mais seulement les boosters des dix-sept
volumes. Chaque format a pourtant son JAN.

Six SKU ajoutés — trois **自販機ブースター** (volumes 12, 16, 17) et trois
**構築済みスターター** nommés : 豪雷の書 (16), 木ノ葉の書 et 呪印の書 (12).
Tous avec leur visuel officiel.

Ces noms de livre **corroborent** le champ `books` de `cardcheckbox-jp.json` :
豪雷の書 pour le seizième, 木ノ葉の書 et 呪印の書 pour le douzième. Deux
relevés indépendants qui disent la même chose.

Les slugs des starters portent une romanisation explicite (`gorai`, `jyuin`,
`konoha`) plutôt qu'une translittération automatique : ces trois noms sont tout
ce que Bandai publie, et deviner une lecture kanji serait un pari inutile.

## Le scellé Naruto au 2026-08-20

| Langue    | Avec visuel |     SKU |
| --------- | ----------: | ------: |
| FR        |          16 |      16 |
| EN        |          16 |      16 |
| DE        |      **10** |  **10** |
| IT        |           7 |       7 |
| JA        |          28 |      53 |
| **Total** |      **77** | **102** |

Le pack est passé de 41 SKU ce matin à **102**, et de 41 visuels à 77. L'allemand
n'existait pas ; le japonais avait 2 visuels sur 31.

## Session 2026-08-20 — carddas.com, acte 1, chitoroshop, et ce qui reste dû

### carddas.com — la source dormait dans notre propre moisson

`scrapeCarddasJp` miroite tout `/naruto/` depuis la CDX Wayback **depuis le
début** : 1 043 images sur le disque. Les packshots y étaient, jamais lus. On
cherchait des visuels sur le web pendant qu'ils étaient en staging.

Le site tenait **deux** arbres produit, ce qui explique qu'on soit passé à côté :

| chemin                               | ligne              | contenu                                      |
| ------------------------------------ | ------------------ | -------------------------------------------- |
| `image/product/`                     | 巻ノ (2002-2007)   | un fichier par volume, l'ordinal dans le nom |
| `image/product/{15,16,17}/`          | 巻ノ, fin de ligne | rangés en dossiers                           |
| `cardgame/image/product/{1st..4th}/` | 疾風伝 (2007+)     | ce sont les **幕**, pas les 巻ノ             |

**Le rapport hauteur/largeur classe un fichier sans l'ouvrir** : ~2,1 = sachet,
~1,5 = boîte, ~3,5 = distributeur, ~1,45 = carte. C'est ce qui a séparé
`1st_box.jpg` (une boîte) des sachets, et ce qui a permis de balayer 86 fichiers
d'un coup.

Versé : volumes **2, 3, 4, 13, 14, 15** (+ le 5 en source secondaire).
Attesté par trois recoupements indépendants — `2nd.gif` se lit 巻ノ弐,
`13th_logo.gif` se lit 巻ノ十三, et les sachets 13/14/15 impriment leur numéro ;
les volumes 4, 16 et 17 concordent avec la base produit `sec.carddass.com`.

### 巻ノ四 — la fiche officielle n'est pas un packshot

`sec.carddass.com` illustre le 巻ノ四 par **six cartes étalées, sans emballage**,
en 560×560. Même travers que les fiches 自販機. Le sachet du site de jeu fait
75×144 et le remplace : sur un SKU de type booster, un emballage juste et petit
vaut mieux qu'une planche de cartes grande et hors sujet.

Ça a révélé un bug latent : `installDump` n'élaguait que la **même** source sous
une autre extension. Une source retirée du modèle laissait son fichier, et comme
le choix se fait aux pixels, le périmé continuait de gagner. `pruneUnclaimedRole`
corrige, avec un garde-fou : pas d'élagage si le rôle n'a **aucune** prise
fraîche, sinon un staging absent effacerait des visuels valides.

### 疾風伝 第一幕 — 75 cartes sans produit

Bandai ne porte pas le premier acte : sa base commence à l'acte 2. Le catalogue
avait donc **75 cartes en `maku1` et aucun SKU scellé** pour les contenir.
La page de lancement archivée le rend : sachet (全69種+1種), 構築済みスターターBOX,
et distributeur. `/naruto/img/` et `/naruto/cardgame/image/product/1st/` sont
identiques au bit près — un seul jeu de fichiers publié à deux endroits.

**105 SKU, 93 visuels ; JA 44/56.**

### `maki` / `maku` — ce que les codes veulent dire

- `maki` = **巻** (« volume », un rouleau) → la ligne d'origine 2002-2007, 巻ノ一…巻ノ十七.
- `maku` = **幕** (« acte ») → la ligne 疾風伝 / Shippuden, 2007+, 第一幕…第八幕.

Deux jeux distincts, pas deux nommages du même. `maki1`–`maki4` n'existent pas
comme sets : leurs cartes sont repliées dans `s1`–`s4`, qui portent les quatre
langues sur les **mêmes** clés de tirage (`s1` = 182 ja + 182 fr + 128 en + 57 it).
Les `maki` ne gardent que le résidu sans équivalent européen.

**Question ouverte, pas tranchée** : ce repli suppose que la série française N
contient les mêmes cartes que le volume japonais N. Personne ne l'a vérifié.
S'il est faux, on a fusionné deux découpages différents.

### chitoroshop.com — mesuré, et ce n'est pas ce qu'on espérait

Boutique Shopify, flux ouvert : `products.json?limit=250`, **80 pages, 19 740
produits**. Sur ce total, **281 Naruto** et seulement **4 scellés** — dont trois
`Naruto Card Pack Vol.5 / 10 / 12`, tous déjà couverts.

La valeur est ailleurs : **245 fiches de cartes**, 2 à 5 images chacune, la
seconde étant le recadrage propre. Titres en anglais avec le numéro nu
(`Gaara of the desert 339`), certains portant `(Vol.3)`.

**Non intégré, et voici l'obstacle exact** : le numéro nu ne dit pas la famille
(忍 / 術 / 作 / 依 / 騎), et nos tirages japonais portent des codes de série
**français**. Un `339` peut être 忍-339 ou 術-339. Le joindre à l'aveugle
fabriquerait des faces confidemment fausses — exactement ce que la barrière
qualité interdit. Ce qu'il faut d'abord : donner aux tirages japonais leurs
vrais codes de volume.

### Ce qui reste dû — repris de l'historique de la conversation

- [ ] **chitoroshop** — 245 fiches à joindre une fois la famille résolue.
- [ ] **kingslayercards** — la liste des ~90 bannies + 30 limitées, jamais moissonnée.
- [ ] **Data Carddass** — modèle prêt (familles, ligne, préfixes), **aucune source trouvée**.
- [ ] **Codes de volume japonais** — la table des plages est **acquise**
      (cardcheckbox, 30 sorties, ingérée), et la découpe 巻ノ est parcourable.
      Reste à s'en servir pour joindre chitoroshop, qui était bloqué là-dessus.
- [ ] **313 faces IT / 703 faces JA** encore manquantes.
- [ ] **巻ノ一** — `1st_pac.gif` référencé par la page mais **absent de la CDX** : jamais archivé.
- [ ] **`jp-release-04`** — la photo montre le サスケの書, la sortie couvre aussi le ナルトの書.
- [ ] **Starter boxes JA** — `st_box1..4` + `1st_box.jpg` attestent ≥4 スターターボックス, le catalogue n'en porte qu'une.
- [ ] **4 dossiers de staging qu'aucun code ne lit** — recompté le 2026-08-21, la
      ligne disait « 10 » et c'était faux : six de ces dossiers sont bien lus.
      Restent quatre captures jamais exploitées, la plus grosse d'abord :

  | Dossier           | Poids | Contenu                                                    |
  | ----------------- | ----- | ---------------------------------------------------------- |
  | `narutoccgfrance` | 1.5 M | fils de forum + un `promo-attested.json` produit sur place |
  | `carddas-jp-ps`   | 84 K  | pages `sinobi_ps_*` du bonus PS1                           |
  | `tvtokyo-ps`      | 24 K  | trois visuels PS1 de TV Tokyo                              |
  | `leboncoin`       | 16 K  | un relevé d'annonces du 2026-08-13                         |

  Les deux dossiers `*-ps` touchent les quatre cartes 忍-N（PS）, dont les faces
  sont venues de Mercari : la capture d'origine n'a donc jamais servi.

- [x] ~~**疾風伝 : la moitié du jeu manque**~~ — **partiellement résolu le
      2026-08-21.** La page sœur de cardcheckbox
      (`a06a-bandai-4/cdds-narutospd-cg.html`) donne les plages de numéros
      jusqu'au **sixième** acte, plus le Coin＋ et la ligne 忍者学校. Catalogue
      passé de 313 à **436 tirages**, `unknown` éliminé.

- [ ] **疾風伝 actes 7 et 8 — numérotation introuvable** — cardcheckbox note ses
      plages `未確認` pour ces deux actes, et `card.g1.xrea.com` ne donne que des
      totaux (66 et 48, contre 58+P+再録 et 48+P chez cardcheckbox). Environ
      **106 cartes** existent donc sans numéro connu ; leurs boosters sont
      pourtant au catalogue scellé. Pistes non épuisées :
      `tcg-db.nikita.jp/cardlist/nrts/`, la CDX Wayback de
      `carddas.com/naruto/cardgame/product/cardlist_*`, Yahoo!Auctions.

- [ ] **127 tirages 疾風伝 attestés sans nom** — la liste officielle donne leur
      numéro, aucun registre ne donne leur titre. Ils sont choisissables par
      référence, mais un relevé de noms les compléterait.

- [ ] **10 cartes japonaises nommément manquantes** — mesuré le 2026-08-21 en
      confrontant chaque volume au décompte de cardcheckbox. **15 volumes sur
      17 tombent exactement juste** ; les deux autres sont en dessous :
      `巻ノ十五` manque 忍-365, 忍-366, 術-322, 術-323, 作-303 et `巻ノ十六`
      manque 忍-389, 忍-390, 術-342, 術-343, 作-322. Toutes en fin de plage —
      probablement la queue d'un relevé interrompu.

- [ ] **忍-234 à 忍-239 — la source se contredit** — cardcheckbox donne
      巻ノ十 = 忍-205〜239 **et** 巻ノ十一 = 忍-234〜254. Les décomptes annoncés
      (80 et 57) valident chacune des deux plages prise seule, donc rien ne
      départage. Ces six numéros restent sans volume. Il faudrait un scan du
      dos ou de l'emballage pour trancher.

- [ ] **Long terme** — figer la DB Naruto curée en fichier compressé / Internet Archive.

### 疾風伝 CARD GAME — un second jeu dans le pack, et il est japonais seul

Mesuré le 2026-08-20. Les familles `shi` / `mju` / `msa` / `gaku` ne sont pas des
variantes du Carddass : c'est **「NARUTO-ナルト- 疾風伝 CARD GAME」 (Bandai, 2007-2009)**,
un autre jeu.

**Preuve structurelle** — zéro croisement, dans les deux sens :

| Disque    | Imprimé   | Ligne                 | Sets                      |
| --------- | --------- | --------------------- | ------------------------- |
| `ni` 404  | 忍-N      | Carddass              | `s*` / `maki*` uniquement |
| `shi` 136 | 忍伝-N    | 疾風伝                | `maku*` uniquement        |
| `te` 359  | 術-N      | Carddass              | `s*` / `maki*`            |
| `mju` 102 | 術伝-N    | 疾風伝                | `maku*`                   |
| `ta` 338  | 作-N      | Carddass              | `s*` / `maki*`            |
| `msa` 35  | 作伝-N    | 疾風伝                | `maku*`                   |
| `gaku` 40 | 忍伝-学-N | 疾風伝, sous-série 学 | `gaku`                    |

Le 伝 de 忍伝 est celui de 疾風**伝**. Les deux lignes **repartent de 1**, d'où
`ni0001` うずまきナルト _et_ `shi0001` うずまきナルト.

**Preuve visuelle** — deux maquettes sans rapport :

|                 | Carddass                   | 疾風伝                                       |
| --------------- | -------------------------- | -------------------------------------------- |
| Onglet          | 忍 / 術 / 作戦 seul        | 忍 **SHINOBI**, 術 **JUTSU**, 作 **SAKUSEN** |
| Coin haut-droit | losange élémentaire (雷)   | gemmes rondes chiffrées                      |
| Stats           | `3/1` sous le nom          | bloc bas-droite, tout autre                  |
| Pied            | BANDAI **2002** / **2004** | BANDAI **2007**                              |

**Il est japonais seul** : 309 titres sur les quatre familles, **100 % `ja`** ;
257 titres sur les sets `maku*`, **100 % `ja`**. Zéro en / fr / it.

**Piège de nommage à ne plus jamais confondre** : le « Naruto Shippuden
Collectible Card Game » **anglais** (nos `s13`-`s28`, le wordmark kingslayer) est
un **autre produit encore** — la suite de la localisation américaine du Carddass.
`s13`-`s28` = 544 `en` + 120 `fr`, **zéro `ja`**. Les deux disent « Shippuden »
et ne partagent aucun tirage.

#### Défaut ouvert : le dos est faux sur 313 cartes

`CARDDASS_PREFIX` dans `packs.ts` range `shi|mju|msa|gaku` avec `ni|te|ta|cl|ki`,
donc la ligne 疾風伝 est classée `carddass-fr`. Les dos étant servis **par langue**
(`back.ja.webp`), les 313 cartes du 疾風伝 affichent le dos Carddass — « NARUTO
CARD GAME », triskèle 忍/術/幻, aucun 疾風伝 dessus.

**Le bon dos manque.** Cherché sans succès dans le miroir carddas.com : le
rulebook 疾風伝 (`cardgame/rule/naruto_rulebook.pdf`, 15,7 Mo) donne 34 JPEG
embarqués — les cartes recto y sont, les fonds de page aussi, **pas le dos**.
Corriger la ligne sans avoir l'image ne ferait que remplacer un faux par un vide.

#### Le rangement japonais, livré

`japaneseVolumes.ts` dérive le set japonais **du numéro imprimé**, pas de
`set_code` — lequel porte le découpage européen. Posé dans l'index en
`langs.ja.set`, un champ par langue ajouté au contrat (`CardsIndexLangFiles.set`) :
la carte reste une, son rangement change avec la langue.

- **864 cartes nouvellement rangées**, 501 l'étaient déjà, **123 restent** —
  promos (`prni`, `prta`…) qui n'appartiennent à aucun volume, et `gaku`.
- Validé contre les 336 fiches nikita : **321 d'accord, 15 en désaccord**, tous
  des réimpressions — les plages disent où le numéro fut _frappé_, nikita dit
  dans quel _produit_ l'exemplaire est sorti. Deux faits, pas une contradiction.
- **忍-234 à 239 laissés sans volume** : 巻ノ十 annonce « 80+P » pour 81 cartes,
  巻ノ十一 « 57+P » pour 57 ; ensemble ils réclament 56 numéros 忍 pour 50 places.
  La source se contredit, on ne tranche pas à sa place.

#### Ouvert

- [x] ~~**Dos du 疾風伝**~~ — **livré le 2026-08-21.** Source
      `tcg-db.nikita.jp/img/card/nrts/back.jpg`, agrandi hors ligne. Il vit dans
      `narutoshippuden/curated/cards/back.ja.png` et la passe l'installe ;
      vérifié identique au bit près après effacement de la destination.
- [x] ~~**Sous-catalogue 疾風伝**~~ — **livré le 2026-08-21.** Pack
      `naruto/shippuden` : 436 tirages, 19 SKU scellés, ses propres registres et
      son dos. Le pack Carddass n'en porte plus rien.
