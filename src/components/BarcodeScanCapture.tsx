"use client";

import { useState } from "react";
import { Scan } from "lucide-react";
import { toast } from "sonner";

import {
  BarcodeScannerView,
  type BarcodeScannerResult,
} from "@/components/BarcodeScannerView";
import { ManualBarcodeEntry } from "@/components/ManualBarcodeEntry";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { cn } from "@/lib/core/utils";
import { useCameraAvailability } from "@/lib/client/hooks/useCameraAvailability";

export function BarcodeScanCapture({
  active = true,
  shelfType,
  disabled = false,
  onBarcode,
  cameraClassName,
}: {
  active?: boolean;
  shelfType?: string | null;
  disabled?: boolean;
  onBarcode: (barcode: string) => void;
  cameraClassName?: string;
}) {
  const { t } = useLocale();
  const { isCameraUnavailable, isCheckingCamera } = useCameraAvailability();
  const [manualBarcode, setManualBarcode] = useState("");

  const showCamera = active && !isCameraUnavailable && !isCheckingCamera;

  const handleScan = (detectedCodes: BarcodeScannerResult) => {
    const barcode = detectedCodes?.[0]?.rawValue;
    if (!barcode || disabled) return;
    toast.success(t("scanner.scannedSuccessfully"));
    onBarcode(barcode);
  };

  const handleManualSubmit = (barcode: string) => {
    setManualBarcode("");
    onBarcode(barcode);
  };

  return (
    <>
      <style>{`
        @keyframes scan-laser {
          0%, 100% { top: 10%; opacity: 0.4; }
          50% { top: 90%; opacity: 1; }
        }
      `}</style>

      <div className="flex flex-col gap-3">
        {showCamera ? (
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl bg-zinc-950 border border-border/60",
              cameraClassName ??
                "aspect-square max-h-[220px] sm:max-h-[260px]",
            )}
          >
            <BarcodeScannerView
              onScan={handleScan}
              onError={() => toast.error(t("scanner.error"))}
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className="w-4/5 max-w-[280px] aspect-[1.3/1] relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]">
                <div className="absolute top-0 left-0 size-4 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 size-4 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 size-4 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 size-4 border-b-2 border-r-2 border-primary rounded-br-lg" />
                <div
                  className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444,0_0_3px_#ef4444]"
                  style={{ animation: "scan-laser 2.5s ease-in-out infinite" }}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Scan className="size-3.5 shrink-0" />
            {isCheckingCamera
              ? t("common.loading")
              : t("scanner.manualBarcodeHelp")}
          </p>
        )}

        <ManualBarcodeEntry
          value={manualBarcode}
          onValueChange={setManualBarcode}
          onSubmit={handleManualSubmit}
          disabled={disabled}
          shelfType={shelfType}
        />
      </div>
    </>
  );
}
