---
name: source-research
description: Research a data source for Placarr — probe a website, API, CDN, Wayback archive or mobile app for card faces, titles, sealed products, prices or foil assets, and record findings. Use when hunting missing faces / promos / sealed contents, auditing what a site exposes, or sniffing an app's traffic, before writing provider code.
---

# Source research

Research results are durable project knowledge: they go in the franchise doc under `docs/` (map in `src/providers/CLAUDE.md`) or in `src/providers/<id>/curated/sources/*.json` ledgers — not only in chat.

## Method

1. **Indexes before fiches.** Open the site's list / explist / sitemap / CDX index first, then individual pages. Prefer structured data (JSON-LD, OG, JSON API) over HTML.
2. **Archive first, decide later.** Download raw captures under `data/<pack>/staging/` (gitignored). Promotion to `cards/` (`art.<source>.*`) or `products/` is a separate decision; skipping is a promotion choice, never a deletion of data.
3. **Attest everything.** Each fact keeps provider + date + an openable deep link (or its Wayback copy, never a homepage). No attestation → `null`. Numbers suggested by another AI or by lot listings are not attestation — they get rejected (see `src/providers/leclerc/curated/BACK.md`).
4. **Use the shared plumbing.** Network calls through `@/lib/http` (`httpGet`, `fetchTextWithFlareFallback` when Cloudflare blocks — needs `BYPARR_URL`); Wayback helpers in `src/providers/shared/wayback/`; Coleka / CCGTrader / nikita / tcgcards digs in `src/providers/shared/`. Respect soft-bans and the persisted circuit breaker — do not hammer a host that is answering 429.
5. **Record the outcome** with a dated heading (`## Session YYYY-MM-DD — …`): what was exhausted (and how it was measured), what was filled, what stays open, traps not to reopen. Use the status vocabulary already in the docs: harvest / recheck / done / watch / skip.

## Mobile apps (TCG Live, Lorcana, others)

Real-device mitmproxy + Frida unpinning setup: `docs/device_mitm_frida.md`; Pokémon Live API/CDN notes: `docs/pokemon_live_rainier.md`; Fusion World client: `docs/fusion_world_digital.md`. Frida is QA / discovery only — never a product data source. Never commit tokens or captures (`flows/tokens.json`, `.mitm` files). These steps need the user's phone and accounts: ask before running anything on the device.

## Ending

- A source worth wiring → continue with the `add-provider` or `add-tcg-line` skill.
- Anything durable learned about a source's limits (APK-gated asset, dead host, rate limits) goes in the doc so the next session does not redo the hunt.
