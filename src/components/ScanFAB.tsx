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
import { UnifiedScanCapture } from "@/components/UnifiedScanCapture";
import { warmScanEnginesWhenIdle } from "@/lib/client/scan/scanRuntime";
import type { SessionLock } from "@/lib/client/scan/scanSession";
import dynamic from "next/dynamic";
import type { MetadataResult } from "@/types/metadataProvider";

const ItemModal = dynamic(
  () => import("./modals/ItemModal").then((m) => m.ItemModal),
  { ssr: false },
);
const QuickScanModal = dynamic(
  () => import("./modals/QuickScanModal").then((m) => m.QuickScanModal),
  { ssr: false },
);

export function ScanFAB() {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [batch, setBatch] = useState<SessionLock[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>("");
  const [quickScanOpen, setQuickScanOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
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

  // Models land in the browser cache while the user browses, so the first
  // tap on the button opens a scanner that already works.
  useEffect(() => {
    if (!isCameraUnavailable && !isCheckingCamera) warmScanEnginesWhenIdle();
  }, [isCameraUnavailable, isCheckingCamera]);

  const shelfMatch = pathname.match(/^\/shelves\/([^\/]+)/);
  const shelfId = shelfMatch ? shelfMatch[1] : undefined;

  const handleScanButtonClick = () => {
    if (isCameraUnavailable || isCheckingCamera) {
      setScannedBarcode("");
      setQuickScanOpen(true);
      return;
    }
    setIsScannerOpen(true);
  };

  const handleBatchDone = useCallback((locks: SessionLock[]) => {
    setIsScannerOpen(false);
    setBatch(locks);
    setBatchOpen(true);
  }, []);

  const popBatchHead = useCallback(() => {
    setBatch((prev) => prev.slice(1));
  }, []);

  const addBatchHead = useCallback(() => {
    const head = batch[0];
    if (!head) return;
    if (head.kind === "barcode") {
      setScannedBarcode(head.key);
      setQuickScanOpen(true);
      popBatchHead();
      return;
    }
    setPrefilledItemValues({
      name: head.key,
      imageUrl: head.faceUrl ?? null,
      barcode: "",
      shelfId,
    });
    setIsItemModalOpen(true);
    popBatchHead();
  }, [batch, popBatchHead, shelfId]);

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
      if (!batchOpen && !isScannerOpen) {
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
          showClose
          className="flex flex-col p-0 overflow-hidden gap-0 border-0 bg-black text-white shadow-2xl w-[100vw] max-w-none h-[100dvh] max-h-[100dvh] rounded-none top-0 left-0 translate-x-0 translate-y-0 sm:w-[min(100vw,28rem)] sm:h-[min(96dvh,52rem)] sm:max-h-[96dvh] sm:rounded-2xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:border sm:border-zinc-800 [&>button]:text-white/70 [&>button]:hover:text-white [&>button]:opacity-100 [&>button]:z-50"
        >
          <DialogTitle className="sr-only">
            {t("scanner.title") || "Item scan"}
          </DialogTitle>
          <div className="flex-1 min-h-0 flex flex-col pt-10">
            <UnifiedScanCapture
              active={isScannerOpen}
              onBatchDone={handleBatchDone}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={batchOpen}
        onOpenChange={(open) => {
          setBatchOpen(open);
          if (!open) setBatch([]);
        }}
      >
        <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
          <div className="p-5 border-b border-border space-y-1">
            <DialogTitle className="text-base font-bold">
              {t("scanner.sessionReviewTitle")}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {t("scanner.sessionReviewHint")}
            </p>
          </div>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-border">
            {batch.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {t("scanner.sessionEmpty")}
              </p>
            ) : (
              batch.map((lock) => (
                <div
                  key={lock.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {lock.faceUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={lock.faceUrl}
                      alt=""
                      className="size-12 rounded-lg object-cover bg-muted"
                    />
                  ) : (
                    <div className="size-12 rounded-lg bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                      {lock.kind === "barcode" ? "▦" : "▣"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{lock.label}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">
                      {lock.kind}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          {batch.length > 0 ? (
            <div className="p-4 flex gap-2 border-t border-border">
              <button
                type="button"
                onClick={popBatchHead}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold cursor-pointer"
              >
                {t("scanner.sessionSkip")}
              </button>
              <button
                type="button"
                onClick={addBatchHead}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold cursor-pointer"
              >
                {t("scanner.sessionAdd")}
              </button>
            </div>
          ) : null}
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
