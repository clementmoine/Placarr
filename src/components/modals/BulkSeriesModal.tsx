"use client";

import { BulkSeriesForm } from "@/components/modals/BulkSeriesForm";
import { BaseModal } from "@/components/modals/BaseModal";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

import type { Shelf } from "@prisma/client";

export function BulkSeriesModal({
  isOpen,
  onClose,
  shelfId,
  shelfName,
  shelfType,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  shelfId: Shelf["id"];
  shelfName?: string;
  shelfType?: Shelf["type"];
  onSuccess: (count: number) => void;
}) {
  const { t } = useLocale();

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="xl-auto"
      title={
        <div className="flex items-center gap-2">
          {shelfType && (
            <ShelfTypeIcon type={shelfType} className="size-5 shrink-0" />
          )}
          <span>{t("items.bulkSeries.title")}</span>
        </div>
      }
      description={
        shelfName
          ? t("items.bulkSeries.descriptionOnShelf").replace(
              "{shelf}",
              shelfName,
            )
          : t("items.bulkSeries.description")
      }
      customChildren
      footer={null}
    >
      <div className="flex flex-col flex-1 overflow-hidden p-4 md:p-6 min-h-0">
        <BulkSeriesForm
          shelfId={shelfId}
          isActive={isOpen}
          onSuccess={(count) => {
            onSuccess(count);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </BaseModal>
  );
}
