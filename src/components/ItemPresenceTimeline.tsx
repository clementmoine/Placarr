"use client";

import { useQuery } from "@tanstack/react-query";

import {
  presenceEventChildCount,
  presenceEventKindLabelKey,
  presenceEventReasonLabelKey,
} from "@/core/collect/presenceTimeline";
import { getItemEvents } from "@/lib/api/items";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

type Props = {
  itemId: string;
  shelfId?: string | null;
  /** Cap listed events (most recent first). */
  maxEvents?: number;
  /** Tighter spacing for ItemModal under the absence block. */
  compact?: boolean;
};

export function ItemPresenceTimeline({
  itemId,
  shelfId,
  maxEvents,
  compact = false,
}: Props) {
  const { t, locale } = useLocale();
  const { data, isLoading } = useQuery({
    queryKey: ["item-events", itemId, shelfId ?? null],
    queryFn: () => getItemEvents(itemId, { shelfId }),
    enabled: Boolean(itemId),
    staleTime: 30_000,
  });

  const events = (data?.events ?? []).slice(
    0,
    maxEvents && maxEvents > 0 ? maxEvents : undefined,
  );
  if (isLoading && events.length === 0) return null;
  if (!isLoading && events.length === 0) return null;

  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    dateStyle: compact ? "short" : "medium",
    timeStyle: compact ? undefined : "short",
  });

  return (
    <section
      className={compact ? "mt-3 space-y-2" : "mt-6 space-y-3"}
      aria-label={t("items.timeline.title")}
    >
      <h2
        className={
          compact
            ? "text-xs font-bold uppercase tracking-wide text-muted-foreground"
            : "text-sm font-bold tracking-tight text-foreground"
        }
      >
        {t("items.timeline.title")}
      </h2>
      <ol
        className={
          compact
            ? "space-y-1.5 border-l border-border/70 pl-2.5"
            : "space-y-2 border-l border-border pl-3"
        }
      >
        {events.map((event) => {
          const kindKey = presenceEventKindLabelKey(event.kind);
          const reasonKey = presenceEventReasonLabelKey(event.reason);
          const childCount = presenceEventChildCount(event.snapshot);
          return (
            <li key={event.id} className="relative text-sm">
              <span
                className="absolute -left-[0.91rem] top-1.5 size-1.5 rounded-full bg-muted-foreground/60"
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-semibold text-foreground">
                  {t(kindKey)}
                </span>
                {reasonKey ? (
                  <span className="text-muted-foreground">{t(reasonKey)}</span>
                ) : null}
                {childCount != null && childCount > 0 ? (
                  <span className="text-muted-foreground">
                    {t("items.timeline.children", { count: childCount })}
                  </span>
                ) : null}
                <time
                  className="ml-auto text-xs text-muted-foreground"
                  dateTime={event.at}
                >
                  {dateFmt.format(new Date(event.at))}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
