"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, {
  type Crop,
  centerCrop,
  convertToPixelCrop,
} from "react-image-crop";
import {
  Loader2,
  RotateCcw,
  RotateCcwSquare,
  RotateCwSquare,
  Wand2,
} from "lucide-react";

import "react-image-crop/dist/ReactCrop.css";

import { BaseModal } from "@/components/modals/BaseModal";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

type CropSuggestion = {
  left: number;
  top: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
  rotate?: number;
};

type Point2 = { x: number; y: number };
type CropMode = "rect" | "free";

function rotatedDataUrl(image: HTMLImageElement, degrees: number): string {
  const odd = degrees % 180 === 90;
  const canvas = document.createElement("canvas");
  canvas.width = odd ? image.naturalHeight : image.naturalWidth;
  canvas.height = odd ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return image.src;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvas.toDataURL("image/png");
}

function defaultInsetQuad(
  width: number,
  height: number,
): [Point2, Point2, Point2, Point2] {
  const insetX = width * 0.08;
  const insetY = height * 0.08;
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ];
}

type ImageCropModalProps = {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCropped: (url: string) => void;
  role?: string;
};

/**
 * Manual reframing — rectangle (react-image-crop) or free 4-corner
 * perspective (homography on the server).
 */
export function ImageCropModal({
  imageUrl,
  isOpen,
  onClose,
  onCropped,
  role = "cover",
}: ImageCropModalProps) {
  const { t } = useLocale();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const freeWrapRef = useRef<HTMLDivElement | null>(null);
  const dragIndex = useRef<number | null>(null);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CropSuggestion | null>(null);
  const [current, setCurrent] = useState<CropSuggestion | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>();
  const [mode, setMode] = useState<CropMode>("rect");
  const [quad, setQuad] = useState<[Point2, Point2, Point2, Point2] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotate, setRotate] = useState(0);
  const [turned, setTurned] = useState<{ degrees: number; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);
      setCrop(undefined);
      setQuad(null);
      setMode("rect");
      try {
        const response = await fetch(
          `/api/images/crop?url=${encodeURIComponent(imageUrl)}&role=${encodeURIComponent(role)}`,
        );
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          url: string;
          suggestion: CropSuggestion | null;
          current:
            | (CropSuggestion & { kind?: string; points?: Point2[] })
            | null;
        };
        if (cancelled) return;
        setSourceUrl(data.url);
        setSuggestion(data.suggestion);
        const cur = data.current;
        if (cur && cur.kind === "quad" && Array.isArray(cur.points)) {
          setCurrent(null);
          setMode("free");
          setQuad(cur.points as [Point2, Point2, Point2, Point2]);
          setRotate(cur.rotate ?? 0);
        } else {
          setCurrent(cur as CropSuggestion | null);
          setRotate(cur?.rotate ?? 0);
        }
      } catch {
        if (!cancelled) setError(t("errors.genericMessage"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, imageUrl, role, t]);

  useEffect(() => {
    if (!sourceUrl || rotate === 0) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!cancelled) {
        setTurned({ degrees: rotate, url: rotatedDataUrl(image, rotate) });
      }
    };
    image.onerror = () => {
      if (!cancelled) setTurned({ degrees: rotate, url: sourceUrl });
    };
    image.src = sourceUrl;
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, rotate]);

  const previewUrl =
    rotate === 0 ? sourceUrl : turned?.degrees === rotate ? turned.url : null;

  const asPercentCrop = useCallback((box: CropSuggestion): Crop | null => {
    if (!box.imageWidth || !box.imageHeight) return null;
    return {
      unit: "%",
      x: (box.left / box.imageWidth) * 100,
      y: (box.top / box.imageHeight) * 100,
      width: (box.width / box.imageWidth) * 100,
      height: (box.height / box.imageHeight) * 100,
    };
  }, []);

  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      imageRef.current = image;

      if (mode === "free") {
        if (!quad) {
          setQuad(defaultInsetQuad(image.naturalWidth, image.naturalHeight));
        }
        return;
      }

      const seed =
        current && (current.rotate ?? 0) === rotate
          ? current
          : rotate === 0
            ? suggestion
            : null;
      const percent = seed ? asPercentCrop(seed) : null;
      if (percent) {
        setCrop(percent);
        return;
      }

      setCrop(
        centerCrop(
          { unit: "%", x: 0, y: 0, width: 90, height: 90 },
          image.width,
          image.height,
        ),
      );
    },
    [current, suggestion, rotate, asPercentCrop, mode, quad],
  );

  const turnBy = useCallback((delta: number) => {
    setRotate((previous) => (((previous + delta) % 360) + 360) % 360);
    setCrop(undefined);
    setQuad(null);
  }, []);

  const handleAutoCrop = useCallback(() => {
    if (!suggestion) return;
    const percent = asPercentCrop(suggestion);
    if (percent) {
      setMode("rect");
      setCrop(percent);
    }
  }, [suggestion, asPercentCrop]);

  const moveQuadCorner = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const image = imageRef.current;
      const wrap = freeWrapRef.current;
      if (!image || !wrap || !quad) return;
      const rect = image.getBoundingClientRect();
      const scaleX = image.naturalWidth / rect.width;
      const scaleY = image.naturalHeight / rect.height;
      const x = Math.min(
        image.naturalWidth - 1,
        Math.max(0, (clientX - rect.left) * scaleX),
      );
      const y = Math.min(
        image.naturalHeight - 1,
        Math.max(0, (clientY - rect.top) * scaleY),
      );
      setQuad((prev) => {
        if (!prev) return prev;
        const next = [...prev] as [Point2, Point2, Point2, Point2];
        next[index] = { x, y };
        return next;
      });
    },
    [quad],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (dragIndex.current == null) return;
      moveQuadCorner(dragIndex.current, event.clientX, event.clientY);
    };
    const onUp = () => {
      dragIndex.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [moveQuadCorner]);

  const handleConfirm = useCallback(async () => {
    const image = imageRef.current;
    if (!image || !sourceUrl) return;

    let body: Record<string, unknown>;
    if (mode === "free" && quad) {
      body = {
        url: sourceUrl,
        role,
        rotate,
        quad: { points: quad },
      };
    } else {
      if (!crop?.width || !crop?.height) return;
      const pixelCrop = convertToPixelCrop(crop, image.width, image.height);
      if (!pixelCrop.width || !pixelCrop.height) return;
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      body = {
        url: sourceUrl,
        role,
        rotate,
        crop: {
          left: Math.round(pixelCrop.x * scaleX),
          top: Math.round(pixelCrop.y * scaleY),
          width: Math.round(pixelCrop.width * scaleX),
          height: Math.round(pixelCrop.height * scaleY),
        },
      };
    }

    setIsSaving(true);
    setError(null);
    try {

      const response = await fetch("/api/images/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { url: string };
      onCropped(data.url);
      onClose();
    } catch {
      setError(t("errors.genericMessage"));
    } finally {
      setIsSaving(false);
    }
  }, [crop, quad, mode, sourceUrl, role, rotate, onCropped, onClose, t]);

  const handleRevert = useCallback(async () => {
    if (!sourceUrl) return;
    setIsSaving(true);
    try {
      await fetch(
        `/api/images/crop?url=${encodeURIComponent(sourceUrl)}&role=${encodeURIComponent(role)}`,
        { method: "DELETE" },
      );
    } catch {
      // Ignored on purpose.
    } finally {
      setIsSaving(false);
    }
    setCurrent(null);
    onCropped(sourceUrl);
    onClose();
  }, [sourceUrl, role, onCropped, onClose]);

  const canApply =
    mode === "free" ? Boolean(quad) : Boolean(crop?.width && crop?.height);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={t("items.cropImage.title")}
      description={t("items.cropImage.description")}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRevert}
              disabled={!sourceUrl || isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl h-10 px-3 text-sm font-bold border border-border bg-card hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="size-4" />
              {t("items.cropImage.revert")}
            </button>
            <button
              type="button"
              onClick={handleAutoCrop}
              disabled={!suggestion || isSaving || mode === "free"}
              title={t("items.cropImage.autoHint")}
              className="inline-flex items-center gap-1.5 rounded-xl h-10 px-3 text-sm font-bold border border-border bg-card hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <Wand2 className="size-4" />
              {t("items.cropImage.auto")}
            </button>
            <button
              type="button"
              onClick={() => turnBy(-90)}
              disabled={!previewUrl || isSaving}
              title={t("items.cropImage.rotateLeft")}
              aria-label={t("items.cropImage.rotateLeft")}
              className="inline-flex items-center justify-center rounded-xl size-10 border border-border bg-card hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <RotateCcwSquare className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => turnBy(90)}
              disabled={!previewUrl || isSaving}
              title={t("items.cropImage.rotateRight")}
              aria-label={t("items.cropImage.rotateRight")}
              className="inline-flex items-center justify-center rounded-xl size-10 border border-border bg-card hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <RotateCwSquare className="size-4" />
            </button>
            <div className="inline-flex rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setMode("rect")}
                disabled={isSaving}
                className={`h-10 px-3 text-sm font-bold cursor-pointer ${
                  mode === "rect" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
                }`}
              >
                {t("items.cropImage.modeRect")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("free");
                  const image = imageRef.current;
                  if (image && !quad) {
                    setQuad(
                      defaultInsetQuad(image.naturalWidth, image.naturalHeight),
                    );
                  }
                }}
                disabled={isSaving}
                title={t("items.cropImage.modeFreeHint")}
                className={`h-10 px-3 text-sm font-bold cursor-pointer ${
                  mode === "free" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
                }`}
              >
                {t("items.cropImage.modeFree")}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl h-10 px-4 text-sm font-bold border border-border bg-card hover:bg-accent cursor-pointer"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSaving || isLoading || !canApply}
              className="inline-flex items-center gap-1.5 rounded-xl h-10 px-4 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 cursor-pointer"
            >
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              {t("items.cropImage.apply")}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3">
        {isLoading && <Loader2 className="size-6 animate-spin" />}
        {error && (
          <p className="text-sm font-medium text-destructive">{error}</p>
        )}
        {!isLoading && previewUrl && mode === "rect" && (
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            className="max-h-[55vh]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              onLoad={handleImageLoad}
              className="max-h-[55vh] w-auto"
            />
          </ReactCrop>
        )}
        {!isLoading && previewUrl && mode === "free" && (
          <div ref={freeWrapRef} className="relative max-h-[55vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              onLoad={handleImageLoad}
              className="max-h-[55vh] w-auto select-none"
              draggable={false}
            />
            {quad && imageRef.current && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 ${imageRef.current.naturalWidth} ${imageRef.current.naturalHeight}`}
                preserveAspectRatio="none"
              >
                <polygon
                  points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(59,130,246,0.15)"
                  stroke="rgb(59,130,246)"
                  strokeWidth={Math.max(
                    2,
                    imageRef.current.naturalWidth / 200,
                  )}
                />
                {quad.map((p, index) => (
                  <circle
                    key={index}
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(10, imageRef.current!.naturalWidth / 40)}
                    fill="white"
                    stroke="rgb(59,130,246)"
                    strokeWidth={3}
                    className="pointer-events-auto cursor-grab"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      dragIndex.current = index;
                      (event.target as Element).setPointerCapture?.(
                        event.pointerId,
                      );
                    }}
                  />
                ))}
              </svg>
            )}
          </div>
        )}
      </div>
    </BaseModal>
  );
}
