# Docs Placarr — index

| Doc | Rôle | Statut |
|-----|------|--------|
| [core_architecture.md](core_architecture.md) | 5 piliers, DRY, où mettre du code | **Vivant** |
| [codebase_map.md](codebase_map.md) | Où aller selon le bug | **Vivant** |
| [provider_external_links.md](provider_external_links.md) | Politique liens + URL-first prix | **Vivant** |
| [provider_integration_checklist.md](provider_integration_checklist.md) | Ajouter un provider | **Vivant** |
| [backlog.md](backlog.md) | Journal + **ouverts** en tête | Mixte (voir § Ouverts) |
| [metadata_engine_audit.md](metadata_engine_audit.md) | Audit accept→purge / SSOT / séquence chantier | **Vivant** (file active) |
| [../TESTING.md](../TESTING.md) | Comment tester | **Vivant** |

## Historique / audit (ne pas traiter comme TODO)

Ces docs ont un bandeau STATUS : migration ou chantier **terminé**. Gardés pour le
rationale, pas comme file active.

| Doc | Note |
|-----|------|
| [hardcoding_audit.md](hardcoding_audit.md) | Blindness allowlist vide — COMPLETE |
| [provider_agnostic_architecture.md](provider_agnostic_architecture.md) | Design + historique ; ranking supersédé |
| [unbiased_ranking.md](unbiased_ranking.md) | Principes vivants ; tableaux « current state » datés |
| [word_list_audit.md](word_list_audit.md) | Inventaire ; cibles IDF encore ouvertes (long terme) |
| [debias_attachment_display_score.md](debias_attachment_display_score.md) | Spec exécutée — DONE |
| [barcode_consensus_refactor.md](barcode_consensus_refactor.md) | Handoff consensus titre — fait |
| [audit_fonctionnement.md](audit_fonctionnement.md) | Snapshot 2026-07-04 — chemins obsolètes |

## Ouverts réels (2026-07-24)

Détail findings + séquence : [metadata_engine_audit.md](metadata_engine_audit.md).
File courte : [backlog.md § Ouverts](backlog.md#ouverts--base-clean-2026-07-24).

1. **SSOT identité / covers / liens** (accept→purge) — chantier produit suivant
2. Découpage god files (`storage` / `fetch`) — faible priorité, après SSOT
3. Word-lists → IDF / consensus — long terme ([word_list_audit.md](word_list_audit.md))
4. Optionnel : table GS1 audio ; mesure perf LaunchBox local
