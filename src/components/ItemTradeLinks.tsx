"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Link2, Unlink, ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getItemTrades,
  getItems,
  linkItemTrade,
  unlinkItemTrade,
} from "@/lib/api/items";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { itemPath } from "@/lib/routing/slugs";
import { cn } from "@/lib/shared/utils";

type Props = {
  itemId: string;
  shelfId: string;
  /** When false, hide link/unlink controls. */
  canEdit?: boolean;
  className?: string;
};

export function ItemTradeLinks({
  itemId,
  shelfId,
  canEdit = true,
  className,
}: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);

  const tradesQuery = useQuery({
    queryKey: ["itemTrades", shelfId, itemId],
    queryFn: () => getItemTrades(itemId, shelfId),
    enabled: Boolean(itemId),
  });

  const searchQuery = useQuery({
    queryKey: ["itemTradeSearch", query],
    queryFn: () => getItems(query.trim() || null, null),
    enabled: picking && query.trim().length >= 2,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["itemTrades", shelfId, itemId],
    });
  };

  const linkMutation = useMutation({
    mutationFn: (counterpartItemId: string) =>
      linkItemTrade(itemId, { counterpartItemId }, shelfId),
    onSuccess: () => {
      toast.success(t("items.trade.linked"));
      setPicking(false);
      setQuery("");
      invalidate();
    },
    onError: () => toast.error(t("items.trade.linkFailed")),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) =>
      unlinkItemTrade(itemId, { linkId }, shelfId),
    onSuccess: () => {
      toast.success(t("items.trade.unlinked"));
      invalidate();
    },
    onError: () => toast.error(t("items.trade.unlinkFailed")),
  });

  const links = tradesQuery.data?.links ?? [];
  const candidates = useMemo(() => {
    const rows = searchQuery.data ?? [];
    return rows
      .filter((row) => row.id && row.id !== itemId)
      .slice(0, 8);
  }, [searchQuery.data, itemId]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-zinc-50/40 dark:bg-zinc-950/20 p-3 sm:p-4 flex flex-col gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="size-4 text-muted-foreground" />
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {t("items.trade.title")}
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug -mt-1">
        {t("items.trade.hint")}
      </p>

      {tradesQuery.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("items.trade.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {links.map((link) => {
            const href = link.counterpart.shelfId
              ? itemPath(
                  { id: link.counterpart.shelfId },
                  {
                    id: link.counterpart.id,
                    slug: link.counterpart.slug,
                    name: link.counterpart.name,
                  },
                )
              : null;
            return (
              <li
                key={link.id}
                className="flex items-center gap-2 justify-between rounded-lg border border-border/50 bg-background/60 px-2.5 py-2"
              >
                <div className="min-w-0">
                  {href ? (
                    <Link
                      href={href}
                      className="text-sm font-semibold text-foreground hover:underline truncate block"
                    >
                      {t("items.trade.against", {
                        name: link.counterpart.name,
                      })}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold truncate">
                      {t("items.trade.against", {
                        name: link.counterpart.name,
                      })}
                    </p>
                  )}
                  {link.note ? (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {link.note}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    disabled={unlinkMutation.isPending}
                    aria-label={t("items.trade.unlink")}
                    onClick={() => unlinkMutation.mutate(link.id)}
                  >
                    <Unlink className="size-4" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        picking ? (
          <div className="flex flex-col gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("items.trade.searchPlaceholder")}
              className="rounded-xl h-10"
              autoFocus
            />
            {searchQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
            {candidates.length > 0 ? (
              <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {candidates.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-2.5 py-2 text-sm hover:bg-accent transition-colors"
                      disabled={linkMutation.isPending}
                      onClick={() => {
                        if (row.id) linkMutation.mutate(row.id);
                      }}
                    >
                      <span className="font-medium">{row.name}</span>
                      {row.shelf &&
                      typeof row.shelf === "object" &&
                      "name" in row.shelf ? (
                        <span className="text-muted-foreground text-xs ml-2">
                          {(row.shelf as { name?: string }).name}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim().length >= 2 && !searchQuery.isFetching ? (
              <p className="text-xs text-muted-foreground">
                {t("items.trade.noResults")}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => {
                setPicking(false);
                setQuery("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 self-start"
            onClick={() => setPicking(true)}
          >
            <Link2 className="size-4" />
            {t("items.trade.linkAction")}
          </Button>
        )
      ) : null}
    </div>
  );
}
