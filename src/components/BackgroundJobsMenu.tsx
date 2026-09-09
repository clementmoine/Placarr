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

/**
 * Catalogue crawls the collector never asked for by name.
 *
 * iCollect, LaunchBox, No-Intro and « Tout rafraîchir » (`catalogProviderSync`)
 * keep provider data fresh; listing each crawl as its own row is plumbing noise.
 * They collapse into one “provider data” row in the menu.
 */
const PROVIDER_DATA_KINDS = new Set([
  "icollectCatalogSync",
  "launchboxIndexSync",
  "nointroIndexSync",
  "catalogProviderSync",
]);

function isProviderDataJob(job: BackgroundJob): boolean {
  return PROVIDER_DATA_KINDS.has(job.kind);
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

  const count = data?.count ?? 0;
  const allJobs = data?.jobs ?? [];
  const jobs = allJobs.filter((job) => !isProviderDataJob(job));
  const providerDataJobs = allJobs.filter(isProviderDataJob);
  const isBusy = count > 0 || cancelAll.isPending || cancelOne.isPending;

  if (!isBusy) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative size-9 rounded-full",
            isBusy && "text-primary",
          )}
          aria-label={t("backgroundJobs.title")}
        >
          <Loader2
            className={cn("size-4", isBusy && "animate-spin")}
            aria-hidden
          />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("backgroundJobs.title")}</span>
          {count > 0 && (
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
        {isLoading && allJobs.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : allJobs.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            {t("backgroundJobs.empty")}
          </div>
        ) : (
          jobs.map((job) => (
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
              ) : (
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
              )}
              <div className="min-w-0 flex-1">
                {job.shelf ? (
                  <Link
                    href={itemPath(job.shelf, job)}
                    className="block truncate text-sm font-semibold hover:text-primary"
                  >
                    {job.name}
                  </Link>
                ) : (
                  <Link
                    href="/admin?tab=catalogue"
                    className="block truncate text-sm font-semibold hover:text-primary"
                  >
                    {job.name}
                  </Link>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {jobKindLabel(job, t)}
                  {job.shelf
                    ? ` · ${job.shelf.name}`
                    : ` · ${t("backgroundJobs.foilAdmin")}`}
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
          ))
        )}
        {providerDataJobs.length > 0 && (
          /*
            One row for the lot, and deliberately not a link: there is nothing
            here the collector has to act on, and the previous per-crawl rows
            pointed at an admin tab none of them belongs to.
          */
          <DropdownMenuItem
            className="flex items-start gap-2 p-2 focus:bg-accent"
            onSelect={(event) => event.preventDefault()}
          >
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {t("backgroundJobs.providerData")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t("backgroundJobs.providerDataHint").replace(
                  "{count}",
                  String(providerDataJobs.length),
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={t("backgroundJobs.cancelOne")}
              disabled={cancelOne.isPending}
              onClick={() => {
                for (const job of providerDataJobs) cancelOne.mutate(job.id);
              }}
            >
              <X className="size-3.5" />
            </Button>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
