#!/usr/bin/env tsx
/** `pnpm foil:pokemon:rebuild-cards-index` */
import { rebuildPokemonCardsIndex } from "./rebuildCardsIndex";

const result = rebuildPokemonCardsIndex();
if (result.skipped) {
  console.warn("cards-index: skipped — no data/pokemon/cards yet");
  process.exitCode = 0;
} else {
  console.log(`cards-index: ${result.cards} stems → ${result.path}`);
}
