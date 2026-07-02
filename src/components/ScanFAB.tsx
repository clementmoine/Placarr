"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Scan, Barcode } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

import { saveItem } from "@/lib/api/items";
import { itemPath } from "@/lib/routing/slugs";
import { syncItemQueries } from "@/lib/item/queryCache";
import { useCameraAvailability } from "@/lib/client/hooks/useCameraAvailability";
import { BarcodeScanCapture } from "@/components/BarcodeScanCapture";
import { ItemModal } from "./modals/ItemModal";
import { QuickScanModal } from "./modals/QuickScanModal";
import type { MetadataResult } from "@/types/metadataProvider";

export function ScanFAB() {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>("");
  const [quickScanOpen, setQuickScanOpen] = useState<boolean>(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [prefilledItemValues, setPrefilledItemValues] = useState<
    | {
        name: string;
        imageUrl: string | null;
        barcode: string;
        shelfId?: string;
        metadataPreview?: MetadataResult | null;
      }
    | undefined
  >(undefined);

  const pathname = usePathname() || "";
  const router = useRouter();
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { isCameraUnavailable, isCheckingCamera } = useCameraAvailability();

  const shelfMatch = pathname.match(/^\/shelves\/([^\/]+)/);
  const shelfId = shelfMatch ? shelfMatch[1] : undefined;

  const openQuickScan = (barcode: string) => {
    setIsScannerOpen(false);
    setScannedBarcode(barcode);
    setQuickScanOpen(true);
  };

  const handleScanButtonClick = () => {
    if (isCameraUnavailable || isCheckingCamera) {
      setScannedBarcode("");
      setQuickScanOpen(true);
      return;
    }
    setIsScannerOpen(true);
  };

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
    setPrefilledItemValues(product);
    setIsItemModalOpen(true);
  };

  const handleItemModalSubmit = async (itemData: any) => {
    try {
      const newItem = await saveItem({
        ...itemData,
        refreshMetadata: true,
      });

      await syncItemQueries(queryClient, newItem, [newItem.shelfId], {
        isCreate: true,
      });

      toast.success(t("common.success"));
      router.push(
        itemPath((newItem as any).shelf || { id: newItem.shelfId }, newItem),
      );
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

      <Dialog
        open={isScannerOpen}
        onOpenChange={setIsScannerOpen}
      >
        <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh] w-[95vw] sm:max-w-md rounded-2xl border border-border dark:border-zinc-800 shadow-2xl">
          <DialogHeader className="p-5 border-b shrink-0 flex flex-col gap-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Scan className="size-5 text-primary" />
              {t("scanner.title") || "Item scan"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              {t("scanner.description") ||
                "Hold the barcode inside the frame to scan the item."}
            </DialogDescription>
          </DialogHeader>

          <div className="border-t border-border/60 p-4">
            <BarcodeScanCapture
              active={isScannerOpen}
              onBarcode={openQuickScan}
              cameraClassName="aspect-square rounded-xl border-0 max-h-none"
            />
          </div>
        </DialogContent>
      </Dialog>

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
          prefilledValues={prefilledItemValues}
        />
      )}
    </>
  );
}
