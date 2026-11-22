---
name: write-adr
description: Record an architecture decision in docs/ADR.md, or check existing ADRs before a structural refactor. Use when a change alters a cross-cutting rule (provider contract, data layout, job queue, identity model, network layer, catalogue Sync), when the user makes a design decision worth keeping, or before reversing a past decision.
---

# Architecture Decision Records

File: `docs/ADR.md` (French, like the rest of the docs). Read the existing ADRs touching the area **before** refactoring — many apparent oddities are deliberate (e.g. ADR-004 no mega card-pack factory, ADR-005 accepted foil duplication, ADR-006 `data/` vs `curated/`, ADR-008 locked network layer).

## Rules

- Append a new `## ADR-0NN : <titre>` with the next number. Never rewrite an accepted ADR; to reverse one, add a new ADR that supersedes it and set the old one's status to `Remplacé par ADR-0NN`.
- Record the decision and **why**, not the implementation diary.
- Update the docs index (`docs/README.md`) only if a new living doc is created alongside.

## Template

```markdown
## ADR-0NN : <décision en une ligne>

- **Date** : YYYY-MM-DD
- **Statut** : Proposé | Accepté | Accepté, en production | Remplacé par ADR-0NN
- **Contexte** : le problème, mesuré si possible (chiffres, fichiers).
- **Décision** : ce qu'on fait, en règles vérifiables.
- **Conséquences** : ce que ça impose / rend plus facile ou plus dur ; gardes ou tests qui l'encodent.
- **Alternatives écartées** : options considérées et pourquoi non.
```

When a decision is enforced by a test or lint rule, name it in **Conséquences** so the next reader finds the guard.
