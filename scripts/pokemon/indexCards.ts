#!/usr/bin/env tsx
/**
 * CLI shim — logic lives in `@/providers/pokemontcglive/indexCards`.
 *
 *   tsx scripts/pokemon/indexCards.ts
 */
import { main } from "@/providers/pokemontcglive/indexCards";

process.exit(main());
