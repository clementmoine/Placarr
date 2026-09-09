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
  /** Quarter-turn applied before the rectangle was drawn, in degrees. */
  rotate?: number;
};

/**
 * The rotated bitmap the editor actually works on, as a data URL.
 *
 * Rotating the preview rather than the crop rectangle is what keeps this honest:
 * `react-image-crop` measures the element it is given, so a CSS transform would
 * leave the rectangle in the *untransformed* space and every coordinate would
 * need undoing. Handing it a bitmap that is already turned means the box comes
 * out in exactly the space the server will extract from — no conversion, no
 * sign conventions to get wrong.
 */
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

type ImageCropModalProps = {
  /** Image to reframe. May be remote — the server localizes it first. */
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** Receives the derived crop URL, or the original one on revert. */
  onCropped: (url: string) => void;
  /**
   * What the crop is for. The same artwork often serves as both the cover and
   * the background: keyed on the file alone, cropping one rewrote the other's
   * image.
   */
  role?: string;
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
  role = "cover",
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
  /** Quarter-turn the collector has asked for, in degrees. */
  const [rotate, setRotate] = useState(0);
  /**
   * The turned bitmap, tagged with the angle it was made for.
   *
   * Tagged rather than cleared on every turn: a stale bitmap simply stops
   * matching, so nothing has to be reset synchronously and the previous
   * rotation can never flash on screen while the next one encodes.
   */
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
      try {
        const response = await fetch(
          `/api/images/crop?url=${encodeURIComponent(imageUrl)}&role=${encodeURIComponent(role)}`,
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
        // Reopening shows what is applied, rotation included.
        setRotate(data.current?.rotate ?? 0);
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

  /**
   * Turn the source into the bitmap the editor works on. At 0° that is the
   * source itself — no re-encode for the overwhelmingly common case.
   */
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
      // Fall back to the upright source rather than a blank editor; the
      // rotation is still sent, so the result is right even if the preview
      // could not be turned.
      if (!cancelled) setTurned({ degrees: rotate, url: sourceUrl });
    };
    image.src = sourceUrl;
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, rotate]);

  /** What the editor shows: the source upright, the turned bitmap otherwise. */
  const previewUrl =
    rotate === 0 ? sourceUrl : turned?.degrees === rotate ? turned.url : null;

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

      /*
        Both seeds are tied to an orientation: the stored box was drawn in its
        own rotation's space, and the automatic suggestion was measured on the
        upright image. Replaying either under a different turn would frame the
        wrong region, so at a new angle the editor starts from the whole frame.
      */
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
    [current, suggestion, rotate, asPercentCrop],
  );

  /**
   * Turn by a quarter, wrapping. The rectangle is dropped: it was drawn in the
   * previous orientation, and carrying it over would frame a region the
   * collector never chose.
   */
  const turnBy = useCallback((delta: number) => {
    setRotate((previous) => (((previous + delta) % 360) + 360) % 360);
    setCrop(undefined);
  }, []);

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
          role,
          rotate,
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
  }, [crop, sourceUrl, role, rotate, onCropped, onClose, t]);

  /**
   * Hand back the untouched original — the crop was only ever a derivative.
   *
   * The stored rectangle goes too: reverting means forgetting the framing, so
   * reopening offers the automatic suggestion again instead of restoring the
   * very crop that was just discarded. Failing to forget it must not block the
   * revert itself, which is the part the collector asked for.
   */
  const handleRevert = useCallback(async () => {
    if (!sourceUrl) return;
    setIsSaving(true);
    try {
      await fetch(
        `/api/images/crop?url=${encodeURIComponent(sourceUrl)}&role=${encodeURIComponent(role)}`,
        { method: "DELETE" },
      );
    } catch {
      // Ignored on purpose — see above.
    } finally {
      setIsSaving(false);
    }
    setCurrent(null);
    onCropped(sourceUrl);
    onClose();
  }, [sourceUrl, role, onCropped, onClose]);

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
            {/* Quarter turns only: lossless, and the whole point is a scan that
                arrived on its side. A free angle would need resampling and a
                background to fill the corners it opens up. */}
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
        {!isLoading && previewUrl && (
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
      </div>
    </BaseModal>
  );
}
