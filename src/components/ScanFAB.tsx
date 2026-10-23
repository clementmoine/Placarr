"use client";

import { useState } from "react";
import type { Prisma } from "@/generated/prisma/browser";
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
import { syncItemQueries } from "@/core/collect/queryCache";
import { useCameraAvailability } from "@/lib/client/hooks/useCameraAvailability";
import { BarcodeScanCapture } from "@/components/BarcodeScanCapture";
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

type CardMatchRow = {
  printKey: string;
  lang: string;
  distance: number;
};

export function ScanFAB() {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"barcode" | "card">("barcode");
  const [scannedBarcode, setScannedBarcode] = useState<string>("");
  const [quickScanOpen, setQuickScanOpen] = useState<boolean>(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [cardMatches, setCardMatches] = useState<CardMatchRow[]>([]);
  const [cardSearching, setCardSearching] = useState(false);
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
    setScanMode("barcode");
    setCardMatches([]);
    setIsScannerOpen(true);
  };

  const handleCardPhoto = async (file: File | null) => {
    if (!file) return;
    setCardSearching(true);
    setCardMatches([]);
    try {
      const body = new FormData();
      body.set("image", file);
      const response = await fetch("/api/identify/card-image", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as {
        matches?: CardMatchRow[];
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? t("scanner.error"));
        return;
      }
      const matches = data.matches ?? [];
      setCardMatches(matches);
      if (matches.length === 0) {
        toast.message(t("scanner.cardNoMatches"));
      }
    } catch {
      toast.error(t("scanner.error"));
    } finally {
      setCardSearching(false);
    }
  };

  const confirmCardMatch = (printKey: string) => {
    setIsScannerOpen(false);
    setPrefilledItemValues({
      name: printKey,
      imageUrl: null,
      barcode: "",
      shelfId,
    });
    setIsItemModalOpen(true);
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
      router.push(itemPath(newItem.shelf || { id: newItem.shelfId }, newItem));
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
        <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh] w-[95vw] sm:max-w-md rounded-2xl border border-border dark:border-zinc-800 shadow-2xl">
          <DialogHeader className="p-5 border-b shrink-0 flex flex-col gap-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Scan className="size-5 text-primary" />
              {t("scanner.title") || "Item scan"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              {scanMode === "card"
                ? t("scanner.cardDescription")
                : t("scanner.description") ||
                  "Hold the barcode inside the frame to scan the item."}
            </DialogDescription>
            <div className="mt-2 inline-flex rounded-xl border border-border overflow-hidden self-start">
              <button
                type="button"
                onClick={() => {
                  setScanMode("barcode");
                  setCardMatches([]);
                }}
                className={`h-9 px-3 text-xs font-bold cursor-pointer ${
                  scanMode === "barcode"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent"
                }`}
              >
                {t("scanner.modeBarcode")}
              </button>
              <button
                type="button"
                onClick={() => setScanMode("card")}
                className={`h-9 px-3 text-xs font-bold cursor-pointer ${
                  scanMode === "card"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent"
                }`}
              >
                {t("scanner.modeCard")}
              </button>
            </div>
          </DialogHeader>

          <div className="border-t border-border/60 p-4">
            {scanMode === "barcode" ? (
              <BarcodeScanCapture
                active={isScannerOpen && scanMode === "barcode"}
                onBarcode={openQuickScan}
                cameraClassName="aspect-square rounded-xl border-0 max-h-none"
              />
            ) : (
              <div className="flex flex-col gap-3">
                <label className="inline-flex items-center justify-center rounded-xl h-11 px-4 text-sm font-bold border border-border bg-card hover:bg-accent cursor-pointer">
                  {t("scanner.cardPickPhoto")}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => {
                      void handleCardPhoto(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                </label>
                {cardSearching && (
                  <p className="text-xs text-muted-foreground">
                    {t("scanner.cardSearching")}
                  </p>
                )}
                {cardMatches.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">
                      {t("scanner.cardConfirmHint")}
                    </p>
                    {cardMatches.map((row) => (
                      <button
                        key={row.printKey}
                        type="button"
                        onClick={() => confirmCardMatch(row.printKey)}
                        className="rounded-xl border border-border bg-card hover:bg-accent px-3 py-2 text-left text-sm font-bold cursor-pointer"
                      >
                        {row.printKey}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          d={row.distance}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
