/**
 * Fabrique `ensureClient` (ADR-026) pour les packs dont le client est un APK
 * Android du store : sonde `versionCode`, télécharge seulement si plus récent,
 * dépose les APK dans `data/<pack>/staging/apks/` (`apkStoreFetch`).
 */
import type {
  ProviderClientOpts,
  ProviderClientOutcome,
} from "@/types/providerModule";

export function apkStoreClient(
  packId: string,
): (opts?: ProviderClientOpts) => Promise<ProviderClientOutcome> {
  return async (opts = {}) => {
    const { fetchStoreApksForPack } = await import(
      /* webpackIgnore: true */
      "@/lib/admin/apkStoreFetch"
    );
    const result = await fetchStoreApksForPack(packId, {
      force: opts.force,
      signal: opts.signal,
      onLog: opts.onLog,
    });
    if (result.status === "unavailable") return result;
    return { status: result.status, version: String(result.versionCode) };
  };
}
