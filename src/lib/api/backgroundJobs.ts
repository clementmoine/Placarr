import axios from "axios";

export type BackgroundJob = {
  id: string;
  name: string;
  slug: string;
  kind: "metadataRefresh" | "metadataEnrich";
  startedAt: string;
  cancellable: boolean;
  shelf: {
    id: string;
    name: string;
    slug: string;
    type: string;
  };
};

export async function getBackgroundJobs(): Promise<{
  count: number;
  jobs: BackgroundJob[];
}> {
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
