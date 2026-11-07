"use client";

/**
 * Live camera card ID — samples the finder, shows a face carousel of
 * probable prints, user confirms. Never auto-accepts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";

import { useLocale } from "@/lib/client/providers/LocaleProvider";
import {
  markCameraUnavailable,
  useCameraAvailability,
} from "@/lib/client/hooks/useCameraAvailability";
import { cn } from "@/lib/shared/utils";

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

const SAMPLE_HUNT_MS = 1100;
const SAMPLE_STABLE_MS = 2400;
/** Sure hits still need a short streak so a single lucky frame can't lock. */
const STABLE_HITS = 2;

export type CardLiveMatch = {
  printKey: string;
  lang: string;
  distance: number;
  faceUrl?: string | null;
  packId?: string;
  artRel?: string;
  ambiguous?: boolean;
  method?: "embed" | "dhash";
  confidence?: "sure" | "doubt" | "miss";
};

/**
 * Near-full frame (not a tight 63/88 crop). Server multi-window identify
 * finds the card when it's small / off-center in the finder.
 */
async function grabFinderBlob(
  video: HTMLVideoElement,
): Promise<Blob | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height, 0, 0, dw, dh);

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85),
  );
}

export function CardScanCapture({
  active = true,
  onLiveMatches,
  onConfirm,
  cameraClassName,
}: {
  active?: boolean;
  onLiveMatches?: (matches: CardLiveMatch[]) => void;
  onConfirm: (printKey: string) => void;
  cameraClassName?: string;
}) {
  const { t, locale } = useLocale();
  const { isCameraUnavailable, isCheckingCamera } = useCameraAvailability();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inFlightRef = useRef(false);
  const genRef = useRef(0);
  const lastKeyRef = useRef<string | null>(null);
  const streakRef = useRef(0);
  const backoffUntilRef = useRef(0);
  const stableRef = useRef<CardLiveMatch | null>(null);
  const onLiveMatchesRef = useRef(onLiveMatches);
  onLiveMatchesRef.current = onLiveMatches;

  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [stable, setStable] = useState<CardLiveMatch | null>(null);
  const [matches, setMatches] = useState<CardLiveMatch[]>([]);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setLive(false);
  }, []);

  useEffect(() => {
    if (!active || isCameraUnavailable || isCheckingCamera) {
      stopStream();
      setStable(null);
      setMatches([]);
      lastKeyRef.current = null;
      streakRef.current = 0;
      return;
    }

    let cancelled = false;
    setStarting(true);

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          CAMERA_CONSTRAINTS,
        );
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {
            /* dialog closed mid-start */
          });
        }
        setLive(true);
      } catch (error) {
        if (!cancelled) {
          markCameraUnavailable();
          toast.error(t("scanner.error"));
          console.warn("[CardScanCapture] camera", error);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, isCameraUnavailable, isCheckingCamera, stopStream, t]);

  const applyMatches = useCallback(
    (
      next: CardLiveMatch[],
      confidence: "sure" | "doubt" | "miss" = "doubt",
    ) => {
      setMatches(next);
      onLiveMatchesRef.current?.(next);

      const top = next[0] ?? null;
      // Only lock a "best" when the API is sure — doubts stay a carousel.
      if (confidence === "sure" && top?.printKey && !top.ambiguous) {
        if (lastKeyRef.current === top.printKey) {
          streakRef.current += 1;
        } else {
          lastKeyRef.current = top.printKey;
          streakRef.current = 1;
          stableRef.current = null;
          setStable(null);
        }
        if (streakRef.current >= STABLE_HITS) {
          stableRef.current = top;
          setStable(top);
        }
      } else {
        lastKeyRef.current = null;
        streakRef.current = 0;
        stableRef.current = null;
        setStable(null);
      }
    },
    [],
  );

  const identifyBlob = useCallback(
    async (blob: Blob, generation: number) => {
      const body = new FormData();
      body.set(
        "image",
        new File([blob], `card-live-${Date.now()}.jpg`, {
          type: "image/jpeg",
        }),
      );
      body.set("lang", locale);
      const response = await fetch("/api/identify/card-image", {
        method: "POST",
        body,
      });
      if (generation !== genRef.current) return;
      const data = (await response.json()) as {
        matches?: CardLiveMatch[];
        confidence?: "sure" | "doubt" | "miss";
        error?: string;
      };
      if (!response.ok) {
        if (response.status === 429) {
          const retryRaw = response.headers.get("Retry-After");
          const retrySec = Math.max(5, Number(retryRaw) || 30);
          backoffUntilRef.current = Date.now() + retrySec * 1000;
          toast.error(t("scanner.cardRateLimited"));
        } else if (response.status >= 500) {
          toast.error(t("scanner.error"));
        }
        return;
      }
      backoffUntilRef.current = 0;
      applyMatches(data.matches ?? [], data.confidence ?? "doubt");
    },
    [applyMatches, locale, t],
  );

  useEffect(() => {
    if (!active || !live) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() < backoffUntilRef.current) {
        schedule(Math.max(500, backoffUntilRef.current - Date.now()));
        return;
      }
      if (inFlightRef.current) {
        schedule(SAMPLE_HUNT_MS);
        return;
      }
      const video = videoRef.current;
      if (!video) {
        schedule(SAMPLE_HUNT_MS);
        return;
      }
      inFlightRef.current = true;
      setSampling(true);
      const generation = ++genRef.current;
      try {
        const blob = await grabFinderBlob(video);
        if (!blob || generation !== genRef.current) return;
        await identifyBlob(blob, generation);
      } catch {
        /* soft */
      } finally {
        inFlightRef.current = false;
        if (generation === genRef.current) setSampling(false);
        schedule(stableRef.current ? SAMPLE_STABLE_MS : SAMPLE_HUNT_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      genRef.current += 1;
      inFlightRef.current = false;
    };
  }, [active, live, identifyBlob]);

  const identifyFile = useCallback(
    async (file: File) => {
      setSampling(true);
      const generation = ++genRef.current;
      lastKeyRef.current = null;
      streakRef.current = 0;
      try {
        const body = new FormData();
        body.set("image", file);
        // Already-cropped gallery faces often fill the frame; allow AABB
        // fallbacks when quad-detect abstains. Live camera never sets this.
        body.set("source", "gallery");
        body.set("lang", locale);
        const response = await fetch("/api/identify/card-image", {
          method: "POST",
          body,
        });
        if (generation !== genRef.current) return;
        const data = (await response.json()) as {
          matches?: CardLiveMatch[];
          confidence?: "sure" | "doubt" | "miss";
          error?: string;
        };
        if (!response.ok) {
          toast.error(
            response.status === 429
              ? t("scanner.cardRateLimited")
              : t("scanner.error"),
          );
          return;
        }
        const next = data.matches ?? [];
        const confidence = data.confidence ?? "doubt";
        applyMatches(next, confidence);
        if (confidence === "sure" && next[0]) {
          lastKeyRef.current = next[0].printKey;
          streakRef.current = STABLE_HITS;
          stableRef.current = next[0];
          setStable(next[0]);
        } else if (!next.length) {
          toast.message(t("scanner.cardNoMatches"));
        }
      } catch {
        toast.error(t("scanner.error"));
      } finally {
        if (generation === genRef.current) setSampling(false);
      }
    },
    [applyMatches, locale, t],
  );

  const showCamera = active && !isCameraUnavailable && !isCheckingCamera;

  return (
    <div className="flex flex-col gap-3">
      {showCamera ? (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl bg-zinc-950 border border-border/60",
            cameraClassName ?? "aspect-[3/4] max-h-[420px]",
          )}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {(starting || !live) && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70 bg-zinc-950/80 z-10">
              {t("scanner.cardCameraStarting")}
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div className="w-[84%] max-w-[300px] aspect-[63/88] relative overflow-hidden rounded-xl border border-white/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]">
              <div className="absolute top-0 left-0 size-4 border-t-2 border-l-2 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 size-4 border-t-2 border-r-2 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 size-4 border-b-2 border-l-2 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 size-4 border-b-2 border-r-2 border-primary rounded-br-lg" />
            </div>
          </div>

          {!matches.length && (
            <div className="absolute inset-x-0 bottom-0 z-20 p-3 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-center text-xs text-white/80">
                {sampling
                  ? t("scanner.cardSearching")
                  : t("scanner.cardLiveHint")}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {matches.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {stable
              ? t("scanner.cardConfirmHint")
              : matches.some((m) => m.ambiguous)
                ? t("scanner.cardDoubtHint")
                : t("scanner.cardSearching")}
          </p>
          <div
            className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="list"
            aria-label={t("scanner.cardCarouselLabel")}
          >
            {matches.map((row, index) => {
              const isBest =
                Boolean(stable) && row.printKey === stable?.printKey;
              return (
                <button
                  key={`${row.printKey}:${row.lang}:${index}`}
                  type="button"
                  role="listitem"
                  onClick={() => onConfirm(row.printKey)}
                  className={cn(
                    "snap-center shrink-0 w-[112px] rounded-xl border bg-card overflow-hidden text-left cursor-pointer transition-shadow",
                    isBest
                      ? "border-primary ring-2 ring-primary/40 shadow-md"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="aspect-[63/88] bg-muted relative">
                    {row.faceUrl ? (
                      // Catalogue face — next/image optional; plain img for /assets
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.faceUrl}
                        alt={row.printKey}
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground p-2 text-center">
                        {row.printKey}
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5 space-y-0.5">
                    <p className="text-[10px] font-bold truncate leading-tight">
                      {row.printKey}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      d={row.distance}
                      {isBest ? ` · ${t("scanner.cardBest")}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          {stable ? (
            <button
              type="button"
              onClick={() => onConfirm(stable.printKey)}
              className="h-11 rounded-xl text-sm font-bold bg-primary text-primary-foreground cursor-pointer"
            >
              {t("scanner.cardConfirm")} — {stable.printKey}
            </button>
          ) : null}
        </div>
      ) : null}

      <label
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl h-11 px-4 text-sm font-bold border border-border bg-card hover:bg-accent cursor-pointer",
          showCamera ? "self-start" : "w-full",
        )}
      >
        <ImageIcon className="size-4" />
        {t("scanner.cardPickPhoto")}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (file) void identifyFile(file);
          }}
        />
      </label>
    </div>
  );
}
