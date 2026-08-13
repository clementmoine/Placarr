# Pack card back — provenance

| Fichier curated | `src/providers/narutoccg/curated/back.png` (source HD) |
|-----------------|------------------------------------------------------|
| Fichier data | `cards/back.webp` (install lossless WebP) |
| URL | `/assets/naruto/ccg/cards/back.webp` |
| Taille | 843×1206 (aligné faces S5 site) |
| Source | **Figma HD** (recréation), 2026-08-13 |

## Recherche dos officiel (négatif)

Sondé 2026-08-13 — **aucun JPEG « dos / verso / back »** utile :

| Source | Résultat |
|--------|----------|
| CDX `carddass.fr/naruto` (~2936 URLs + images) | 0 hit `*dos*` / `*verso*` / `*back*` |
| Pages « Comment jouer » (`c_jouer_p*`) | Anatomie **avers** seulement |
| Ultrajeux / cartes-naruto.com / bandai.fr CDX | pas de scan dos FR indexé |
| `cartes/` faces typées | avers (+ `-vc` errata), pas de verso produit |

Le dos papier CACG FR (« Cartes à jouer et à collectionner ») n’a **pas** été publié
en asset isolé sur le site d’époque (au contraire des faces).

## Règle

- **Garder** `curated/back.png` Figma tant qu’il n’y a pas mieux ; l’install écrit
  `cards/back.webp`.
- Si un scan / asset **officiel** (Wayback, Bandai, notice boîte…) apparaît →
  le remplacer en curated (ou `back.official.*` + préférer celui-là) et noter la
  source dans ce fichier.
- Ne pas confondre avec EN CCG / JP Carddass (autre dos produit).
