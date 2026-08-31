/**
 * Naruto 疾風伝 pack extract — Catalogue Sync / worker (in-process).
 */
import { refreshNarutoShippudenCatalog } from "./pipeline";

export async function runNarutoShippudenPackPipeline(): Promise<void> {
  await refreshNarutoShippudenCatalog();
}

