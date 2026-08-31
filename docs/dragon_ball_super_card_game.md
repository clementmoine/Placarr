# Dragon Ball Super Card Game — recherche images & sources

> Statut : **Catalogue franchise** (2026-08-14). Admin Catalogue → **Dragon Ball**
> avec onglets **Masters** | **Fusion World**. Providers `dbscg` (`data/dbs/cg`,
> Catalogue Sync) et `dbsfw` (`data/dbs/fw`, Catalogue Sync). Packs foil
> `dbs-cg` / `dbs-fw`. Faces Masters FR = dbscards/Bandai ; faces EN = clone
> TCG Arena (Deckplanet), rangées sous `cards/…/en/`. Naruto suivra le même
> schéma (CCG | Panini). Journal d’audit des **faces** ci-dessous.
>
> Contrat produit (aligné Pokémon sans Live / OPTCG) :
>
> - **Catalogue** (sets, printKey, images, finitions) = obligatoire.
> - **Rendu foil** = seulement s’il existe des **masks / plaques** réelles.
> - Sans mask : on peut taguer `foil` / parallel sur l’exemplaire, **face plate**.

Deux jeux Bandai distincts, même marque :

| Ligne                              | Depuis | Site officiel                                                          | Cardlist FR                                                                               |
| ---------------------------------- | ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Masters** (ex « DBS Card Game ») | 2017   | [dbs-cardgame.com/europe-fr/](https://www.dbs-cardgame.com/europe-fr/) | […/cartes/](https://www.dbs-cardgame.com/europe-fr/cartes/) — **vivant**                  |
| **Fusion World**                   | 2024   | [dbs-cardgame.com/fw/en/](https://www.dbs-cardgame.com/fw/en/)         | […/cardlist/](https://www.dbs-cardgame.com/fw/en/cardlist/) — EN/JP, **pas de `/fw/fr/`** |

Hub : [dbs-cardgame.com](https://www.dbs-cardgame.com/) (sélecteur Masters / FW).

---

## 1. `cardgame.fr` — épuisé, pas un dump

Piste utilisateur (« super site FR, il existe plus ? »). **Ce n’est pas
l’équivalent de `carddass.fr` pour Naruto.**

| Fait             | Détail                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Qui              | Site de **Maxildan** (Pierre-André Joly) : Yu-Gi-Oh + DBS, deck / events / stand (ex. La Catalane 2019 avec Xari, Zouloux) |
| Live 2026-08-14  | Domaine OVH encore délégué, **corps vide** (pas de site TCG)                                                               |
| Wayback homepage | Premier snapshot **2018-09-14** : **302 → `/cards`** — il y avait une section cartes (SPA probable)                        |
| CDX domaine      | Ensuite **uniquement** parking OVH (« Félicitations, votre domaine a bien été créé ») + assets `__ovh/`                    |
| CDX `/cards`     | **0 URL** — la cardlist n’a jamais été crawlée                                                                             |
| Images           | **0** PNG/JPEG de carte dans Wayback / `site:cardgame.fr/cards` (Google vide)                                              |
| Lien dbscards    | **Aucun.** dbscards.fr (2019) est une autre équipe (réseau TCGCards / CardNexus)                                           |

**Conséquence** : impossible de dire si leurs faces avaient le SAMPLE Bandai.
Pas de recovery Apache-style. Ne pas re-scraper ce domaine.

---

## 2. Cardlist officielle Bandai — **vivante** (≠ Naruto)

Contrairement à `carddass.fr` (revendu, dump Wayback), Bandai sert encore les
visuels. Sondage **2026-08-14** (HEAD + téléchargement + lecture des faces).

### 2.1 Masters — FR + EN

Identité : deux cardlists, fusionnées sur le collector (`BT1-001`). Les ids
`category_exp` ne se recoupent pas (FR `461xxx`, EN `428xxx`).

| Locale | Liste                                                                 | Images                                                                                          |
| ------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| FR     | […/europe-fr/cartes/](https://www.dbs-cardgame.com/europe-fr/cartes/) | `…/europe-fr/images/cartes/cardimg/{ID}.png`                                                    |
| EN     | […/us-en/cardlist/](https://www.dbs-cardgame.com/us-en/cardlist/)     | `https://www.dbs-cardgame.com/images/cardlist/cardimg/{ID}.png` (pas `/us-en/` ni `/en/` — 404) |

FR : ~76 séries (Galactic Battle BT1 → Ultra-Bout). Catégorie BT1 : `461001`.  
EN : ~90 séries. Catégorie BT1 : `428001`. Verso Leader : `{ID}_b.png`.

```
https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/{ID}.png
https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/{ID}_b.png   ← verso Leader
https://www.dbs-cardgame.com/images/cardlist/cardimg/{ID}.png            ← EN
```

| Mesure              | Valeur                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| Format              | PNG palettisé                                                             |
| Taille              | **260×363** (EN parfois 260×364)                                          |
| Poids               | ~50–72 Ko                                                                 |
| Suffixes HD         | `_h`, `_l`, `_large`, `@2x`, dossiers `cardimg_l` / `zoom` → **404**      |
| BT1 Galactic Battle | **110** ids `BT1-001`…`BT1-110` + versos Leaders (`_b`) dans un seul HTML |

### 2.2 Fusion World — EN / JP

Pas de locale `/fw/fr/`. Images :

```
https://www.dbs-cardgame.com/fw/images/cards/card/{en|jp}/{ID}.webp
https://www.dbs-cardgame.com/fw/images/cards/card/{en|jp}/{ID}_p1.webp     ← parallel
https://www.dbs-cardgame.com/fw/images/cards/card/{en|jp}/{ID}_f.webp      ← Leader recto
https://www.dbs-cardgame.com/fw/images/cards/card/{en|jp}/{ID}_f_p1.webp   ← Leader alt
```

Leaders : le fichier **sans** `_f` est 404 (`FB01-001.webp` ✗, `FB01-001_f.webp` ✓).  
Starters type `FS01-01` : idem, besoin du `_f` pour le Leader.

| Mesure          | Valeur                             |
| --------------- | ---------------------------------- |
| Format          | WebP                               |
| Taille          | **600×838**                        |
| Poids           | ~64–99 Ko                          |
| PNG             | 404 (pas de `.png` parallèle)      |
| Locales sondées | `en` ✓, `jp` ✓, `zh-tw` / `ko` 404 |

### 2.3 SAMPLE — **toutes** les faces officielles

Tampon Bandai anti-proxy, contour semi-transparent, **diagonale**
bas-gauche → haut-droite. Vérifié sur :

- Masters FR : BT1-001 recto, BT1-001 verso, BT1-010, BT31-001 (set récent)
- Masters EN : BT1-001
- Fusion World : FB01-001 `_f`, FB01-053, FB01-053 `_p1` (parallel + « Pre-Release »)

C’est le fichier cardlist, pas un défaut d’un set. **Dump officiel = toujours
watermarké** + petite taille (surtout Masters).

---

## 3. dbscards.fr — communauté FR, faces **propres**

|            | Masters                                                                 | Fusion World                              |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Site       | [dbscards.fr](https://www.dbscards.fr/)                                 | [fw.dbscards.fr](https://fw.dbscards.fr/) |
| Depuis     | 2019 (annonce site)                                                     | 2024                                      |
| CDN        | `static.dbscards.fr`                                                    | `static.fw.dbscards.fr`                   |
| BT1-001 FR | `…/cards/fr/bt1/image-cartes-a-collectionner-…-bt1-001-r-champa-….webp` | —                                         |
| Taille     | **400×560** WebP (~74 Ko)                                               | à mesurer à l’intégration                 |
| SAMPLE     | **Non** (Champa BT1-001 lu 2026-08-14)                                  | à confirmer                               |
| Rôle       | Liste FR, deckbuilder, cotes Cardmarket                                 | idem FW                                   |

Ce n’est **pas** le fichier Bandai. Utile comme **fallback visuel** (plus grand
que Masters officiel, sans tampon) — pas comme source « officielle HD ».

Dossier `cards/original/` sur le CDN : même 400×560 sur l’échantillon BT2-059
(pas un palier HD caché). Listing Apache = **403**.

### 3.1 Dos de carte — `original/back.webp`

```
https://static.dbscards.fr/cards/original/back.webp
https://static.fw.dbscards.fr/cards/original/back.webp   ← **même fichier** (md5 identique)
```

| Mesure          | Valeur                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| Contenu         | **Dos Masters** : 7 Dragon Balls, fond noir, cadre métal + liseré orange        |
| Format          | WebP **400×560**, 15 864 o, **sans SAMPLE**                                     |
| Usage HTML      | placeholder lazy-load : `src=…/original/back.webp` puis `data-src=` face réelle |
| Bandai cardlist | pas de `cardback.png` sous `cardimg/` (404 sur les chemins sondés)              |

À ne pas confondre avec les `…-back.webp` **par carte** (ex. Champa
`…-champa-dieu-de-la-destruction-back.webp`) : c’est le **verso Leader
(éveil)**, pas le dos de sleeve.

Les deux sites (Masters + FW) partagent ce dos Masters comme placeholder.
Le dos physique Fusion World est **probablement différent** — à vérifier
avant de l’utiliser comme `cardBackUrl` FW.

### 3.2 Dos sleeve — sondage international (2026-08-14)

Question : un fichier **dos de sleeve** (7 Dragon Balls / dos FW), pas le
verso Leader. Sites **non-FR inclus**.

| Source                                                    | Ce qu’ils servent                                             | Dos sleeve ?                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Bandai** US / EU-EN / EU-FR / Asia / FW EN+JP cardlists | Faces + verso **Leader** (`_b.png` / `{id}_f` vs éveil)       | **Non.** Aucun `card_back` / `back.webp` sous `cardimg/` (404). HTML 0 hit « cardback ». FW a seulement `noimage.webp` (placeholder trou) |
| **Bandai One Piece** (même maison)                        | Même pattern cardlist                                         | **Non** (`card_back.png` 404) — convention Bandai, pas un oubli FR                                                                        |
| **dbscards.fr** / **fw.dbscards.fr**                      | Faces propres + `original/back.webp`                          | **Oui** — unique fichier dos sleeve propre trouvé (400×560, sans SAMPLE). FW réutilise le dos **Masters** (md5 identique)                 |
| **dragonball.gg** (DotGG, meta EN)                        | Miroir officiel : `static.dotgg.gg/dragonball/card/{id}.webp` | **Non** (`…/card/back.webp` 404). `{id}_back.webp` = verso **Leader** (ex. FB01-001, 600×838, **SAMPLE**)                                 |
| **Coleka**                                                | Photos marketplace (`thumbs.coleka.com`)                      | Photos vendeur, pas un asset dos canonique                                                                                                |
| **Cardmarket / TCGPlayer**                                | Cloudflare / JS shop                                          | Pas de `card-back` dans le HTML sondé                                                                                                     |
| **Limitless** (`play.limitless.gg/dbs` `/fusion`)         | Réponse vide au crawl                                         | Pas d’asset récupéré                                                                                                                      |
| **Wikimedia / Fandom** (chemins naïfs)                    | 404                                                           | —                                                                                                                                         |

**Conclusion** : les cardlists officielles et les bases EN (DotGG) **ne
publient pas** le dos de sleeve. Elles publient faces (SAMPLE) et, pour les
Leaders, l’autre **face de jeu**. Le seul URL stable, propre, hors photo
eBay, reste dbscards `original/back.webp` — et c’est le dos **Masters**.

DotGG confirme le miroir Bandai : même 600×838 que `dbs-cardgame.com/fw/`,
SAMPLE diagonal sur FB01-053 et FB01-001_back.

---

## 4. Comparé à Naruto CACG FR

|                    | Naruto CACG                       | DBS Masters                                    | DBS Fusion World           |
| ------------------ | --------------------------------- | ---------------------------------------------- | -------------------------- |
| Source officielle  | `carddass.fr` **mort / revendu**  | `dbs-cardgame.com/europe-fr/` **vivant**       | `…/fw/` **vivant**         |
| Recovery           | Wayback Apache, trous reconstruct | Direct, schéma prédictible                     | Direct, schéma prédictible |
| Qualité            | rendus préparés (dump)            | Deckplanet 260×364, sans SAMPLE                | 600 px + SAMPLE            |
| Site FR communauté | forums d’époque                   | **dbscards.fr**                                | **fw.dbscards.fr**         |
| Piste morte        | —                                 | `cardgame.fr` (Maxildan, `/cards` non archivé) | —                          |

Le trou n’est pas « les images ont disparu », c’est **la résolution + le
watermark** Masters.

---

## 5. Autres sources (pas encore sondées en profondeur)

| Source                                                                                                                             | Rôle probable                                           | Note                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[apitcg.com](https://docs.apitcg.com/)**                                                                                         | API (`dragon-ball-fusion` côté FW, à confirmer Masters) | Clé gratuite ; déjà dans [tcg_support.md](tcg_support.md) §2 — **à sonder** (langues, SAMPLE ou pas, parallels)                                                                                                                                                         |
| **[vitorjcorreia/Dragon-Ball-Masters-Arena](https://github.com/vitorjcorreia/Dragon-Ball-Masters-Arena)**                          | Dump TCG Arena / Deckplanet (`assets/{SET}/{id}.webp`)  | **Clone** → `data/dbs/cg/staging/dragon-ball-masters-arena/`, rangé sous `cards/{set}/en/`. English only. Leader `_b` → `awakened.webp`.                                                                                                                                |
| **[Drive « DBS Proxies »](https://drive.google.com/drive/folders/1dSiMMzwGuXlyJoBAdcrBfUGVzH-aWqHC)**                              | Proxies r/DBS_CardGame                                  | **Sondé 2026-08-14.** `BT1-001.png` = octet-pour-octet la cardlist Bandai **EN** (`/images/cardlist/cardimg/`, 260×364, SAMPLE, texte EN). Pas de FR, pas plus grand que Bandai, figé ~BT15 (2021). **Inutile** — on a déjà l’URL officielle.                           |
| **[Drive « DBSCG Scans »](https://drive.google.com/drive/folders/1UWy7VQ6TdzDDuu-6EAEt8Z8hu0gGG2Tb)**                              | Scans physiques (u/CMANsurvives)                        | **Sondé 2026-08-14.** Vrai papier, EN, **sans SAMPLE**, ~741×1037 (~1,8 Mo). Corpus minuscule : 13 faces (BT1/7/10/11 + EX08) + `cardback.png` (dos 7 boules, 740×1037). Pas un catalogue ; dos sleeve déjà covered par dbscards 400×560 (plus propre). **Pas ingéré.** |
| **[Template Card Conjurer](https://www.reddit.com/r/DBS_CardGame/comments/1lznuui/custom_card_template_for_dbs_masters_on_card/)** | Frames fan pour cartes custom                           | **Sondé 2026-08-14.** Fichier `DBS Battlecard.cct` (rakan121ksa2). 5 cadres Battle 645×900 + icônes energy/combo. `masks: []`. Pas de Leader, pas de dos, pas de faces officielles. **Hors catalogue / hors foil.**                                                     |
| **Fusion World Digital**                                                                                                           | Client Unity (physique + digital)                       | Piste **HD** du même genre que [pokemon_live_rainier.md](pokemon_live_rainier.md) — textures sans SAMPLE ? ToS / dump à cadrer avant tout extract                                                                                                                       |
| **BANDAI TCG+**                                                                                                                    | App events / deck                                       | Pas une cardlist HD connue                                                                                                                                                                                                                                              |
| Coleka                                                                                                                             | Photos marketplace                                      | Comme Naruto : preuve / reconstruct, pas catalogue                                                                                                                                                                                                                      |
| Limitless / meta sites                                                                                                             | Decks tournoi                                           | Pas une API collection                                                                                                                                                                                                                                                  |

**Prix EUR** : dbscards agrège Cardmarket ; pas d’équivalent TCGdex gratuit
sondé pour DBS.

**Identité print** : codes `BT1-001`, `FB01-053`, suffixes `_p1` / `_f` /
rareté (`R`, `SCR`). Langue = exemplaire (FR Masters vs EN cardlist), pas la
clé — à caler sur `printKey` ([tcg_support.md](tcg_support.md) §1).

---

## 6. Implications Placarr

**Livré (Masters)** — `src/providers/dbscg/` + pack `src/effects/dbscg/` (`dbs-cg`) :

- Catalogue local `data/dbs/cg/catalog.sqlite` via POST cardlists **europe-fr** et **us-en** (Catalogue Sync, `--langs fr,en` par défaut). Noms FR et EN dans `cards-index.json` (`langs.fr.name` / `langs.en.name`).
- printKey `dbscg:bt1-001` ; parallels `_SPR` / `_PR` → grouping (`dbscg:bt1-011-spr`).
- Faces FR = dbscards / Bandai (étape `faces`, HTTP). Faces EN = clone TCG Arena rangé sous `data/dbs/cg/cards/{set}/en/{card}/` (étape `arena`). Leader `_b` → `awakened.webp`, pas le dos sleeve.
- Dos sleeve = dbscards `original/back.webp` (curated).
- Foil : tag `foil` + house `flare`, pas de mask Bandai.
- Fusion World = **autre** module (`src/providers/dbsfw/`, `data/dbs/fw`,
  Catalogue Sync). Catalogue : onglets Dragon Ball → Masters | Fusion World.
- Graphe produit→cartes : Sync admin (Masters / Fusion World). Hors de
  la boucle horaire — l'hôte tarpitte. HTML déjà là = reprise. Pas de
  packshot CDN.

Reste ouvert :

1. **Cardlist Bandai** = métadonnée + visuel officiel SAMPLE / petit (fallback).
2. **Deckplanet / TCG Arena** = faces catalogue Masters (260×364, sans SAMPLE).
3. **dbscards** = visuel FR plus grand (400×560) — fallback HD à trancher (ToS).
4. **Vrai HD** = piste FW Digital (Unity) ou scans ; `cardgame.fr` est fermé.
5. **Foil réel** : pas de masks Masters. FW Digital à vérifier avant d’inventer du CSS.
6. TTS Workshop 1552795176 / `archive/card_game_steam.md` = recovery cardgame.fr, **pas** le catalogue.

## 7. Suite

- [x] Cardlist europe-fr + us-en : POST `category_exp` — scrape Catalogue Sync (noms FR et EN).
- [x] Faces Deckplanet / TCG Arena : clone + rangement `en/` (Catalogue Sync étape `arena`).
- [ ] Compte apitcg : FW (et Masters s’il existe), SAMPLE, pagination.
- [ ] Faces fw.dbscards.fr (taille, SAMPLE, alt arts).
- [ ] Dos FW physique vs placeholder Masters.
- [ ] dbscards comme fallback visuel (ToS) vs rester sur Bandai SAMPLE.
- [ ] Client FW Digital : textures dumpables ?
- [x] Provider Fusion World (`dbsfw` / `data/dbs/fw/`, Catalogue Sync).
- [x] Catalogue admin : franchise Dragon Ball → Masters | Fusion World.
- [x] Graphe produit→cartes : Sync admin (hors boucle horaire).

## 8. À reprendre quand dbscards.fr sera de nouveau debout (2026-08-15)

L'hôte est tombé en fin de session : `static.dbscards.fr` **et**
`www.dbscards.fr` expirent tous deux à 30 s. Avant ça il tarpittait par
intermittence — mesuré entre 0,07 s et 28 s sur la même URL.

### 8.1 Le JSON-LD de `/cards` est l'index qu'on cherchait

Leur page de liste embarque un `ItemList` schema.org qui donne, **par carte**,
son `url`, son `name` et surtout son `image` — l'URL réelle, sans construction
de slug :

```json
{
  "@type": "ListItem",
  "position": 1,
  "url": "https://www.dbscards.fr/cards/bt31-001-uc-gogeta-ss-fusion-de-renversement-de-situation",
  "name": "Son Goku et Vegeta // Gogeta SS, Fusion de Renversement de Situation",
  "image": ".../fr/bt31/image-cartes-a-collectionner-...-bt31-001-uc-gogeta-...-back.webp"
}
```

J'avais écrit plus haut qu'aucune route adressable n'existait, à cause du POST
à jeton CSRF et de la pagination XHR. C'est faux : la correspondance est en
clair dans le balisage que lisent les moteurs de recherche. **À vérifier dès
que l'hôte répond** : la pagination de ce JSON-LD. S'il se parcourt, il
remplace toute la construction de slug et supprime la requête perdue par carte.

### 8.2 Ce que le JSON-LD confirme déjà

- Le suffixe de verso est bien **`-back.webp`**, y compris en français.
- Le slug d'un Leader utilise le **nom d'éveil**, pas le nom de face — le champ
  `name` porte les deux, séparés par `//`.

Autrement dit, la construction actuelle de `dbscardsFaces` est correcte pour
les versos. **Ne pas la « corriger » sur la foi du test raté ci-dessous.**

### 8.3 Le test de versos du 15/08 ne mesure rien

Un échantillon de 5 Leaders FR a donné 0/5 sur les versos. Mesure **invalide** :
le contrôle lancé ensuite a montré que `bt1-001` échouait aussi sur sa **face**,
alors que ce fichier est sur disque en 400×560, téléchargé le jour même. L'hôte
ne répondait plus ; le test mesurait la panne, pas nos URLs.

Leçon déjà apprise sur Naruto et re-apprise ici : _un résultat négatif ne vaut
rien tant que l'outil n'a pas prouvé qu'il peut produire un positif._ Toujours
inclure un témoin connu-bon dans ces sondages.

### 8.4 État au moment de la coupure

|                      | fr                   | en                               |
| -------------------- | -------------------- | -------------------------------- |
| tirages au catalogue | 7241                 | 8421                             |
| faces dbscards       | 111                  | 0                                |
| faces bandai         | ~183                 | 0                                |
| faces deckplanet     | —                    | 8823                             |
| versos               | 0 (sur 503 attendus) | 628 (ancien nom `awakened.webp`) |

À relancer quand l'hôte répond : Catalogue Sync Masters (admin), avec
`--skip scrape` pour ne garder que `arena` + `faces`.

Le catalogue est à jour (scrape des deux locales fait le 14/08), donc seules
les étapes `arena` (locale, rapide) et `faces` restent utiles.

## Réfs

- [tcg_support.md](tcg_support.md) — printKey, providers, apitcg
- [one_piece_tcg.md](one_piece_tcg.md) — même éditeur Bandai, même API apitcg
- [naruto_carddass_fr_recovery.md](naruto_carddass_fr_recovery.md) — modèle dump officielles
- [pokemon_live_rainier.md](pokemon_live_rainier.md) — extract client digital
- [backlog.md](backlog.md) — P2 autres TCG
