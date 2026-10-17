# Magic: The Gathering — verso & langues

Dos classique Magic (sleeve partagé) → `curated/cards/back.jpg` → install
`data/mtg/cards/back.webp`.

Source : Scryfall backs CDN, fallback Wikimedia
`Magic_the_gathering_card_back.jpg`.

Les dos **spécifiques par set** (Innistrad, Unstable…) ne sont pas curés —
le catalogue utilise le dos générique pour le flip UI.

## Langues

1. **Original** obligatoire — Magic = `en`
2. **Français** s’il existe — titres + `artUrl` `fr`
3. **Anglais** = l’original ici (déjà couvert)

Exclusives sans EN/FR (ex. promo JP-only) : on garde la langue source pour ne
pas perdre le tirage. `defaultLanguage` provider = `fr`.
