"use client";

import { Loader2 } from "lucide-react";

import { BaseModal } from "@/components/modals/BaseModal";
import { Button } from "@/components/ui/button";
import {
  formatAbsenceBadge,
  isAwaitingReceiptReason,
} from "@/core/collect/itemAbsence";
import type {
  ReceivablePair,
  ReceivableShelfItem,
} from "@/core/collect/receivableMatches";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

export type AwaitedReceiptPair = ReceivablePair;

function pairVerb(
  item: ReceivableShelfItem,
  t: (key: string) => string,
): string {
  if (isAwaitingReceiptReason(item.absenceReason)) {
    return t("items.printPicker.awaitedKindOrdered");
  }
  if (item.presence === "wanted") {
    return t("items.printPicker.awaitedKindWanted");
  }
  return t("items.printPicker.awaitedKindAway");
}

function pairDetailLine(
  item: ReceivableShelfItem,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const badge = formatAbsenceBadge(item);
  const reasonKey = item.absenceReason
    ? `items.timeline.reason.${item.absenceReason}`
    : null;
  const label = badge
    ? t(`items.absence.badge.${badge.labelKey}`, {
        ...(badge.name ? { name: badge.name } : {}),
        ...(badge.detail ? { detail: badge.detail } : {}),
      })
    : item.presence === "wanted"
      ? t("items.absence.presences.wanted")
      : t("items.absence.presences.away");
  const verb = pairVerb(item, t);
  return [verb, reasonKey ? t(reasonKey) : null, label]
    .filter(Boolean)
    .join(" · ");
}

/**
 * « Tu l’attendais ? » — shared by PrintPicker, ItemModal create, scan flows.
 */
export function AwaitedReceiptDialog({
  pairs,
  isOpen,
  isReceiving,
  onClose,
  onReceive,
  onAddAsNew,
}: {
  pairs: readonly AwaitedReceiptPair[];
  isOpen: boolean;
  isReceiving?: boolean;
  onClose: () => void;
  onReceive: () => void | Promise<void>;
  onAddAsNew: () => void | Promise<void>;
}) {
  const { t } = useLocale();
  const busy = Boolean(isReceiving);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="md"
      title={t("items.printPicker.awaitedTitle")}
      description={t("items.printPicker.awaitedDescription", {
        count: pairs.length,
      })}
      cancelLabel={t("common.cancel")}
      onCancel={() => {
        if (!busy) onClose();
      }}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void onAddAsNew()}
          >
            {t("items.printPicker.awaitedAddNew")}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void onReceive()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("items.printPicker.awaitedReceive", { count: pairs.length })}
          </Button>
        </div>
      }
    >
      <ul className="flex flex-col gap-2 max-h-60 overflow-y-auto text-sm">
        {pairs.map((pair) => (
          <li
            key={pair.match.id}
            className="rounded-xl border border-border/70 bg-zinc-50/40 dark:bg-zinc-950/20 px-3 py-2"
          >
            <p className="font-semibold text-foreground leading-snug">
              {pair.query.title || pair.match.name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pairDetailLine(pair.match, t)}
            </p>
          </li>
        ))}
      </ul>
    </BaseModal>
  );
}
