"use client";

import { useEffect, useState } from "react";
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
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  itemIds: string[];
  sourceShelfId: Shelf["id"];
  onSuccess?: (result: {
    count: number;
    targetShelfId: string;
    sourceShelfIds: string[];
  }) => void;
}) {
  const { t } = useLocale();
  const [targetShelfId, setTargetShelfId] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setTargetShelfId("");
    }
  }, [isOpen]);

  const { data: shelves } = useQuery({
    queryKey: ["shelves"],
    queryFn: () => getShelves(),
    enabled: isOpen,
  });

  const destinationShelves =
    shelves?.filter((shelf) => shelf.id !== sourceShelfId) ?? [];

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
      sourceShelfId,
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
            <SelectValue placeholder={t("items.bulkMove.targetShelfPlaceholder")} />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border dark:border-zinc-800 rounded-xl shadow-lg max-h-[280px]">
            {destinationShelves.map((shelf) => (
              <SelectItem key={shelf.id} value={shelf.id} className="cursor-pointer text-xs">
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
