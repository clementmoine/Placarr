/**
 * Étape commune « client du jeu » (ADR-026) : avant une Sync catalogue ou une
 * Extract, demande au module du pack de poser son client (APK du store,
 * client CDN…). Le core ne sait pas d'où il vient — le crochet
 * `catalog.ensureClient` le déclare. Un pack sans crochet : rien.
 */
import { discoverCatalogProviderModules } from "@/core/catalog/catalog";
import type {
  ProviderClientOpts,
  ProviderClientOutcome,
} from "@/types/providerModule";

export async function ensurePackClient(
  dataPack: string | null | undefined,
  opts: ProviderClientOpts = {},
): Promise<ProviderClientOutcome> {
  if (!dataPack) return { status: "skipped" };
  const mdl = discoverCatalogProviderModules().find(
    (row) => row.catalog?.dataPack === dataPack && row.catalog.ensureClient,
  );
  const ensureClient = mdl?.catalog?.ensureClient;
  if (!ensureClient) return { status: "skipped" };
  opts.onLog?.(`── client du jeu ${dataPack}`);
  try {
    const outcome = await ensureClient(opts);
    opts.onLog?.(
      outcome.status === "unavailable"
        ? `client indisponible : ${outcome.reason}`
        : outcome.status === "skipped"
          ? "client : rien à faire"
          : `client ${outcome.status === "updated" ? "mis à jour" : "à jour"} (version ${outcome.version})`,
    );
    return outcome;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    opts.onLog?.(`client indisponible : ${reason}`);
    return { status: "unavailable", reason };
  }
}
