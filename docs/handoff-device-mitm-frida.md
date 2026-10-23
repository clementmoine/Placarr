# Handoff — mitm + Frida SSL unpin (téléphone réel)

Setup pour **écouter HTTPS en clair** sur un vrai appareil Magisk (plus MuMu) —
Pokémon / Lorcana **et** toute app perso à auditer pour Placarr (retail, etc.).

Scratch (hors git, **ni Placarr ni Pockett**) : **`~/.cache/placarr-device-mitm/`**

Ne **jamais** committer `flows/tokens.json` / captures `.mitm`.

---

## 1. Appareil validé (2026-09-27)

| | |
|---|---|
| Device | Redmi Note 8 Pro (`hm5ln7vklnfa8dbu`), Android 10, **Magisk** |
| Packages | `com.pokemon.pokemontcgl`, `com.ravensburger.disney.lorcana` |
| Host | mitmproxy 12.x, Frida **17.16.4**, `frida-server` android-arm64 dans scratch `bin/` |
| LAN (ex.) | Mac `192.168.1.7` ← proxy ; téléphone `192.168.1.11` (wlan0) |
| Magisk CA | module `placarr_mitm_ca` → `/system/etc/security/cacerts/c8750f0d.0` **monté** après reboot |

Healthcheck : `~/.cache/placarr-device-mitm/scripts/status.sh`

---

## 2. Portée « n’importe quelle app » (objectif Placarr)

**Non : ce n’est pas magique pour 100 % des APK.** Trois filtres :

| Couche | Effet |
|---|---|
| **Proxy global** (`http_proxy` → Mac:8080) | Seules les apps qui **respectent** le proxy système passent par mitm |
| **CA Magisk** (`c8750f0d.0` system) | Apps qui **trustent** le magasin système → HTTPS en clair |
| **Pinning / Cronet / anti-Frida** | Rejet TLS ou besoin Frida `--unpin` |

**DenyList Magisk** : si l’app y est, elle **ne voit pas** le CA. Sur ce téléphone :
`com.grandfrais.app` est deny-listé → sans `--undylist`, Grand Frais restera opaque.

```bash
# Audit générique (comptes perso)
./scripts/listen.sh on
./scripts/audit_app.sh com.grandfrais.app --undylist
./scripts/audit_app.sh com.lidl.eci.lidlplus
./scripts/audit_app.sh com.some.app --unpin   # si pin TLS
./scripts/tail_flows.sh last 50
# mitm log : « Client does not trust the proxy's certificate » = pin ou CA masqué
```

Validé jeux :

| Trafic | État |
|---|---|
| Lorcana | ✅ CA seul |
| Pokémon Live (libcurl) | ✅ CA seul — **pas** Frida |
| Chrome / Google | ❌ pin / Cronet |

### Pokémon — raffiné

1. **Ne pas** lancer Frida sur Live : anti-tamper (`/proc/self/maps`) → launch timeout.
2. `./scripts/pokemon_sniff.sh` (coupe Frida, lance l’app).
3. Tokens → `flows/tokens.json` ; sync Mac :

```bash
mkdir -p .tmp-foil-audit/live-unity/mitm
cp ~/.cache/placarr-device-mitm/flows/tokens.json .tmp-foil-audit/live-unity/mitm/tokens.json
pnpm exec tsx src/providers/pokemon/live/pipeline/syncLiveOwned.ts
```

---

## 3. Écoute en clair (objectif)

```bash
cd ~/.cache/placarr-device-mitm
./scripts/listen.sh on
./scripts/audit_app.sh com.lidl.eci.lidlplus
./scripts/pokemon_sniff.sh              # shortcut Live
./scripts/tail_flows.sh                 # tout
./scripts/tail_flows.sh games           # Pokemon / Lorcana
./scripts/tail_flows.sh host lidl
```

Artefacts d’analyse :

| Fichier | Contenu |
|---|---|
| `flows/http_log.jsonl` | Chaque requête/réponse : headers + body texte |
| `flows/bodies/*.req.txt` / `*.res.txt` | Corps texte complets |
| `flows/capture_*.mitm` | Capture mitmproxy rejouable |
| `flows/tokens.json` | OAuth Pokemon (`ory_at_` / `ory_rt_`) |

Stop :

```bash
./scripts/listen.sh off
```

Env : `PLACARR_MITM_MODE=all|games`, `PLACARR_MITM_DUMP_BODIES=0|1`,
`PLACARR_MITM_NOISE=1` (inclure gstatic/Google noise).
---

## 4. Fichiers scratch

| Path | Rôle |
|---|---|
| `scripts/klarna_sniff.sh` | Klarna + Frida unpin keep-alive → `app-api` |
| `scripts/klarna_unpin.js` | OkHttp / TrustManager ciblés Klarna |
| `scripts/audit_app.sh` | **Audit générique** (`--undylist`, `--unpin`) |
| `scripts/pokemon_sniff.sh` | Pokemon sans Frida |
| `scripts/ssl_unpin.js` + `htk-*.js` | Unpin générique |
| `scripts/mitm_addon.py` | Capture → jsonl + bodies + OAuth |
| `scripts/listen.sh` | Arme / coupe mitm + proxy |
| `scripts/tail_flows.sh` | Lecture live / filtre |
| `scripts/start_frida_server.sh` | Push + run `fs-placarr` |
| `scripts/start_mitm.sh` / `proxy.sh` / `status.sh` | mitm / proxy / health |
| `scripts/attach_unpin.sh` | attach Frida |
| `scripts/install_*_ca.sh` | User CA / Magisk system CA |
| `bin/frida-server` | Binaire arm64 |
| `flows/` | Captures + tokens (ne pas committer) |

> Tout ce dossier scratch est **hors git** (ni Placarr ni Pockett).  
> Loyalty Klarna côté app → repo **Pockett** (`docs/handoff-klarna-pockett.md`).

---

## 5. Lien Placarr

| Placarr | Usage |
|---|---|
| `docs/pokemon_live_rainier.md` | Auth / commerce Rainier |
| `docs/archive/handoff-live-owned-craft.md` | Owned + craft (archivé) |
| `docs/archive/handoff-live-frida-nav.md` | Nav uGUI Card-Dex (autre sujet) |
| `src/providers/pokemon/live/pipeline/syncLiveOwned.ts` | Attend tokens sous `.tmp-foil-audit/…/tokens.json` |
| Foil playroom Live button | Nav Frida (`~/.cache/placarr-frida-ugui`) — **couper mitm proxy** pendant la nav UI |

Pour sync owned après sniff OAuth (**pas** de script `pnpm foil:pokemon:*` — retiré) :

```bash
mkdir -p .tmp-foil-audit/live-unity/mitm
cp ~/.cache/placarr-device-mitm/flows/tokens.json .tmp-foil-audit/live-unity/mitm/tokens.json
pnpm exec tsx src/providers/pokemon/live/pipeline/syncLiveOwned.ts
```

---

## 6. Checklist reprise (autre chat)

1. `adb devices` → téléphone Magisk OK  
2. `./scripts/status.sh` → Magisk CA `SYSTEM_CA_OK`  
3. `./scripts/listen.sh on` (proxy Wi‑Fi → Mac:8080)  
4. **Pokémon Live** : `./scripts/pokemon_sniff.sh` — **pas** Frida (anti-tamper). Naviguer titre → home → Card Dex / collection pour forcer commerce.  
5. **Lorcana** : CA seul suffit en général ; `./scripts/audit_app.sh com.ravensburger.disney.lorcana` puis ouvrir collection / shop dans le jeu.  
6. Vérifier `flows/tokens.json` (OAuth Pokemon) + lignes `studio-prod` / `api.lorcana` dans `http_log.jsonl`  
7. Si 0 hit API : proxy pas pris / app en cellulaire / écran titre sans réseau — forcer navigation UI ; IP Wi‑Fi = LAN du Mac  
8. Fin de session : `./scripts/listen.sh off` (ne pas laisser le proxy armé hors sniff)

---

## 7. Limites

- Unpin « universel » : peut manquer un custom verify Unity — étendre `ssl_unpin.js` si besoin (hooks libs `libil2cpp` / `libunity`).
- Proxy global Android ne couvre pas forcément tout le trafic ; unpin + CA system aident.
- Ne pas laisser `http_proxy` armé pour le gameplay hors sniff (casse le réseau si mitm down).
- Après reboot téléphone : relancer `start_frida_server.sh` (frida-server ne survit pas).
