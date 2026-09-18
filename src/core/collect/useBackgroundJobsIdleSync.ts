import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getBackgroundJobs } from "@/lib/api/backgroundJobs";
import { backgroundJobsRefetchInterval } from "@/core/collect/enrichment";
import { clearFinishedMetadataRefreshStamps } from "@/core/collect/queryCache";

/**
 * Polls background metadata jobs and refreshes open collection views once all
 * jobs finish. Idle polls are sparse; starting a refresh still invalidates.
 */
export function useBackgroundJobsIdleSync(enabled: boolean) {
  const queryClient = useQueryClient();
  const previousCountRef = useRef(0);

  const { data } = useQuery({
    queryKey: ["backgroundJobs"],
    queryFn: getBackgroundJobs,
    enabled,
    refetchInterval: enabled ? backgroundJobsRefetchInterval : false,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!data) return;

    const activeIds = new Set(data.jobs.map((job) => job.id));
    // Drop optimistic “Récupération” stamps once the server no longer lists the
    // item as refreshing (DB flag cleared) — otherwise preserveActive* can keep
    // the badge/toast stuck until the 15‑minute max window.
    clearFinishedMetadataRefreshStamps(queryClient, activeIds);

    const count = data.count ?? 0;
    if (previousCountRef.current > 0 && count === 0) {
      void queryClient.invalidateQueries({ queryKey: ["shelf"] });
      void queryClient.invalidateQueries({ queryKey: ["shelves"] });
      void queryClient.invalidateQueries({ queryKey: ["collectionItems"] });
      void queryClient.invalidateQueries({ queryKey: ["searchItems"] });
      void queryClient.invalidateQueries({ queryKey: ["item"] });
    }
    previousCountRef.current = count;
  }, [data, queryClient]);
}
