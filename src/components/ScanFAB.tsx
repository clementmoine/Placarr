"use client";

import { useCallback, useEffect, useState } from "react";
import type { Prisma } from "@/generated/prisma/browser";
import { usePathname, useRouter } from "next/navigation";
import { Scan, Barcode } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

import { saveItem } from "@/lib/api/items";
import { itemPath } from "@/lib/routing/slugs";
import { syncItemQueries } from "@/core/collect/queryCache";
import { useCameraAvailability } from "@/lib/client/hooks/useCameraAvailability";
import {
  UnifiedScanCapture,
  type ScanAddPrefill,
} from "@/components/UnifiedScanCapture";
import { warmScanAssetsWhenIdle } from "@/lib/client/scan/scanRuntime";
import dynamic from "next/dynamic";
import type { MetadataResult } from "@/types/metadataProvider";
import type { Type } from "@/generated/prisma/browser";

const ItemModal = dynamic(
  () => import("./modals/ItemModal").then((m) => m.ItemModal),
  { ssr: false },
);
const QuickScanModal = dynamic(
  () => import("./modals/QuickScanModal").then((m) => m.QuickScanModal),
  { ssr: false },
);

type PrefillState = {
  name: string;
  imageUrl: string | null;
  barcode: string;
  shelfId?: string;
  printKey?: string | null;
  skuKey?: string | null;
  language?: string | null;
  setCode?: string | null;
  shelfType?: Type | string | null;
  shelfSure?: boolean;
  metadataPreview?: MetadataResult | null;
};

export function ScanFAB() {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [quickScanOpen, setQuickScanOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [prefilledItemValues, setPrefilledItemValues] = useState<
    PrefillState | undefined
  >(undefined);

  const pathname = usePathname() || "";
  const router = useRouter();
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { isCameraUnavailable, isCheckingCamera } = useCameraAvailability();

  useEffect(() => {
    if (!isCameraUnavailable && !isCheckingCamera) warmScanAssetsWhenIdle();
  }, [isCameraUnavailable, isCheckingCamera]);

  const shelfMatch = pathname.match(/^\/shelves\/([^/]+)/);
  const shelfId = shelfMatch ? shelfMatch[1] : undefined;

  const handleScanButtonClick = () => {
    if (isCameraUnavailable || isCheckingCamera) {
      setScannedBarcode("");
      setQuickScanOpen(true);
      return;
    }
    setIsScannerOpen(true);
  };

  const openAddModal = useCallback((prefill: PrefillState) => {
    setPrefilledItemValues(prefill);
    setIsItemModalOpen(true);
  }, []);

  const handleCommitAdd = useCallback(
    (prefill: ScanAddPrefill) => {
      openAddModal({
        name: prefill.name,
        imageUrl: prefill.imageUrl,
        barcode: prefill.barcode,
        shelfId: prefill.shelfId || shelfId,
        printKey: prefill.printKey,
        skuKey: prefill.skuKey,
        language: prefill.language,
        shelfType: prefill.shelfType,
        shelfSure: prefill.shelfSure,
        metadataPreview: prefill.metadataPreview ?? null,
      });
    },
    [openAddModal, shelfId],
  );

  const handleOpenOwned = useCallback(
    (path: string) => {
      setIsScannerOpen(false);
      router.push(path);
    },
    [router],
  );

  const shouldUseManualScan = isCameraUnavailable || isCheckingCamera;
  const scanButtonLabel = shouldUseManualScan
    ? t("scanner.manualScanTitle")
    : t("scanner.title");

  const handleSelectProduct = (product: {
    name: string;
    imageUrl: string | null;
    barcode: string;
    shelfId?: string;
    metadataPreview?: MetadataResult | null;
  }) => {
    setQuickScanOpen(false);
    openAddModal(product);
  };

  const handleItemModalSubmit = async (
    itemData: Prisma.ItemCreateInput | Prisma.ItemUpdateInput,
  ) => {
    try {
      const newItem = await saveItem({
        ...itemData,
        refreshMetadata: true,
      });

      await syncItemQueries(queryClient, newItem, [newItem.shelfId], {
        isCreate: true,
      });

      toast.success(t("common.success"));
      if (!isScannerOpen) {
        router.push(
          itemPath(newItem.shelf || { id: newItem.shelfId }, newItem),
        );
      }
    } catch (error) {
      console.error("Failed to save scanned item:", error);
      toast.error(t("items.saveFailed"));
      throw error;
    }
  };

  return (
    <>
      <div className="fixed bottom-24 sm:bottom-6 right-6 z-40">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleScanButtonClick}
          aria-label={scanButtonLabel}
          title={scanButtonLabel}
          className="size-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center relative focus:outline-none cursor-pointer border border-primary-foreground/10"
        >
          {shouldUseManualScan ? (
            <Barcode className="size-6" />
          ) : (
            <>
              <Scan className="size-6" />
              <Barcode className="absolute size-3" />
            </>
          )}
        </motion.button>
      </div>

      <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
        <DialogContent
          showClose={false}
          className="flex flex-col p-0 overflow-hidden gap-0 border-0 bg-black text-white shadow-2xl w-[100vw] max-w-none h-[100dvh] max-h-[100dvh] rounded-none top-0 left-0 translate-x-0 translate-y-0 sm:w-[min(100vw,28rem)] sm:h-[min(96dvh,52rem)] sm:max-h-[96dvh] sm:rounded-2xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:border sm:border-zinc-800"
        >
          <DialogTitle className="sr-only">
            {t("scanner.title") || "Item scan"}
          </DialogTitle>
          <div className="flex-1 min-h-0 flex flex-col">
            <UnifiedScanCapture
              active={isScannerOpen}
              preferredShelfId={shelfId}
              pathname={pathname}
              onCommitAdd={handleCommitAdd}
              onOpenOwned={handleOpenOwned}
              onClose={() => setIsScannerOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* No-camera fallback only — hunt path no longer stacks QuickScan. */}
      <QuickScanModal
        isOpen={quickScanOpen}
        onClose={() => setQuickScanOpen(false)}
        barcode={scannedBarcode}
        defaultShelfId={shelfId}
        onSelectProduct={handleSelectProduct}
      />

      {isItemModalOpen && prefilledItemValues && (
        <ItemModal
          isOpen={isItemModalOpen}
          onClose={() => {
            setIsItemModalOpen(false);
            setPrefilledItemValues(undefined);
          }}
          onSubmit={handleItemModalSubmit}
          shelfId={prefilledItemValues.shelfId || ""}
          shelfType={
            (prefilledItemValues.shelfType as Type | undefined) || undefined
          }
          prefilledValues={prefilledItemValues}
        />
      )}
    </>
  );
}
