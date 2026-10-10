# Dos Leclerc

Dos de carte (Paninimania) curés par opération :

| Set | Source Paninimania |
|-----|--------------------|
| `marvel21` | idm=7251 « Dos de carte » |
| `marvel22` | idm=7429 |
| `marvel23` | idm=7561 |
| `marvel24` | idm=7726 |
| `disney25` | idm=7872 « Dos de cartes 1 » (mosaïque 2×4 → crop 1 dos, variante « 3 ») |

Fichiers : `curated/cards/<set>/back.jpg` → Sync les convertit en
`data/leclerc/<set>/cards/<set>/back.webp`.

## Faces

1. **Coleka listing** (Flare) — pages 1…N, stop au Turnstile.
2. **CDN ledger** `sources/coleka-cdn-faces.json` — URLs `thumbs.coleka.com`
   découvertes via index Bing quand le listing est muré.

Sync → `art.coleka.webp` sous `data/leclerc/<set>/cards/<set>/fr/<n>/`.

### Couverture (dumps navigateur `?nbpp=240`)

| Set | Faces | Checklist | Notes |
|-----|------:|----------:|-------|
| marvel21 | **108** | 108 | `revele-ton-pouvoir_r22334` |
| marvel22 | **108** | 108 | |
| marvel23 | **132** | 108+24 Fixeez | Fixeez matchés checklist (+ `aka`) — pas de n° F Coleka |
| marvel24 | **132** | 108+24 Fixeez | Fixeez f01–f24 dans le filename Coleka |
| disney25 | **132** Coleka + **108** eBay cartes + Fixeez MSKU | 108+24 Fixeez | Cartes : `236426654358`. Fixeez : `236423984089` (noms nus → checklist). f06 Main de Mickey = galerie eBay `art.ebay.jpg`. Install eBay cartes : crop fixe L/R 255 (pas Fixeez). |

TCDB Images / laststicker / Wayback : pas exploitables (403 / promo only).

**Astuce** : Turnstile → ouvrir `?nbpp=240` → sauver `div.schema` →
`data/leclerc/<set>/staging/coleka-faces/listing-0.html`.
