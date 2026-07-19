"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";

import { BaseModal } from "@/components/modals/BaseModal";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { moveItemsBatch } from "@/lib/api/items";
import { getShelves } from "@/lib/api/shelves";

import type { Shelf } from "@prisma/client";

export function BulkMoveModal({
  isOpen,
  onClose,
  itemIds,
  sourceShelfId,
  excludeShelfIds,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  itemIds: string[];
  /** When set, scopes the move; omit on the collection page. */
  sourceShelfId?: Shelf["id"];
  /** Shelves to hide from the destination picker (e.g. current sources). */
  excludeShelfIds?: readonly string[];
  onSuccess?: (result: {
    count: number;
    targetShelfId: string;
    sourceShelfIds: string[];
  }) => void;
}) {
  const { t } = useLocale();
  const [targetShelfId, setTargetShelfId] = useState("");

  // Remise à zéro à la fermeture — ajustée pendant le render, pas en effect.
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (!isOpen) setTargetShelfId("");
  }

  const { data: shelves } = useQuery({
    queryKey: ["shelves", "picker"],
    queryFn: () => getShelves(null, { lite: true }),
    enabled: isOpen,
  });

  const excluded = useMemo(() => {
    const ids = new Set(excludeShelfIds ?? []);
    if (sourceShelfId) ids.add(sourceShelfId);
    return ids;
  }, [excludeShelfIds, sourceShelfId]);

  const destinationShelves =
    shelves?.filter((shelf) => !excluded.has(shelf.id)) ?? [];

  const moveMutation = useMutation({
    mutationFn: moveItemsBatch,
    onSuccess: (result) => {
      toast.success(
        t("items.bulkMove.success").replace("{count}", String(result.count)),
      );
      onSuccess?.(result);
      onClose();
    },
    onError: () => {
      toast.error(t("items.bulkMove.failed"));
    },
  });

  const handleSubmit = () => {
    if (!targetShelfId) {
      toast.error(t("items.bulkMove.shelfRequired"));
      return;
    }

    moveMutation.mutate({
      itemIds,
      targetShelfId,
      ...(sourceShelfId ? { sourceShelfId } : {}),
    });
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={t("items.bulkMove.title")}
      description={t("items.bulkMove.description").replace(
        "{count}",
        String(itemIds.length),
      )}
      onSubmit={handleSubmit}
      submitLabel={t("items.bulkMove.submit").replace(
        "{count}",
        String(itemIds.length),
      )}
      isSubmitting={moveMutation.isPending}
      submitDisabled={!targetShelfId || itemIds.length === 0}
      cancelLabel={t("common.cancel")}
    >
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {t("items.bulkMove.targetShelf")}
        </label>
        <Select value={targetShelfId} onValueChange={setTargetShelfId}>
          <SelectTrigger className="w-full bg-zinc-50 dark:bg-zinc-950/20 h-10 border-border/80 rounded-xl cursor-pointer text-xs font-semibold shadow-none">
            <SelectValue
              placeholder={t("items.bulkMove.targetShelfPlaceholder")}
            />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border dark:border-zinc-800 rounded-xl shadow-lg max-h-[280px]">
            {destinationShelves.map((shelf) => (
              <SelectItem
                key={shelf.id}
                value={shelf.id}
                className="cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2">
                  {shelf.type && (
                    <ShelfTypeIcon
                      type={shelf.type}
                      className="size-3.5 text-muted-foreground"
                    />
                  )}
                  <span>{shelf.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </BaseModal>
  );
}
