import { toast } from "sonner";
import { useCallback, useState } from "react";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ManualBarcodeEntry } from "@/components/ManualBarcodeEntry";
import { useCameraAvailability } from "@/lib/client/hooks/useCameraAvailability";

import { Barcode, Scan } from "lucide-react";
import {
  BarcodeScannerView,
  type BarcodeScannerResult,
} from "@/components/BarcodeScannerView";

interface BarcodeScannerProps {
  className?: string;
  onScan: (barcode: string) => void;
  onStop?: () => void;
}

export function ScannerButton({
  className,
  onScan,
  onStop,
}: BarcodeScannerProps) {
  const { t } = useLocale();
  const { isCameraUnavailable, isCheckingCamera } = useCameraAvailability();
  const [isActive, setActive] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");

  const handleStart = useCallback(() => {
    setActive(true);
  }, []);

  const handleScan = (detectedCodes: BarcodeScannerResult) => {
    setActive(false);
    onScan(detectedCodes[0].rawValue);
  };

  const handleStop = useCallback(() => {
    setActive(false);
    setManualBarcode("");

    onStop?.();
  }, [onStop]);

  const handleManualBarcodeSubmit = useCallback(
    (barcode: string) => {
      setManualBarcode("");
      setActive(false);
      onScan(barcode);
    },
    [onScan],
  );

  const handleError = useCallback(
    (error: unknown) => {
      console.log("Something went wrong while scanning", error);
      toast.error(t("scanner.error"));
    },
    [t],
  );

  if (isCameraUnavailable || isCheckingCamera) return null;

  return (
    <div className={className}>
      <style>{`
        @keyframes scan-laser {
          0%, 100% { top: 10%; opacity: 0.4; }
          50% { top: 90%; opacity: 1; }
        }
      `}</style>
      <Dialog open={isActive} onOpenChange={handleStop}>
        <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh] w-[95vw] sm:max-w-md rounded-2xl border border-border dark:border-zinc-800 shadow-2xl">
          <DialogHeader className="p-5 border-b shrink-0 flex flex-col gap-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Scan className="size-5 text-primary" />
              {t("scanner.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              {t("scanner.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="relative overflow-hidden aspect-square bg-zinc-950">
            <BarcodeScannerView onScan={handleScan} onError={handleError} />

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

      <Button
        variant="ghost"
        type="button"
        onClick={handleStart}
        className="items-center justify-center p-0 size-7"
      >
        <Scan className="size-4" />
        <Barcode className="absolute size-2" />
      </Button>
    </div>
  );
}
