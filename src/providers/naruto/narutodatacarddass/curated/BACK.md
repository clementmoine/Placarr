# Naruto Data Carddass — verso

**Pas de dos pack, pas de dos par cabinet.** Chaque carte porte son
propre verso : double bande CODE128 optique (payload unique → lecteur
arcade), donc un fichier par print.

## Où le poser

```
cards/{set}/{lang}/{number}/back.<source>.{jpg|png|webp}
```

Ex. `cards/dn/ja/032t/back.suruga.jpg`. Install → `print_assets.back` ;
le flip catalogue lit le verso de la print (`PrintCandidate.cardBackUrl`),
jamais un sleeve partagé.

## Ce qu’on n’installe pas

- `cards/back.webp` (pack) — faux positif « Dos · pack » dans le catalogue.
- `cards/{dn,nm,nf,nx}/back.webp` (cabinet) — le motif de fond peut se
  ressembler entre cartes d’un même jeu, mais le **barcode** change : un
  sleeve commun mentirait sur l’identité optique.

## À curer

Scans Suruga / eBay / collection perso en verso carte-par-carte. Aucun
placeholder pack dans `curated/cards/`.
