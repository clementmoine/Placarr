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
import { itemPath } from "@/lib/routing/slugs";
import { cn } from "@/lib/core/utils";

function jobKindLabel(
  job: BackgroundJob,
  t: (key: string) => string,
): string {
  return job.kind === "metadataRefresh"
    ? t("backgroundJobs.kindRefresh")
    : t("backgroundJobs.kindEnrich");
}

export function BackgroundJobsMenu() {
  const { isGuest } = useAccount();
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["backgroundJobs"],
    queryFn: getBackgroundJobs,
    enabled: !isGuest,
    refetchInterval: (query) =>
      (query.state.data?.count ?? 0) > 0 ? 2500 : 10000,
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
  const jobs = data?.jobs ?? [];
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
        {isLoading && jobs.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : jobs.length === 0 ? (
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
              <ShelfTypeIcon
                type={job.shelf.type}
                className="mt-0.5 size-4 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={itemPath(job.shelf, job)}
                  className="block truncate text-sm font-semibold hover:text-primary"
                >
                  {job.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {jobKindLabel(job, t)} · {job.shelf.name}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
