# Naruto Kayou — verso sleeves

Kayou expose `backImage` par carte sur [kayouofficial.com](https://www.kayouofficial.com/)
(et narutodb pour les séries hors store US). Placarr classifie **par hash PNG** :

1. **Dos rareté** (`data/…/cards/back.<tier>.webp`) — un fichier par hash ; aliases dans
   `data/…/sources/kayou-back-aliases.json`. Si un verso official a les mêmes bytes → stamp tier.
2. **= dos pack** (`back.webp`) → pas de fichier ni stamp.
3. **Sinon** → dos **card-specific** : `cards/{set}/{lang}/{number}/back.webp`
   à côté du recto. Même bytes sur N cartes = N copies. **Pas** de tuile catalogue
   (visible au flip étagère seulement).

CDN = URL-récupérable → **`data/naruto/kayou/cards/` only** (pas de miroir
`curated/cards`). Harvest brut : `data/…/cards/official/<slug>.png`. Install :
`installKayouOfficialCardBacks` (`placement` dans `kayou-official-card-backs.json`).

## Fichiers

| Pattern data | URL |
| ------------ | --- |
| `cards/back.<tier>.webp` | `/assets/…/cards/back.<tier>.webp` |
| `cards/official/<slug>.png` (≠ tier) → `cards/{set}/en/{number}/back.webp` | `/assets/…/cards/{set}/en/{number}/back.webp` |
| `cards/back.webp` (pack) | tuile « Dos · pack » |

Ledgers syncés : `data/naruto/kayou/sources/kayou-official-*.json`. Faces checklist FR :
[Narutopia](https://narutopia.fr/liste-de-cartes-kayou/) → `narutopia-kayou-images.json`.

`stampKayouBack()` : placement official → sinon tier canonique → sinon défaut pack.
