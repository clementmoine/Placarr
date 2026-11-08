"use client";

import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import {
  cancelAllBackgroundJobs,
  cancelBackgroundJob,
  getBackgroundJobs,
  type BackgroundJob,
} from "@/lib/api/backgroundJobs";
import { useAccount } from "@/lib/client/hooks/useAccount";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { backgroundJobsRefetchInterval } from "@/core/collect/enrichment";
import { itemPath } from "@/lib/routing/slugs";
import { cn } from "@/lib/shared/utils";

function jobKindLabel(job: BackgroundJob, t: (key: string) => string): string {
  if (job.kind === "metadataRefresh") return t("backgroundJobs.kindRefresh");
  if (job.kind === "priceRefresh") return t("backgroundJobs.kindPrice");
  if (job.kind === "foilExtract") return t("backgroundJobs.kindFoil");
  if (job.kind === "apkStoreFetch") return t("backgroundJobs.kindApkStore");
  if (job.kind === "icollectCatalogSync")
    return t("backgroundJobs.kindCatalog");
  if (job.kind === "launchboxIndexSync")
    return t("backgroundJobs.kindLaunchbox");
  if (job.kind === "nointroIndexSync") return t("backgroundJobs.kindNointro");
  if (job.kind === "catalogProviderSync")
    return t("backgroundJobs.kindProviderSync");
  return t("backgroundJobs.kindEnrich");
}

/** Foil / APK lab work — subtitle points at the admin render tab. */
function isFoilAdminJob(job: BackgroundJob): boolean {
  return job.kind === "foilExtract" || job.kind === "apkStoreFetch";
}

function jobSubtitle(job: BackgroundJob, t: (key: string) => string): string {
  const kind = jobKindLabel(job, t);
  if (job.shelf) return `${kind} · ${job.shelf.name}`;
  if (isFoilAdminJob(job)) return `${kind} · ${t("backgroundJobs.foilAdmin")}`;
  if (
    job.kind === "catalogProviderSync" &&
    typeof job.propagatedItemCount === "number"
  ) {
    const propagated = t("backgroundJobs.propagated").replace(
      "{count}",
      String(job.propagatedItemCount),
    );
    return job.done ? propagated : `${kind} · ${propagated}`;
  }
  return kind;
}

/** Prefer server deep-link; fall back for older payloads / item jobs. */
function jobHref(job: BackgroundJob): string | null {
  if (job.href) return job.href;
  if (job.shelf) return itemPath(job.shelf, job);
  return null;
}

export function BackgroundJobsMenu() {
  const { isGuest } = useAccount();
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["backgroundJobs"],
    queryFn: getBackgroundJobs,
    enabled: !isGuest,
    // Busy → 5s; idle → 45s (mutations still invalidate for snappy start).
    refetchInterval: !isGuest ? backgroundJobsRefetchInterval : false,
    refetchIntervalInBackground: true,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["backgroundJobs"] });
    void queryClient.invalidateQueries({ queryKey: ["shelf"] });
    void queryClient.invalidateQueries({ queryKey: ["shelves"] });
    void queryClient.invalidateQueries({ queryKey: ["searchItems"] });
  };

  const cancelOne = useMutation({
    mutationFn: cancelBackgroundJob,
    onSuccess: () => {
      invalidate();
      toast.success(t("backgroundJobs.cancelledOne"));
    },
    onError: () => toast.error(t("backgroundJobs.cancelFailed")),
  });

  const cancelAll = useMutation({
    mutationFn: cancelAllBackgroundJobs,
    onSuccess: (count) => {
      invalidate();
      toast.success(
        count > 0
          ? t("backgroundJobs.cancelledAll").replace("{count}", String(count))
          : t("backgroundJobs.nothingToCancel"),
      );
    },
    onError: () => toast.error(t("backgroundJobs.cancelFailed")),
  });

  if (isGuest) return null;

  const jobs = data?.jobs ?? [];
  const activeCount = jobs.filter((job) => !job.done).length;
  const hasDoneOnly = activeCount === 0 && jobs.some((job) => job.done);
  const isBusy =
    activeCount > 0 || cancelAll.isPending || cancelOne.isPending;
  const visible = isBusy || hasDoneOnly;

  if (!visible) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative size-9 rounded-full",
            (isBusy || hasDoneOnly) && "text-primary",
          )}
          aria-label={t("backgroundJobs.title")}
        >
          <Loader2
            className={cn("size-4", isBusy && "animate-spin")}
            aria-hidden
          />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeCount > 9 ? "9+" : activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("backgroundJobs.title")}</span>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs font-semibold"
              disabled={cancelAll.isPending}
              onClick={() => cancelAll.mutate()}
            >
              {t("backgroundJobs.cancelAll")}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading && jobs.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            {t("backgroundJobs.empty")}
          </div>
        ) : (
          jobs.map((job) => {
            const href = jobHref(job);
            return (
              <DropdownMenuItem
                key={job.id}
                className="flex items-start gap-2 p-2 focus:bg-accent"
                onSelect={(event) => event.preventDefault()}
              >
                {job.shelf ? (
                  <ShelfTypeIcon
                    type={job.shelf.type}
                    className="mt-0.5 size-4 shrink-0"
                  />
                ) : job.done ? (
                  <span
                    className="mt-0.5 size-4 shrink-0 rounded-full bg-primary/20"
                    aria-hidden
                  />
                ) : (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
                )}
                <div className="min-w-0 flex-1">
                  {href ? (
                    <Link
                      href={href}
                      className="block truncate text-sm font-semibold hover:text-primary"
                    >
                      {job.name}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold">{job.name}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {jobSubtitle(job, t)}
                  </p>
                </div>
                {job.cancellable ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={t("backgroundJobs.cancelOne")}
                    disabled={cancelOne.isPending}
                    onClick={() => cancelOne.mutate(job.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
