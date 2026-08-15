# Contrat des packs cartes — audit et harmonisation

État mesuré le **2026-08-15** sur les cinq packs cartes. À traiter plus tard :
rien ici n'est urgent, l'app fonctionne. C'est de la maintenabilité, et le coût
d'un pack de plus augmente tant que ce n'est pas fait.

## Ce qui est déjà commun

- **Contrat app** — chaque pack rend un `PrintCandidate`, avec le même nommage
  `search<Pack>Prints` / `lookup<Pack>Print` / `lookup<Pack>PrintDetail`.
- **Locales** — dossiers ISO 639-1 partout (`de en es fr it ja ptbr`). `jp`
  serait un code pays ; ne pas l'introduire.
- **`catalogCorpus`** — chemins de pack et statut, consommé par dbscg, dbsfw,
  lorcanatcg, narutoccg, pokemontcglive, icollect.
- **`cardFaces`** (2026-08-15) — sources multiples, `face.json`, classement par
  `explainAttachmentScoreForDisplay`. Consommé par dbscg et dbsfw.
- **`softban`** — dbscg, dbsfw, pokemontcglive. **`attemptOrder`** — dbscg seul.

## Ce qui diverge

### 1. Pokémon n'a pas le contrat de recherche

Les quatre autres packs ont `meta / prints / print_titles / print_assets`.
Pokémon n'a **aucune** de ces tables : `cards-index.json` (93 777 cartes, six
langues) plus un sqlite de `live_cards` / `card_foil`. Il n'expose ni
`searchPrints` ni `lookupPrint`.

C'est le seul manque **fonctionnel** de la liste. Les données existent déjà ; il
s'agit de les projeter dans les quatre tables et d'écrire la recherche. Aucun
fichier déplacé, aucun téléchargement.

### 2. `print_assets` a quatre formes

| pack       | colonnes                                                       |
| ---------- | -------------------------------------------------------------- |
| dbs/cg     | `image_url, back_url`                                          |
| dbs/fw     | `image_url`                                                    |
| lorcana    | `art, thumb, foil_mask, varnish_mask, second_varnish_mask`      |
| naruto/ccg | `art, thumb, back, source_url, wayback_timestamp`               |

Cible : un noyau `print_key, lang, art_url, back_url` plus une colonne
d'extension JSON pour ce qui est propre à un jeu.

**Ne pas aplatir** les vernis de Lorcana, le `wayback_timestamp` de Naruto ni le
`card_foil` de Pokémon : ces colonnes existent parce que ces sources sont
réellement différentes. Les fondre perdrait de l'information pour gagner de la
symétrie.

### 3. Nommage des fichiers

Cible : **`<role>.<source>.<ext>`** partout, l'extension étant celle que la
source a servie (voir §4).

| pack       | fichiers | dont faces        | sources / carte |
| ---------- | -------- | ----------------- | --------------- |
| pokemon    | 214 355  | ~94 000 `art.webp`| 1 (dump Live)   |
| lorcana    | 37 898   | ~19 000 `art/thumb.jpg` | 1 (dump Unity) |
| naruto/ccg | 844      | ~830              | 1, sauf 16      |
| dbs/cg     | 40 849   | 24 754            | **3**           |

Nuance mesurée : le gros des fichiers Pokémon et Lorcana n'est **pas** des
faces, ce sont des couches de rendu (`mask.webp`, `etch.webp`,
`varnish_mask.jpg`). Elles n'ont qu'une origine possible et n'ont pas besoin
d'un segment de source.

Et ces deux packs n'ont **qu'une source par carte** : renommer 113 000 fichiers
n'achèterait aucune capacité aujourd'hui, seulement la préparation d'une seconde
source. À faire quand elle arrive, pas avant.

### 4. Format des faces — **fait 2026-08-15**

`<role>.<source>.webp` figeait la politique d'un pack dans le contrat partagé :
DBS réencodait le PNG de Bandai en `webp({ quality: 92 })` — **lossy, et
définitif** — uniquement pour satisfaire un nom de fichier. Un catalogue qui
classe les faces sur leur qualité n'a pas à les dégrader à l'entrée.

L'extension fait désormais partie du nom, et les octets sont écrits tels
qu'ils arrivent (`webp`, `png`, `jpg` ; tout autre format est refusé, c'est une
page d'erreur déguisée). `face.json` enregistre le fichier réel, jamais un nom
reconstruit.

**Reste à faire** : les 7 637 `art.bandai.webp` déjà sur disque sont issus de
l'ancien réencodage lossy. Un `--only faces --force` limité à Bandai les
récupérerait en PNG d'origine — ~7 600 requêtes. Peu prioritaire : Bandai
perd systématiquement le classement face à dbscards (260×363 contre 400×560),
donc ces fichiers sont un repli rarement affiché.

### 5. Workflow

Seuls dbscg et dbsfw déclarent des `STEPS` (`--only`, `--skip`, `--offline`).
Pokémon expose **treize** scripts pnpm séparés là où une CLI à étapes ferait le
même travail de façon inspectable. Naruto et Lorcana n'en ont pas non plus.

## Ordre suggéré

1. **Pokémon rejoint le contrat de recherche** — seul manque fonctionnel, aucun
   octet déplacé, aucune requête.
2. **`print_assets` sur un noyau commun** + extension JSON — migration de schéma.
3. **`STEPS` déclarées partout** — opérabilité.
4. **`<role>.<source>.<ext>` chez Lorcana et Pokémon** — seulement le jour où
   l'un d'eux gagne une seconde source d'images.

Ne pas empiler ces chantiers sur un pack dont les données ne sont pas encore
vérifiées : Fusion World est prêt mais vide au 2026-08-15.
