# Identify cartes — index embeddings vs fine-tune CLIP

Doc produit / MLOps pour la reconnaissance visuelle TCG.
**Décision formelle** : [ADR-023](ADR.md#adr-023--croissance-catalogue--ré-embed-pas-retrain).

## TL;DR (une phrase)

Nouvelles cartes = **ré-encoder les faces avec le même modèle** et mettre à
jour l’index (Sync). **Fine-tuner CLIP** = rare, offline, seulement si la
qualité photo→art stagne malgré index complet + OCR + gates.

## Deux objets distincts

| Objet | C’est quoi | Change quand… |
| ----- | ---------- | ------------- |
| **Modèle** (CLIP / ONNX) | Fonction fixe image → vecteur | Rarement (version bump / fine-tune) |
| **Index / galerie** | Liste de vecteurs des faces catalogue | **À chaque set / face nouvelle** |

Identifier une carte = encoder la photo avec le modèle, puis chercher les
voisins dans l’index. Sans entrée dans l’index, la carte est **invisible** —
même avec un modèle parfait. C’est le *cold start au niveau index*, pas un
problème de « modèle pas assez entraîné ».

Industry standard (e-commerce / docs / TCG) :

1. Encoder seulement les **nouveaux** items (ou ceux dont l’art a changé).
2. Append / upsert dans le store (FAISS `add`, HNSW, fichier sidecar Placarr…).
3. **Ne pas** re-entraîner le réseau parce qu’un SKU est arrivé.
4. Après **changement de modèle** : re-encoder **tout** le corpus (anciens
   vecteurs incompatibles). Taguer chaque index avec `modelId` / version.

Réfs. pratiques : incremental CLIP indexes ([The Neural Base](https://theneuralbase.com/clip/learn/advanced/incremental-index-updates/)),
freshness vector DB ([CalibreOS](https://www.calibreos.com/learn/mlsd-embeddings-vector-db)),
Drift-Adapter EMNLP 2025 (migration modèle ≠ ajout de docs).

## Ce que fait Placarr aujourd’hui

Pipeline Sync catalogue (`identifyIndexesStep`) :

1. **Visual index** (dHash / signaux) — `visualIndexStep`
2. **Embedding index** (CLIP) — `embeddingIndexStep`

Fraîcheur embeddings (`embeddingLooksFresh`) :

- même nombre d’entrées que le visual index ;
- mtime embedding ≥ mtime visual → skip ;
- sinon rebuild **incrémental** (réutilise les vecteurs dont
  `printKey+artRel` n’a pas bougé ; n’encode que le delta).

Rattrapage / force rebuild : admin Catalogue → **Indexes caméra**
(pack) ou **CLIP manquant (N)** (tous les packs stale) — `only: ["identify"]`,
force — **pas de CLI**. Le statut corpora affiche `vis / CLIP`.

Query path (caméra Auto) : multi-signaux + hybride dHash/CLIP + soft abstain
cross-game + (scaffold) OCR collector# — principe produit inchangé :
**vide honnête OK, faux positif confiant interdit**.

## Croissance régulière des sets (cas Placarr)

Quand un extract Sync ramène un nouveau set :

| Étape | Automatique ? | Coût |
| ----- | ------------- | ---- |
| Faces sur disque / ledger | Extract / refresh admin | I/O + réseau |
| Visual index | Sync | CPU léger |
| CLIP embeddings des **nouvelles** faces | Sync / **Indexes caméra** | ONNX CPU/GPU — **pas** de training |
| Fine-tune CLIP | **Non** | Dataset + GPU + eval + re-embed **tout** |

Donc : « on aura de nouvelles cartes régulièrement » → **ops d’index**, pas
de retrain. Le produit doit garantir que Sync laisse l’embedding index à jour
(ou affiche clairement « embeddings stale »).

## Quand fine-tuner (et seulement alors)

Fine-tune = adapter le **modèle** au domaine (photo téléphone ↔ art
catalogue, glare, warp, foil). Littérature + prod :

- **Ne pas** fine-tuner parce que le catalogue a grandi (LanceDB guide,
  Neural Base long-term CLIP strategy).
- Fine-tuner si **domaine** sous-représenté vs prétrain, et qu’un eval
  hold-out photo réelle le montre.
- Risque majeur : **catastrophic forgetting** (arXiv Continual Learning for
  CLIP) — un FT naïf casse le zero-shot / d’autres jeux.
- Mercari (10M paires, jours A100) = échelle entreprise ; pour Placarr,
  viser d’abord **augments à l’index** (warp / blur / glare synthétiques sur
  l’art) ou un **adapter** léger (DAC / LoRA) plutôt qu’un full FT.
- Synthétique seul → gap réel/gen (RegFT) : toujours valider sur **photos
  téléphone** tenues à l’écart.

**Déclencheurs Placarr (tous requis avant d’ouvrir un chantier FT)** :

1. Embeddings **complets** sur tous les packs avec faces.
2. OCR collector# branché + shortlist saine.
3. Quad / quality gates stables.
4. Suite golden photo→printKey : plateau clair (ex. recall@1 / rate « sure »
   stagnent ; FP rate déjà sous contrôle).
5. Dataset versionné : paires (photo crop, `printKey`) + hold-out par jeu.
6. Après FT : **rebuild total** des indexes + tag `modelId` ; A/B vs ancien.

Hors ces conditions, FT = coût + risque sans levier produit.

## Marché TCG (lecture)

- **Delver Lens** : modèle compact on-device (~5 MB, 35k+ cartes), sync sets —
  le rythme produit est **mise à jour catalogue / modèle de reco**, pas un
  retrain utilisateur à chaque set. Détail algo propriétaire.
- Scanners open / hobby : souvent **phash / dHash set-lock** ou CLIP gallery —
  même logique « galerie qui grandit ».
- Pas de preuve publique qu’un scanner grand public **ré-entraîne CLIP à
  chaque spoilers set** ; le pattern dominant est **index freshness**.

## Règles opérationnelles Placarr

1. **Default path** : admin Sync → visual → embed. Missing vectors = bug de
   fraîcheur (bouton **Indexes caméra**), pas « besoin de fine-tune ». Pas de
   script `package.json` pour ça.
2. **Versionner** le modèle dans les sidecars embedding (`modelId`). Changer
   de checkpoint = invalidation globale + rebuild.
3. **Incrémental** (évolution souhaitable) : encoder seulement les
   `printKey` absents / art hash changé ; éviter rebuild O(N) à chaque Sync
   quand N devient gros.
4. **Monitor** : distribution des scores top1/margin, taux abstain, FP
   reportés — seuil avant d’envisager FT.
5. **Jamais** auto-accept confiant ; FT n’autorise pas à baisser la barre
   sure≠FP.

## Liens code

- `src/providers/shared/cardCatalogue/identifyIndexesStep.ts`
- `src/providers/shared/cardCatalogue/embeddingIndexStep.ts`
- `src/core/identify/cardEmbeddingIndex.ts`
- `src/core/identify/cardVisualIndex.ts`
- Caméra : `UnifiedScanCapture`, `scanAccept`, soft abstain hybrid

## Sources (sélection)

- The Neural Base — Incremental index updates ; When to fine-tune CLIP ;
  Long-term CLIP strategy
- LanceDB — Practical guide to fine-tuning embedding models
- CalibreOS — Embeddings & vector DBs (freshness, HNSW add)
- Drift-Adapter (EMNLP 2025) — upgrades de modèle ≠ inserts
- Continual Learning for CLIP (arXiv 2207.09248) — forgetting
- Mercari Engineering — fine-tuned CLIP at marketplace scale
- OpenAI CLIP paper — retrieval = gallery + frozen encoders
