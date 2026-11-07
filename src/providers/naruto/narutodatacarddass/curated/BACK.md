# Naruto Data Carddass — verso

Chaque carte porte un verso **numéroté** (double bande CODE128, payload
unique pour le lecteur arcade). Idéalement : un scan par print sous

```
cards/{set}/{lang}/{number}/back.<source>.{jpg|png|webp}
```

Ex. `cards/dn/ja/032t/back.suruga.jpg` → `print_assets.back`.

## Fallback catalogue (2026-11-05)

Sans corpus verso carte-par-carte, on affiche un **dos numéroté
représentatif** (motif + CODE128 + id imprimé) pour le flip :

| Curated | Data | Rôle |
| ------- | ---- | ---- |
| `cards/back.jpg` | `cards/back.webp` | Pack défaut (`/assets/…/backs/ja`) |
| `cards/ja/dn/back.ja.jpg` | `cards/ja/dn/back.ja.webp` | Série DN (+ DT tant qu’aucun DT distinct) |
| `cards/ja/nm/back.ja.jpg` | `cards/ja/nm/back.ja.webp` | Série NM (Narutimet Mission) |

Sources Amazon JP (scans produit, dos visible) :

- DN-029T — [B09SV21Q16](https://www.amazon.co.jp/-/en/Naruto-DN-029T-Ultimate-Battle-Re-fukiri/dp/B09SV21Q16) → `I/71a9yZ5OBeL.jpg`
- NM-125 — [B09SV1S7FM](https://www.amazon.co.jp/-/en/Naruto-Shippuden-NM-125-Narutimet-Mission/dp/B09SV1S7FM) → `I/71NU1Ifm8rL.jpg`

Ce n’est **pas** l’identité optique exacte de chaque print (le barcode
change) : c’est un sleeve honnête « dos numéroté DCD » en attendant des
scans per-card. NF / NX / promos retombent sur le dos pack.

## Ce qu’on n’installe toujours pas

- Un dos cabinet **sans** numéro / barcode (motif seul) — mentirait sur le
  type de verso.
- Remplacer un `back.<source>` déjà posé sur une print.
