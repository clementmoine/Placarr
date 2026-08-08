#!/usr/bin/env tsx
/**
 * CLI shim — logic lives in `@/providers/pokemontcglive/cdn`.
 *
 *   tsx scripts/pokemon/cdn.ts scrape --names xy8_fr_012
 */
import { main } from "@/providers/pokemontcglive/cdn";

main().then((code) => process.exit(code));
