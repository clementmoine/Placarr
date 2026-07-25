"use client";

import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

import { BaseModal } from "@/components/modals/BaseModal";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { deleteItemsBatch } from "@/lib/api/items";

import type { Shelf } from "@/generated/prisma/browser";

export function BulkDeleteModal({
  isOpen,
  onClose,
  itemIds,
  sourceShelfId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  itemIds: string[];
  /** When set, scopes the delete to that shelf; omit on the collection page. */
  sourceShelfId?: Shelf["id"];
  onSuccess?: (result: { count: number; sourceShelfIds: string[] }) => void;
}) {
  const { t } = useLocale();

  const deleteMutation = useMutation({
    mutationFn: deleteItemsBatch,
    onSuccess: (result) => {
      toast.success(
        t("items.bulkDelete.success").replace("{count}", String(result.count)),
      );
      onSuccess?.(result);
      onClose();
    },
    onError: () => {
      toast.error(t("items.bulkDelete.failed"));
    },
  });

  const handleDelete = () => {
    if (itemIds.length === 0) return;
    deleteMutation.mutate({
      itemIds,
      ...(sourceShelfId ? { sourceShelfId } : {}),
    });
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={t("items.bulkDelete.title")}
      description={t("items.bulkDelete.description").replace(
        "{count}",
        String(itemIds.length),
      )}
      onCancel={onClose}
      onDelete={handleDelete}
      deleteLabel={t("items.bulkDelete.submit").replace(
        "{count}",
        String(itemIds.length),
      )}
      isDeleting={deleteMutation.isPending}
      cancelLabel={t("common.cancel")}
    >
      <div className="hidden" />
    </BaseModal>
  );
}
