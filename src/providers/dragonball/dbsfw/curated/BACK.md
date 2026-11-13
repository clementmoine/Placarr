# Pack card back — provenance

| Fichier curated | `src/providers/dragonball/dbsfw/curated/cards/back.webp`                                         |
| --------------- | ------------------------------------------------------------------------------------- |
| Fichier data    | `cards/back.webp` (copie)                                                             |
| URL             | `/assets/dragonball/fw/cards/back.webp`                                                      |
| Taille          | 841×1186 WebP                                                                         |
| Source          | client officiel, texture `Default` de `packdata_assets_card_sleeve.bundle`           |

## Client

Le client Fusion World n’a pas un dos par carte. Le verso affiché quand une
carte est retournée est la sleeve `Card/Sleeve/Default` : sept boules, filet
orange, mention « DRAGON BALL SUPER CARD GAME ». Le gris autour de la carte
est la marge de la sleeve ; on le rogne avant d’écrire `cards/back.webp`.

L’ancien fichier CDN (400×560, même motif, octet Masters
`original/back.webp`) reste dans `curated/cards/cdn-back.webp`. Ce n’est pas
un `back.*`, donc le Sync ne l’installe pas comme un second verso.

Le dos physique imprimé n’est toujours pas un scan séparé. Le dos d’une carte
à deux faces (leader) est un autre visuel : `back.client.webp` à côté de
l’impression, composé comme la face.
