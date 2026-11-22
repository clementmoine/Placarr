"use client";

import { useEffect } from "react";
import { useForm, type Control, type UseFormSetValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { BaseModal } from "@/components/modals/BaseModal";
import {
  ItemModalLifecycleFields,
  type ItemModalLifecycleFormSlice,
} from "@/components/modals/ItemModalLifecycleFields";
import { Form } from "@/components/ui/form";
import {
  ITEM_PRESENCES,
  parsePriceCents,
} from "@/core/collect/itemAbsence";
import { GRADE_STATUSES } from "@/core/collect/itemGrade";
import {
  bulkLifecyclePatchFromDirty,
  bulkLifecyclePatchIsEmpty,
  commonBulkLifecycleForm,
  emptyBulkLifecycleForm,
  type BulkLifecycleSourceItem,
} from "@/lib/client/bulkLifecycleForm";
import { updateItemsLifecycleBatch } from "@/lib/api/items";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

import type { Shelf } from "@/generated/prisma/browser";

const bulkEditSchema = z.object({
  presence: z.union([z.enum(ITEM_PRESENCES), z.literal("")]),
  absenceReason: z.string(),
  absenceSince: z.string(),
  absenceRecipient: z.string(),
  absenceSource: z.string(),
  absenceCarrier: z.string(),
  absenceTracking: z.string(),
  absenceOrderRef: z.string(),
  absenceOrderUrl: z.string(),
  absenceNote: z.string(),
  absencePrice: z.string(),
  absenceExpectedAt: z.string(),
  purchasePrice: z.string(),
  purchasedAt: z.string(),
  gradeStatus: z.enum(GRADE_STATUSES),
  gradeHouse: z.string(),
  gradeLabel: z.string(),
  gradeCertNo: z.string(),
  gradedAt: z.string(),
});

export function BulkEditModal({
  isOpen,
  onClose,
  itemIds,
  items,
  sourceShelfId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  itemIds: string[];
  /** Selected rows — used to seed common / mixed field values. */
  items: readonly BulkLifecycleSourceItem[];
  /** When set, scopes id resolution to that shelf. */
  sourceShelfId?: Shelf["id"];
  onSuccess?: (result: { count: number; sourceShelfIds: string[] }) => void;
}) {
  const { t } = useLocale();

  const form = useForm<ItemModalLifecycleFormSlice>({
    resolver: zodResolver(bulkEditSchema),
    defaultValues: emptyBulkLifecycleForm(),
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset(commonBulkLifecycleForm(items));
  }, [isOpen, items, form]);

  const editMutation = useMutation({
    mutationFn: updateItemsLifecycleBatch,
    onSuccess: (result) => {
      toast.success(
        t("items.bulkEdit.success").replace("{count}", String(result.count)),
      );
      onSuccess?.(result);
      onClose();
    },
    onError: () => {
      toast.error(t("items.bulkEdit.failed"));
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    if (itemIds.length === 0) return;

    const patch = bulkLifecyclePatchFromDirty({
      values,
      dirtyFields: form.formState.dirtyFields,
      parsePriceCents,
    });

    if (bulkLifecyclePatchIsEmpty(patch)) {
      toast.error(t("items.bulkEdit.nothingToApply"));
      return;
    }

    editMutation.mutate({
      itemIds,
      ...(sourceShelfId ? { sourceShelfId } : {}),
      ...patch,
    });
  });

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={t("items.bulkEdit.title")}
      description={t("items.bulkEdit.description").replace(
        "{count}",
        String(itemIds.length),
      )}
      onCancel={onClose}
      onSubmit={handleSubmit}
      submitLabel={t("items.bulkEdit.submit").replace(
        "{count}",
        String(itemIds.length),
      )}
      isSubmitting={editMutation.isPending}
      submitDisabled={itemIds.length === 0}
      cancelLabel={t("common.cancel")}
    >
      <Form {...form}>
        <div className="flex flex-col gap-1 px-1 pb-2">
          <p className="text-[11px] text-muted-foreground leading-snug px-0.5 pb-1">
            {t("items.bulkEdit.hint")}
          </p>
          <ItemModalLifecycleFields
            control={
              form.control as unknown as Control<ItemModalLifecycleFormSlice>
            }
            setValue={
              form.setValue as unknown as UseFormSetValue<ItemModalLifecycleFormSlice>
            }
            t={t}
            showPurchase
            showGrade={false}
            bulkMode
          />
        </div>
      </Form>
    </BaseModal>
  );
}
