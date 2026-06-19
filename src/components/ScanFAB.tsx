"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Scan, Barcode } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/providers/LocaleProvider";
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
import { itemPath } from "@/lib/slugs";
import { syncItemQueries } from "@/lib/itemQueryCache";
import { useCameraAvailability } from "@/lib/hooks/useCameraAvailability";
import { ItemModal } from "./modals/ItemModal";
import { QuickScanModal } from "./modals/QuickScanModal";
import { ManualBarcodeEntry } from "@/components/ManualBarcodeEntry";
import {
  BarcodeScannerView,
  type BarcodeScannerResult,
} from "@/components/BarcodeScannerView";
import type { MetadataResult } from "@/types/metadataProvider";

export function ScanFAB() {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>("");
  const [manualBarcode, setManualBarcode] = useState<string>("");
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

  const handleScan = (detectedCodes: BarcodeScannerResult) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const barcode = detectedCodes[0].rawValue;
      setIsScannerOpen(false);
      toast.success(
        t("scanner.scannedSuccessfully") || "Scanned successfully!",
      );
      setScannedBarcode(barcode);
      setQuickScanOpen(true);
    }
  };

  const handleScannerError = (error: unknown) => {
    console.error("Scanner error:", error);
    toast.error(t("scanner.error") || "Error scanning");
  };

  const handleScanButtonClick = () => {
    if (isCameraUnavailable || isCheckingCamera) {
      setScannedBarcode("");
      setQuickScanOpen(true);
      return;
    }
    setIsScannerOpen(true);
  };

  const handleManualBarcodeSubmit = (barcode: string) => {
    setManualBarcode("");
    setIsScannerOpen(false);
    setScannedBarcode(barcode);
    setQuickScanOpen(true);
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

      await syncItemQueries(queryClient, newItem, [newItem.shelfId]);

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
      <style>{`
        @keyframes scan-laser {
          0%, 100% { top: 10%; opacity: 0.4; }
          50% { top: 90%; opacity: 1; }
        }
      `}</style>
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
        onOpenChange={(open) => {
          setIsScannerOpen(open);
          if (!open) setManualBarcode("");
        }}
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

          <div className="relative overflow-hidden aspect-square bg-zinc-950">
            {isScannerOpen && (
              <BarcodeScannerView
                onScan={handleScan}
                onError={handleScannerError}
              />
            )}

            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className="w-4/5 max-w-[280px] aspect-[1.3/1] relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]">
                {/* Sci-fi scanner corners */}
                <div className="absolute top-0 left-0 size-4 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 size-4 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 size-4 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 size-4 border-b-2 border-r-2 border-primary rounded-br-lg" />

                {/* Animated Laser Line */}
                <div
                  className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444,0_0_3px_#ef4444]"
                  style={{
                    animation: "scan-laser 2.5s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 p-4">
            <ManualBarcodeEntry
              value={manualBarcode}
              onValueChange={setManualBarcode}
              onSubmit={handleManualBarcodeSubmit}
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
