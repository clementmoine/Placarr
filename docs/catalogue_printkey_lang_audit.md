# Catalogue TCG — printKey × langue

> Audit empirique **2026-09-21** sur corpus local. Alimente le contrat [catalogue_contract.md](catalogue_contract.md).

## Question

Existe-t-il des cas où **même `printKey`**, langues différentes = **cartes physiquement distinctes** (pas une traduction / face localisée du même tirage) ?

## Mesures

### Pokémon (`prints.sqlite`)

- **34 006** `print_key` uniques.
- **20 072** avec titres sur **plusieurs** `lang` (`print_titles`) — modèle **1 identité + N faits langués**.
- `cards-index.json` Live : ~15 871 couples set+num avec stems **par langue** (`me5_fr_001` vs `me5_en_001`) — ce sont des **clés d’asset Live**, pas des identités catalogue distinctes. Le join prix / checklist parle déjà `pokemon:set-number`.

**Verdict Pokémon** : pas d’évidence de « autre carte » sous le même `pokemon:…` ; la langue appartient aux **faits** (titre, art, prix), pas à la clé.

### Lorcana (`catalog.sqlite`)

- **3 271** prints ; **6 431** `print_titles` et **6 431** `print_assets` (≈ 2 langs × prints).
- Assets **par `(print_key, lang)`** — même identité, faces EN/FR séparées.

**Verdict Lorcana** : aligné sur 1 printKey + faits langués.

### Naruto (code + catalogue admin)

- Flag `languageSpecific` : certains tirages (ex. Ninja Ranks) ont un **recto localisé** qui ne doit pas être emprunté silencieusement.
- Ce n’est **pas** une deuxième `printKey` : c’est un fait « face liée à la langue » + règle d’emprunt.

**Verdict Naruto** : exception de **présentation / borrow**, pas de scission d’identité (sauf cas catalogue déjà séparés NI vs N, etc.).

## Règle retenue

1. **Majorité** : `printKey` = identité physique ; **chaque fait** (titre, face, prix, SKU externe…) porte **`lang` + `provenance`**.
2. **Exception** : `languageSpecific` (ou équivalent) empêche le borrow cross-locale de la face ; la clé reste unique.
3. **Ne plus** encoder la langue dans la clé admin (stems Live `_{lang}_`) pour l’énumération catalogue — les stems restent des chemins d’assets / foil.

## Demande FR

Préférer faits `lang=fr` ; si borrow EN autorisé → provenance explicite `cross-locale` (comme ailleurs dans l’app pour prix/covers).
