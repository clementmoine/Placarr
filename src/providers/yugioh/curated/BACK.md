# Yu-Gi-Oh! — verso & sources

Dos classique Konami (sleeve partagé TCG) via ygocards.fr :

| Fichier curated | `src/providers/yugioh/curated/cards/back.webp` |
|-----------------|------------------------------------------------|
| Fichier data    | `data/yugioh/cards/back.webp` (copie Sync) |
| URL             | `/assets/yugioh/cards/back.webp` |
| Source          | [ygocards.fr](https://www.ygocards.fr/) `static.ygocards.fr/cards/original/back.webp` |

Sync : `harvestYgocardsDistinctBacks` (TCG Cards harvest) → curated + data.
`--skip-backs` pour un smoke sans CDN.

## Catalogue

| Source | Rôle |
|--------|------|
| [YGOPRODeck API](https://ygoprodeck.com/api-guide/) | Seed EN (+ noms FR `language=fr`) TCG, images passcode → `data/yugioh/staging/ygoprodeck/` |
| [ScanFlip](https://www.scanflip.fr/fr/yugioh/cards) | Codes régionaux FR (`LDD-F000`…) → `data/yugioh/staging/scanflip/` |
| [ygocards.fr](https://www.ygocards.fr/) | Scellé + cotes + dos pack + faces boutique (`--ygocards-faces`) |
| [Konami Card DB](https://www.db.yugioh-card.com/yugiohdb/) | Officiel (Neuron) — **pas d’API publique** ; scrape hors scope pour l’instant |

PrintKeys distincts par code imprimé : `LOB-EN005` ≠ `LDD-F005`.

**Faces** : locale-specific — pas de borrow EN→FR (contrairement à OPTCG / Mythos). Tuile FR sans scan FR = `missingArt`.

Sync : Catalogue Extract (`--max-cards`, `--max-pages`, `--skip-faces`, `--skip-backs`, `--skip-ygoprodeck`, `--skip-scanflip`, `--limit`).
