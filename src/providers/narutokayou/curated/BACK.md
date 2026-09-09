# Naruto Kayou — verso sleeves

Kayou expose `backImage` par carte sur [kayouofficial.com](https://www.kayouofficial.com/)
(et narutodb pour les séries hors store US). Placarr classifie **par hash PNG** :

1. **Dos rareté** (`cards/back.<tier>.webp`) — un fichier par hash ; aliases dans
   `kayou-back-aliases.json`. Si un verso official a les mêmes bytes → stamp tier.
2. **= dos pack** (`back.webp`) → pas de fichier ni stamp.
3. **Sinon** → dos **card-specific** : `cards/{set}/{lang}/{number}/back.webp`
   à côté du recto. Même bytes sur N cartes = N copies. **Pas** de tuile catalogue
   (visible au flip étagère seulement).

Harvest brut : `curated/cards/official/<slug>.png`. Install :
`installKayouOfficialCardBacks` (`placement` dans `kayou-official-card-backs.json`).

## Fichiers

| Pattern curated | Data | URL |
| --------------- | ---- | --- |
| `cards/back.<tier>.png` | `cards/back.<tier>.webp` | `/assets/…/cards/back.<tier>.webp` |
| `cards/official/<slug>.png` (≠ tier) | `cards/{set}/en/{number}/back.webp` | `/assets/…/cards/{set}/en/{number}/back.webp` |
| `cards/back.png` (pack) | `cards/back.webp` | tuile « Dos · pack » |

Ledgers : `kayou-official-tier-backs.json`, `kayou-official-card-backs.json`,
`kayou-back-aliases.json`.

`stampKayouBack()` : placement official → sinon tier canonique → sinon défaut pack.
