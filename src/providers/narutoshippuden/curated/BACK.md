# Verso du 「NARUTO-ナルト- 疾風伝 カードゲーム」

`cards/back.ja.png` — 823 × 1206, RGBA.

## Provenance

- Source : `tcg-db.nikita.jp/img/card/nrts/back.jpg`, seul relevé public trouvé
  du verso de ce jeu.
- Agrandi hors ligne par l'utilisateur avant d'entrer ici ; l'original du site
  est trop petit pour un rendu de carte.

## Pourquoi curé, et pas moissonné

Aucune source répétable ne sert ce verso : le site le publie en une image
unique, sans liste ni index à parcourir. La règle du dépôt vaut ici — ce qui ne
vient pas d'un script vit dans `curated/`, pas dans du staging.

## Pourquoi ce nom, et à cette place

Un verso au niveau du pack, pas par set : les quatre familles (忍伝 / 術伝 /
作伝 / 忍伝-学) partagent le même dos, et un fichier par set n'aurait rien dit de
plus.

Le suffixe `.ja` n'est pas décoratif. Les dos sont **servis par langue**, et le
pack d'effets demande `cards/back.ja.webp` ; l'installeur convertit
`back.ja.png` vers exactement ce nom. Le poser en `back.png` produirait
`back.webp`, que rien ne va chercher — le jeu n'est sorti qu'en japonais, donc
c'est ce nom-là qui est le bon.

## Ce qu'il corrige

Ce jeu a longtemps vécu dans le pack Carddass faute d'un endroit à lui. Les dos
étant servis par langue, ses 313 cartes japonaises recevaient le dos **du
Carddass** — le triskèle 忍/術/幻 au lieu du losange « NARUTO 疾風伝 CARD GAME ».
