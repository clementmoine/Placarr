"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, {
  type Crop,
  centerCrop,
  convertToPixelCrop,
} from "react-image-crop";
import { Loader2, RotateCcw, Wand2 } from "lucide-react";

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
};

type ImageCropModalProps = {
  /** Image to reframe. May be remote — the server localizes it first. */
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** Receives the derived crop URL, or the original one on revert. */
  onCropped: (url: string) => void;
};

/**
 * Manual reframing with corner handles, mouse and touch.
 *
 * Two properties make it safe to change your mind: the editor always loads the
 * *original* image (never a previous crop), and the original file is never
 * overwritten — so reverting is just handing back its URL, and re-cropping ten
 * times degrades nothing.
 *
 * The margin detection that used to crop automatically survives here as a
 * starting rectangle: a suggestion to accept, drag, or ignore.
 */
export function ImageCropModal({
  imageUrl,
  isOpen,
  onClose,
  onCropped,
}: ImageCropModalProps) {
  const { t } = useLocale();
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CropSuggestion | null>(null);
  /** The rectangle already applied to this image, when there is one. */
  const [current, setCurrent] = useState<CropSuggestion | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);
      setCrop(undefined);
      try {
        const response = await fetch(
          `/api/images/crop?url=${encodeURIComponent(imageUrl)}`,
        );
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          url: string;
          suggestion: CropSuggestion | null;
          current: CropSuggestion | null;
        };
        if (cancelled) return;
        setSourceUrl(data.url);
        setSuggestion(data.suggestion);
        setCurrent(data.current);
      } catch {
        if (!cancelled) setError(t("errors.genericMessage"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, imageUrl, t]);

  /** Percentages, so a rectangle survives the displayed-size scaling. */
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

  /**
   * Seed the rectangle once the bitmap size is known. What is already applied
   * wins: re-proposing the automatic guess over a framing the collector chose
   * would silently undo their work.
   */
  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      imageRef.current = image;

      const seed = current ?? suggestion;
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
    [current, suggestion, asPercentCrop],
  );

  /** Offer the automatic framing as a one-click alternative, never as a default. */
  const handleAutoCrop = useCallback(() => {
    if (!suggestion) return;
    const percent = asPercentCrop(suggestion);
    if (percent) setCrop(percent);
  }, [suggestion, asPercentCrop]);

  const handleConfirm = useCallback(async () => {
    const image = imageRef.current;
    if (!image || !crop?.width || !crop?.height || !sourceUrl) return;

    /**
     * Derived from the rectangle on screen, not from `onComplete`. That callback
     * only fires at the end of a *user* interaction, so a rectangle set
     * programmatically — the stored crop on open, or the "Auto" button — left
     * the previous one in state and the wrong region was written.
     */
    const pixelCrop = convertToPixelCrop(crop, image.width, image.height);
    if (!pixelCrop.width || !pixelCrop.height) return;

    // The editor works in displayed pixels; the file is cropped in natural ones.
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/images/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sourceUrl,
          crop: {
            left: Math.round(pixelCrop.x * scaleX),
            top: Math.round(pixelCrop.y * scaleY),
            width: Math.round(pixelCrop.width * scaleX),
            height: Math.round(pixelCrop.height * scaleY),
          },
        }),
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
  }, [crop, sourceUrl, onCropped, onClose, t]);

  /** Hand back the untouched original — the crop was only ever a derivative. */
  const handleRevert = useCallback(() => {
    if (!sourceUrl) return;
    onCropped(sourceUrl);
    onClose();
  }, [sourceUrl, onCropped, onClose]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={t("items.cropImage.title")}
      description={t("items.cropImage.description")}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
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
              disabled={!suggestion || isSaving}
              title={t("items.cropImage.autoHint")}
              className="inline-flex items-center gap-1.5 rounded-xl h-10 px-3 text-sm font-bold border border-border bg-card hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <Wand2 className="size-4" />
              {t("items.cropImage.auto")}
            </button>
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
              disabled={isSaving || isLoading || !crop?.width}
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
        {!isLoading && sourceUrl && (
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            className="max-h-[55vh]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceUrl}
              alt=""
              onLoad={handleImageLoad}
              className="max-h-[55vh] w-auto"
            />
          </ReactCrop>
        )}
      </div>
    </BaseModal>
  );
}
