import axios from "axios";
import type { QueryClient } from "@tanstack/react-query";

import type { CatalogueExtractTarget } from "@/lib/admin/cataloguePacks";

export type BackgroundJob = {
  id: string;
  name: string;
  slug: string | null;
  kind:
    | "metadataRefresh"
    | "metadataEnrich"
    | "priceRefresh"
    | "foilExtract"
    | "apkStoreFetch"
    | "icollectCatalogSync"
    | "launchboxIndexSync"
    | "nointroIndexSync"
    | "catalogProviderSync";
  startedAt: string;
  cancellable: boolean;
  foilTarget?: CatalogueExtractTarget | null;
  /** Most-scoped destination (item page or Catalogue pack/corpus). */
  href?: string | null;
  /** Soft-refresh fan-out count after catalogue Sync (`printKey` propagate). */
  propagatedItemCount?: number;
  /** Brief post-completion Sync row so admin can read « propagé N ». */
  done?: boolean;
  shelf: {
    id: string;
    name: string;
    slug: string | null;
    type: string;
  } | null;
};

export type BackgroundJobsPayload = {
  count: number;
  jobs: BackgroundJob[];
};

export async function getBackgroundJobs(): Promise<BackgroundJobsPayload> {
  try {
    const { data } = await axios.get<BackgroundJobsPayload>(
      "/api/background-jobs",
      { validateStatus: (status) => status < 500 },
    );
    if (!data || !Array.isArray(data.jobs)) {
      return { jobs: [], count: 0 };
    }
    return data;
  } catch {
    return { jobs: [], count: 0 };
  }
}

export async function cancelBackgroundJob(itemId: string): Promise<void> {
  await axios.delete(`/api/background-jobs/${itemId}`);
}

export async function cancelAllBackgroundJobs(): Promise<number> {
  const { data } = await axios.delete("/api/background-jobs");
  return data.cancelled ?? 0;
}

/** Optimistic header list update when a refresh/enrich is accepted. */
export function upsertBackgroundJobInCache(
  queryClient: QueryClient,
  job: BackgroundJob,
): void {
  queryClient.setQueryData<BackgroundJobsPayload>(
    ["backgroundJobs"],
    (current) => {
      const jobs = current?.jobs ?? [];
      const existingIndex = jobs.findIndex((entry) => entry.id === job.id);
      const nextJobs =
        existingIndex >= 0
          ? jobs.map((entry, index) =>
              index === existingIndex ? { ...entry, ...job } : entry,
            )
          : [job, ...jobs];
      return { count: nextJobs.length, jobs: nextJobs };
    },
  );
}

/**
 * Lignes du menu « Activité en arrière-plan » : tout ce qui tourne, plus les
 * Sync catalogue terminées **seulement** si elles ont mis à jour des objets
 * de l'étagère (leurs rafraîchissements suivent ensuite, ligne par objet).
 * Une Sync terminée à 0 objet n'est pas une activité à signaler.
 */
export function backgroundJobsForMenu(
  jobs: readonly BackgroundJob[],
): BackgroundJob[] {
  return jobs.filter((job) => !job.done || (job.propagatedItemCount ?? 0) > 0);
}
