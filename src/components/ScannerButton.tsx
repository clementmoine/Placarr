import { toast } from "sonner";
import { useCallback, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { Barcode, Scan } from "lucide-react";

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
  const [isActive, setActive] = useState(false);

  const handleStart = useCallback(() => {
    setActive(true);
  }, []);

  const handleScan = (detectedCodes: IDetectedBarcode[]) => {
    setActive(false);
    onScan(detectedCodes[0].rawValue);
  };

  const handleStop = useCallback(() => {
    setActive(false);

    onStop?.();
  }, [onStop]);

  const handleError = useCallback((error: unknown) => {
    console.log("Something went wrong while scanning", error);
    toast.error("Something went wrong while scanning");
  }, []);

  return (
    <div className={className}>
      <Dialog open={isActive} onOpenChange={handleStop}>
        <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh]">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="text-foreground">Item scan</DialogTitle>
            <DialogDescription className="text-foreground">
              Hold the barcode inside the frame to scan the item.
            </DialogDescription>
          </DialogHeader>

          <div className="relative overflow-hidden">
            <Scanner
              onScan={handleScan}
              onError={handleError}
              formats={["ean_13", "ean_8", "upc_a", "upc_e", "code_128"]}
              components={{
                finder: false,
              }}
              styles={{
                container: {
                  background: "black",
                },
              }}
            />

            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/4 aspect-video relative outline-[999px] outline-black/60 border-white border-4 rounded-xl" />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Button
        variant="ghost"
        type="button"
        onClick={handleStart}
        className="items-center justify-center p-0 size-8"
      >
        <Scan className="size-4" />
        <Barcode className="absolute size-2" />
      </Button>
    </div>
  );
}
