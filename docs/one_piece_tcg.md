# One Piece Card Game (OPTCG) — recherche sources

> Statut : **recherche only** (2026-08-12). Pas de provider Placarr, pas de pack
> `effects/onepiece`. Prochain TCG d’intérêt après Pokémon / Lorcana.
>
> Contrat produit (aligné Pokémon sans Live) :
> - **Catalogue** (éditions, printKey, images, finitions) = obligatoire.
> - **Rendu foil** = seulement s’il existe des **masks / plaques** réelles.
> - Sans mask : on peut quand même ajouter une carte **foil** — tag / info /
>   prix de finition sur l’exemplaire, **face plate** (pas de faux CSS holo).

## 1. Catalogue & APIs

| Source | Rôle | Accès | Notes |
|--------|------|--------|-------|
| **[apitcg.com](https://docs.apitcg.com/)** | API multi-TCG (`one-piece`, DB Fusion, Digimon, …) | Clé gratuite (`x-api-key`) | Déjà listé dans [tcg_support.md](tcg_support.md) §2 — **à sonder** (langues, variants parallel, rate limits) une fois la clé en main |
| **[apitcg/one-piece-tcg-data](https://github.com/apitcg/one-piece-tcg-data)** | Dataset lié apitcg | GitHub | Complément offline |
| **[vegapull](https://github.com/Coko7/vegapull)** (`vega`) | CLI scrape **site officiel** Bandai | Open source (Rust) | Packs + cartes + images |
| **[punk-records](https://github.com/buhbbl/punk-records)** | JSON multi-langues (sortie vegapull) | GitHub | EN / FR / … + index |
| **[vegapull-records](https://github.com/Coko7/vegapull-records)** | JSON EN/JP | GitHub | Images en archive release |
| **[optcgapi.com](https://optcgapi.com/)** | API catalogue + prix (EN, OP-01…OP-15 + starters) | Free | Couverture EN ; fraîcheur à vérifier |
| **BerryWallet** ([pokewallet.io/berrywallet](https://www.pokewallet.io/berrywallet)) | Prix live TCGPlayer + Cardmarket, EN/JP | Free tier + clé | Utile pour EUR Cardmarket |
| **RapidAPI « One Piece TCG Card Database »** | Catalogue + facets | RapidAPI | Paywall / quotas |
| **[tcgapi.dev](https://tcgapi.dev/)** | Prix multi-jeux (TCGPlayer) | Payant | Large filet, pas OPTCG-only |
| **Scrydex** | Catalogue + prix | **Payant** | Déjà noté dans tcg_support |
| Site officiel | [en.onepiece-cardgame.com/cardlist](https://en.onepiece-cardgame.com/cardlist/) | Public | Source images HTML ; scrape = vegapull |

**Prix EUR** : pas d’équivalent TCGdex « gratuit natif ». Pistes = Cardmarket via BerryWallet / agrégateurs, ou USD→EUR `~`.

**Identité print** : codes type `OP01-001`, variants parallel / alt — à caler sur `printKey` Placarr (même esprit Lorcana / Pokémon). Langue = exemplaire, pas la clé (à confirmer sur les datasets FR/EN).

## 2. Clients digitaux & « foil » (vs Live / Lorcana)

| App | Plateforme | Rôle | Assets foil dumpables ? |
|-----|------------|------|-------------------------|
| **Bandai Teaching App** | iOS / Android | Tutoriel règles + free battle solo | **Non** — pas un client collection / Unity foil |
| **Client officiel PvP / Steam Bandai** | — | **N’existe pas** (état communauté 2025–26) | — |
| **[OPTCG Sim](https://optcgsim.com/)** (Batsu) | Win / Mac / Linux / Android (+ iOS bricolé) | Sim non officiel pour jouer | Table de jeu ; **pas** une source produit de shaders/masks (ToS / copyright) |
| **Tabletop Simulator** + mods Workshop | Steam | Sandbox | Cartes plates / assets community |
| **OP TCG Dex** | App Store | Scanner, collection, prix ; overlay « shiny » optionnel | Cosmétique app, **pas** dump d’assets Bandai |
| Untap.in | Navigateur | Play loose | — |

**Conclusion foil** : pas d’équivalent **Pokémon TCG Live** ni **Lorcana mobile Unity** pour un pipeline APK/CDN → frags + masks. Tant que ça reste vrai, Placarr **n’invente pas** de foil CSS sans mask.

## 3. GitHub / libs foil génériques (pas OPTCG-spécifiques)

Appui d’**analyse** uniquement (comme simey pour Pokémon) — **pas** vérité Bandai :

| Repo | Notes |
|------|--------|
| [kongyo2/cards-css](https://github.com/kongyo2/cards-css) | Holo CSS procédural (tilt, plusieurs finishes) |
| [sawyerWeld/card-foil](https://github.com/sawyerWeld/card-foil) | foil / etched / galaxy / oil-slick, léger |

Ne pas brancher comme rendu OPTCG « officiel ».

## 4. Autres outils communauté

- **Limitless TCG** — tournois / decklists OPTCG (pas catalogue collection).
- **onepiece.gg** etc. — guides / meta ; pas une API catalogue stable.

## 5. Implications Placarr (quand on ouvrira le chantier)

1. **Provider catalogue d’abord** — candidat principal **apitcg** (déjà prévu backlog) *ou* index offline **vegapull → punk-records** (multi-lang, sans dépendance API runtime). Sondage clé apitcg avant de choisir.
2. **Finition** = propriété d’**exemplaire** (`Item.variant` / finish) : on peut stocker `foil` / parallel même **sans** rendu.
3. **Rendu foil** = reporté jusqu’à une source réelle de masks (app Unity Bandai, CDN, etc.). Jusque-là : face plate.
4. **Sim Batsu / TTS** = hors scope produit (pas de scrape d’assets pour foil).
5. **Prix** = chantier séparé (Cardmarket / BerryWallet / FX).

## 6. Prochaines recherches (avant code)

- [ ] Compte apitcg : une carte FR, variants parallel, image URL, pagination, rate limit.
- [ ] Comparer fraîcheur **punk-records FR** vs apitcg vs cardlist officiel.
- [ ] Lister les finishes catalogue OPTCG (parallel, SP, manga rare, …) pour l’axe variante exemplaire.
- [ ] Surveiller une éventuelle app / client Bandai avec rendu foil (changement de stratégie dump).

## Réfs

- [tcg_support.md](tcg_support.md) — modèle printKey, providers, doublons  
- [foil_effects.md](foil_effects.md) — contrat foil (packs avec assets)  
- [foil_apk_sources.md](foil_apk_sources.md) — quand APK / réseau existent  
- [backlog.md](backlog.md) — P2 autres TCG (apitcg)
