"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { markCameraUnavailable } from "@/lib/client/hooks/useCameraAvailability";

type ScannerProps = {
  onScan: (detectedCodes: IDetectedBarcode[]) => void;
  onError?: (error: unknown) => void;
  constraints?: MediaTrackConstraints;
  formats?: string[];
  components?: {
    finder?: boolean;
    torch?: boolean;
    onOff?: boolean;
    zoom?: boolean;
  };
  styles?: {
    container?: CSSProperties;
    video?: CSSProperties;
  };
  scanDelay?: number;
  allowMultiple?: boolean;
  sound?: boolean | string;
};

export type BarcodeScannerResult = IDetectedBarcode[];

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

const PRIMARY_CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

const FALLBACK_CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "environment",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isCameraWarmupTimeout(error: unknown): boolean {
  return /loading camera stream timed out/i.test(getErrorMessage(error));
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "";
}

function isCameraAccessUnavailable(error: unknown): boolean {
  const errorDetails = `${getErrorName(error)} ${getErrorMessage(error)}`;

  return /notallowed|notfound|security|permission|denied|permissions policy|requested device not found|could not start video source/i.test(
    errorDetails,
  );
}

export function BarcodeScannerView({
  onScan,
  onError,
}: {
  onScan: (detectedCodes: BarcodeScannerResult) => void;
  onError?: (error: unknown) => void;
}) {
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onErrorRef = useRef(onError);
  const [Scanner, setScanner] = useState<ComponentType<ScannerProps> | null>(
    null,
  );
  const [scannerLoadError, setScannerLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let isMounted = true;

    import("@yudiel/react-qr-scanner")
      .then((mod) => {
        if (!isMounted) return;
        setScanner(() => mod.Scanner as ComponentType<ScannerProps>);
      })
      .catch((error) => {
        if (isMounted) {
          setScannerLoadError(true);
        }
        onErrorRef.current?.(error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const constraints = useMemo(
    () =>
      attempt === 0 ? PRIMARY_CAMERA_CONSTRAINTS : FALLBACK_CAMERA_CONSTRAINTS,
    [attempt],
  );

  const handleScan = useCallback(
    (detectedCodes: IDetectedBarcode[]) => {
      if (detectedCodes.length === 0) return;
      onScan(detectedCodes);
    },
    [onScan],
  );

  const handleError = useCallback(
    (error: unknown) => {
      if (isCameraWarmupTimeout(error) && attempt < 3) {
        setIsRetrying(true);
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = setTimeout(() => {
          setAttempt((current) => current + 1);
          setIsRetrying(false);
        }, 400);
        return;
      }

      setIsRetrying(false);
      if (isCameraAccessUnavailable(error)) {
        markCameraUnavailable();
      }
      onError?.(error);
    },
    [attempt, onError],
  );

  if (!Scanner) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-xs font-semibold text-white">
        {scannerLoadError ? "Camera indisponible" : "Activation camera..."}
      </div>
    );
  }

  return (
    <>
      <Scanner
        key={attempt}
        onScan={handleScan}
        onError={handleError}
        constraints={constraints}
        formats={BARCODE_FORMATS}
        scanDelay={250}
        allowMultiple={false}
        sound={false}
        components={{ finder: false }}
        styles={{
          container: {
            background: "black",
            width: "100%",
            height: "100%",
          },
          video: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
          },
        }}
      />
      {isRetrying && (
        <div className="absolute inset-x-0 top-4 z-20 flex justify-center pointer-events-none">
          <span className="rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            Activation camera...
          </span>
        </div>
      )}
    </>
  );
}
