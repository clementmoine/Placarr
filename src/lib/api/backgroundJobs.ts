import axios from "axios";
import type { QueryClient } from "@tanstack/react-query";

export type BackgroundJob = {
  id: string;
  name: string;
  slug: string;
  kind: "metadataRefresh" | "metadataEnrich" | "priceRefresh";
  startedAt: string;
  cancellable: boolean;
  shelf: {
    id: string;
    name: string;
    slug: string;
    type: string;
  };
};

export type BackgroundJobsPayload = {
  count: number;
  jobs: BackgroundJob[];
};

export async function getBackgroundJobs(): Promise<BackgroundJobsPayload> {
  const { data } = await axios.get("/api/background-jobs");
  return data;
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
