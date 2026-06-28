import { decode as decodeHTMLEntities } from "html-entities";

import { cleanSearchQuery } from "@/lib/search/query";
import { getMetadataProviderAdapter } from "@/services/provider/bootstrap";
import {
  getProviderModule,
  nameDatabaseProviderForType,
} from "@/services/provider/registry";

export async function confrontWithDatabase(
  name: string,
  type?: string | null,
): Promise<string | null> {
  if (!name || !type) return null;
  const cleanedName = cleanSearchQuery(name);
  if (!cleanedName) return null;

  const provider = nameDatabaseProviderForType(type);
  if (!provider) return null;

  try {
    const adapter = getMetadataProviderAdapter(provider.id);
    const result = await adapter?.resolve({ name: cleanedName });
    return result?.title ?? null;
  } catch (error) {
    console.warn(`[ConfrontWithDatabase] Error for "${name}" (${type}):`, error);
    return null;
  }
}

export async function getDatabaseSuggestions(
  name: string,
  type?: string | null,
  platform?: string | null,
): Promise<string[]> {
  if (!name || !type) return [];
  const cleanedName = cleanSearchQuery(name);
  if (!cleanedName) return [];

  const provider = nameDatabaseProviderForType(type);
  if (!provider) return [];

  const module = getProviderModule(provider.id);
  if (!module?.suggestDatabaseTitles) return [];

  try {
    const list = await module.suggestDatabaseTitles({
      name,
      cleanedName,
      platform,
    });
    return list.map((item) => decodeHTMLEntities(item));
  } catch (error) {
    console.warn(`[getDatabaseSuggestions] Error for "${name}" (${type}):`, error);
  }
  return [];
}
