# Yu-Gi-Oh! — verso & sources

Pas de verso Yu-Gi-Oh! curé. Poser `curated/cards/back.webp` quand un scan attesté existe.

## Catalogue

| Source | Rôle |
|--------|------|
| [YGOPRODeck API](https://ygoprodeck.com/api-guide/) | Seed EN (+ noms FR `language=fr`) TCG, images passcode → `data/yugioh/staging/ygoprodeck/` |
| [ScanFlip](https://www.scanflip.fr/fr/yugioh/cards) | Codes régionaux FR (`LDD-F000`…) → `data/yugioh/staging/scanflip/` |
| [Konami Card DB](https://www.db.yugioh-card.com/yugiohdb/) | Officiel (Neuron) — **pas d’API publique** ; scrape hors scope pour l’instant |

PrintKeys distincts par code imprimé : `LOB-EN005` ≠ `LDD-F005`. Images YGOPRODeck = art EN (partagé par passcode).

Sync : Catalogue Extract (`--max-cards`, `--max-pages`, `--skip-faces`, `--skip-ygoprodeck`, `--skip-scanflip`, `--limit`).
