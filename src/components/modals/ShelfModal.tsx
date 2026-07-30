"use client";

import { z } from "zod";
import color from "color";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, Plus, Upload, X } from "lucide-react";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { DialogFooter } from "@/components/ui/dialog";
import { BaseModal } from "@/components/modals/BaseModal";
import { CardFormatPicker } from "@/components/modals/CardFormatPicker";
import { SHELF_CARD_LOGO_CLASSNAME, ShelfCard } from "@/components/ShelfCard";
import { RemoteImage } from "@/components/RemoteImage";
import { cn } from "@/lib/shared/utils";

import { deleteShelf, getShelf } from "@/lib/api/shelves";
import { isUrl } from "@/lib/shared/isUrl";
import { isCardBackUrl } from "@/core/collect/cardBack";
import { uploadImage } from "@/lib/api/upload";
import {
  coerceCardFormatForType,
  getDefaultCardFormatAlias,
  type CardFormat,
} from "@/lib/text/cardFormat";
import type { ShelfBestItem, ShelfWithItemCount } from "@/types/shelves";

import { type Prisma, type Shelf, Type } from "@/generated/prisma/browser";
import {
  isShelfTypeComingSoon,
  isShelfTypeReady,
} from "@/lib/shelfTypeReadiness";

const FIELD_LABEL_CLASS =
  "text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none";

const LOGO_HIT_PAD_PX = 6;

/**
 * Same logo box as grid ShelfCard; hit/hover grows via padding cancelled by
 * negative margin so the logo stays top-left (no down/right shift).
 * Broken / missing images fall back to the dashed “add logo” CTA so the control
 * never collapses to a 1×1 broken-image glyph.
 */
function ShelfLogoEditControl({
  src,
  onPick,
  addLabel,
  onBroken,
}: {
  src: string | null;
  onPick: () => void;
  addLabel: string;
  /** Clear a dead URL from the form so save does not persist a broken logo. */
  onBroken?: () => void;
}) {
  const bandRef = useRef<HTMLDivElement>(null);
  const [logoMaxHeight, setLogoMaxHeight] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  // Reset the broken-image flag while rendering the new src (React's
  // "adjust state on prop change" pattern) — an effect would paint once with
  // the previous failure state.
  const [renderedSrc, setRenderedSrc] = useState(src);
  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setImageFailed(false);
  }

  useLayoutEffect(() => {
    const band = bandRef.current;
    if (!band || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const height = band.clientHeight;
      setLogoMaxHeight(height > 0 ? height : null);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(band);
    return () => observer.disconnect();
  }, [src]);

  const showAddCta = !src || imageFailed;

  if (showAddCta) {
    return (
      <button
        type="button"
        onClick={onPick}
        aria-label={addLabel}
        className={cn(
          "pointer-events-auto flex min-h-[3.25rem] min-w-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/55 bg-black/25 px-2.5 py-2 text-white shadow-sm backdrop-blur-[1px] transition-colors hover:bg-black/35 cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
        )}
      >
        <ImagePlus className="size-4 shrink-0" aria-hidden />
        <span className="text-[9px] font-semibold uppercase tracking-wider">
          {addLabel}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={bandRef}
      className="flex h-full w-full min-h-0 items-start justify-start"
    >
      <button
        type="button"
        onClick={onPick}
        aria-label={addLabel}
        className={cn(
          "group/logo pointer-events-auto relative inline-flex min-h-8 min-w-8 max-w-full items-start justify-start rounded-lg cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
        )}
        style={{
          padding: LOGO_HIT_PAD_PX,
          margin: -LOGO_HIT_PAD_PX,
        }}
      >
        <RemoteImage
          src={src}
          width={128}
          height={128}
          alt=""
          style={
            logoMaxHeight != null ? { maxHeight: logoMaxHeight } : undefined
          }
          className={cn(
            SHELF_CARD_LOGO_CLASSNAME,
            // max-h-full is a no-op here; band height is applied via style above.
            "max-h-none transition-opacity duration-150",
            "group-hover/logo:opacity-40 group-has-[:focus-visible]/logo:opacity-40",
          )}
          onError={() => {
            setImageFailed(true);
            onBroken?.();
          }}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/35 opacity-0 transition-opacity duration-150 group-hover/logo:opacity-100 group-has-[:focus-visible]/logo:opacity-100">
          <span className="flex size-8 items-center justify-center rounded-full bg-black/45 text-white">
            <ImagePlus className="size-3.5" />
          </span>
        </span>
      </button>
    </div>
  );
}

const TYPE_OPTIONS = Object.values(Type);

// Vibrant bases — punchy at the top of ShelfCard's wash, then fall into dark.
const COLOR_SWATCHES = [
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#22c55e", // green
  "#eab308", // yellow
  "#f97316", // orange
  "#f43f5e", // rose
  "#d946ef", // fuchsia
  "#8b5cf6", // violet
] as const;

export function ShelfModal({
  isOpen,
  onClose,
  onSubmit,
  shelfId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    shelf: Prisma.ShelfUpdateInput | Prisma.ShelfCreateInput,
  ) => Promise<void>;
  shelfId?: Shelf["id"];
}) {
  const { t } = useLocale();
  const logoInputId = useId();
  const cardBackInputId = useId();
  const customColorInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);

  const shelfSchema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t("shelves.nameRequired"))
      .refine((value) => value.trim().length > 0, t("shelves.nameNotEmpty")),
    imageUrl: z.any().refine((url) => {
      if (url instanceof File) return true;
      if (typeof url !== "string" || url.trim() === "") return false;
      return (
        url.startsWith("/uploads/") ||
        isUrl(url) ||
        /^data:image\/[a-zA-Z+]+;base64,[^\s]+$/.test(url)
      );
    }, t("shelves.imageRequired")),
    color: z
      .string()
      .trim()
      .min(1, t("shelves.colorRequired"))
      .refine((value) => {
        try {
          color(value);
          return true;
        } catch {
          return false;
        }
      }, t("shelves.invalidColorFormat")),
    type: z.nativeEnum(Type).refine((value) => isShelfTypeReady(value), {
      message: t("shelf.type.soon"),
    }),
    cardFormat: z.string().default("default"),
    /**
     * The back of this shelf's cards. Optional, and either a URL or a file the
     * collector picks: it is decoration, not data, so nothing goes looking for
     * it — Ravensburger publishes none, and whether others do was never
     * checked. Empty simply means the cards do not turn over.
     */
    cardBackUrl: z.any().refine((value) => {
      if (value instanceof File) return true;
      if (value == null || typeof value !== "string") return value == null;
      if (!value.trim()) return true;
      // The same predicate the API stores by — see `normalizeCardBackUrl`.
      // Split in two, the form once accepted a path the API silently dropped.
      return isCardBackUrl(value);
    }, t("shelves.invalidCardBackUrl")),
  });

  type FormValues = z.infer<typeof shelfSchema>;

  const defaultValues: FormValues = useMemo(
    () => ({
      name: "",
      imageUrl: null,
      color: "#3b82f6",
      type: "games",
      cardFormat: "default",
      cardBackUrl: "",
    }),
    [],
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm({
    resolver: zodResolver(shelfSchema),
    defaultValues,
  });

  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: shelf } = useQuery({
    queryKey: ["shelf", shelfId],
    queryFn: () => getShelf(shelfId),
    enabled: !!shelfId,
    // List cache has counts/bestItem but no `items` — seed as empty until fetch.
    placeholderData: () => {
      if (!shelfId) return undefined;
      const cached = queryClient
        .getQueryData<ShelfWithItemCount[]>(["shelves"])
        ?.find((s) => s.id === shelfId);
      if (!cached) return undefined;
      return { ...cached, items: [] };
    },
  });

  const previewBestItem = useMemo((): ShelfBestItem | null => {
    if (!shelfId) return null;
    const fromShelf = (shelf as { bestItem?: ShelfBestItem | null } | undefined)
      ?.bestItem;
    if (fromShelf) return fromShelf;
    return (
      queryClient
        .getQueryData<ShelfWithItemCount[]>(["shelves"])
        ?.find((s) => s.id === shelfId)?.bestItem ?? null
    );
  }, [shelf, shelfId, queryClient]);

  const { mutate: mutateDelete } = useMutation({
    mutationFn: deleteShelf,
    onSuccess: () => {
      toast.success(t("shelves.shelfDeleted", { name: shelf?.name }));
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
      handleClose();
      router.push(`/shelves`);
    },
    onError: (error: unknown) => {
      const axiosError = error as {
        response?: { status?: number; data?: { itemCount?: number } };
      };
      if (
        axiosError.response?.status === 409 &&
        typeof axiosError.response.data?.itemCount === "number"
      ) {
        toast.error(
          t("shelves.deleteNotEmpty").replace(
            "{count}",
            String(axiosError.response.data.itemCount),
          ),
        );
        return;
      }
      toast.error(t("shelves.deleteFailed"));
    },
  });
  const { reset } = form;

  const selectedType = useWatch({ control: form.control, name: "type" });
  const watchedCardFormat = useWatch({
    control: form.control,
    name: "cardFormat",
  });
  const watchedColor = useWatch({ control: form.control, name: "color" });
  const watchedName = useWatch({ control: form.control, name: "name" });
  const watchedImage = useWatch({ control: form.control, name: "imageUrl" });
  const imageError = form.formState.errors.imageUrl;

  // If the chosen shape is the type's Default alias, store Default (no duplicate).
  useEffect(() => {
    const coerced = coerceCardFormatForType(watchedCardFormat, selectedType);
    if (watchedCardFormat !== coerced) {
      form.setValue("cardFormat", coerced, { shouldDirty: false });
    }
  }, [watchedCardFormat, selectedType, form]);

  const watchedCardBack = useWatch({
    control: form.control,
    name: "cardBackUrl",
  });

  /** What the field shows: a picked file's blob, or the URL as given. */
  const cardBackPreviewSrc = useMemo(() => {
    if (typeof File !== "undefined" && watchedCardBack instanceof File) {
      return URL.createObjectURL(watchedCardBack);
    }
    return typeof watchedCardBack === "string" && watchedCardBack.trim()
      ? watchedCardBack
      : null;
  }, [watchedCardBack]);

  useEffect(() => {
    if (!(typeof File !== "undefined" && watchedCardBack instanceof File)) {
      return;
    }
    if (!cardBackPreviewSrc) return;
    return () => URL.revokeObjectURL(cardBackPreviewSrc);
  }, [watchedCardBack, cardBackPreviewSrc]);

  const setCardBackFile = (file: File | null) => {
    if (!file) {
      form.setValue("cardBackUrl", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error(t("shelves.invalidImageFile"));
      return;
    }
    form.setValue("cardBackUrl", file, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const previewImageSrc = useMemo(() => {
    if (typeof File !== "undefined" && watchedImage instanceof File) {
      return URL.createObjectURL(watchedImage);
    }
    if (typeof watchedImage === "string" && watchedImage.trim() !== "") {
      return watchedImage;
    }
    return null;
  }, [watchedImage]);

  useEffect(() => {
    if (!(typeof File !== "undefined" && watchedImage instanceof File)) return;
    if (!previewImageSrc) return;
    return () => {
      URL.revokeObjectURL(previewImageSrc);
    };
  }, [watchedImage, previewImageSrc]);

  const displayName = watchedName?.trim() || t("shelves.previewPlaceholder");

  const defaultFormatDescription = useMemo(() => {
    let typeName: string;
    switch (selectedType) {
      case "musics":
        typeName = t("shelf.type.musics");
        break;
      case "boardgames":
        typeName = t("shelf.type.boardgames");
        break;
      case "hardware":
        typeName = t("shelf.type.hardware");
        break;
      case "tcg":
        typeName = t("shelf.type.tcg");
        break;
      case "toys":
        typeName = t("shelf.type.toys");
        break;
      case "movies":
        typeName = t("shelf.type.movies");
        break;
      case "books":
        typeName = t("shelf.type.books");
        break;
      case "games":
      default:
        typeName = t("shelf.type.games");
        break;
    }
    return t("shelves.cardFormats.default").replace("{type}", typeName);
  }, [selectedType, t]);

  const getCardFormatLabel = (format: CardFormat) => {
    if (format !== "default") {
      return t(`shelves.cardFormatsShort.${format}`);
    }
    const alias = getDefaultCardFormatAlias(selectedType);
    return t("shelves.cardFormatsShort.defaultNamed").replace(
      "{shape}",
      t(`shelves.cardFormatsShort.${alias}`),
    );
  };

  const getCardFormatDescription = (format: CardFormat) =>
    format === "default"
      ? defaultFormatDescription
      : t(`shelves.cardFormats.${format}`);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!isOpen) return;

    if (justOpened) {
      setIsDraggingLogo(false);
      if (!shelfId) {
        reset(defaultValues);
      }
    }

    if (shelfId && shelf) {
      reset({
        type: shelf.type || defaultValues.type,
        name: shelf.name || defaultValues.name,
        imageUrl: shelf.imageUrl || defaultValues.imageUrl,
        color: shelf.color || defaultValues.color,
        cardFormat: shelf.cardFormat || defaultValues.cardFormat,
        cardBackUrl: shelf.cardBackUrl || "",
      });
    }
  }, [isOpen, shelf, shelfId, reset, defaultValues]);

  const openLogoPicker = () => {
    document.getElementById(logoInputId)?.click();
  };

  const setLogoFile = (file: File | null) => {
    if (!file) {
      form.setValue("imageUrl", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error(t("shelves.invalidImageFile"));
      form.setValue("imageUrl", null, { shouldValidate: true });
      return;
    }
    form.setValue("imageUrl", file, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      let imageUrl: FormValues["imageUrl"] = values.imageUrl;
      if (imageUrl && imageUrl instanceof File) {
        imageUrl = await uploadImage(imageUrl, { trim: false });
      }

      // The back is a card face, so it keeps its borders: trimming would eat
      // the printed edge that makes it look like a card at all.
      let cardBackUrl: FormValues["cardBackUrl"] = values.cardBackUrl;
      if (cardBackUrl && cardBackUrl instanceof File) {
        cardBackUrl = await uploadImage(cardBackUrl, { trim: false });
      }

      const updatedShelf: Prisma.ShelfUpdateInput | Prisma.ShelfCreateInput = {
        ...values,
        id: shelf ? shelf?.id : undefined,
        imageUrl: imageUrl,
        cardBackUrl:
          typeof cardBackUrl === "string" && cardBackUrl.trim()
            ? cardBackUrl.trim()
            : null,
      };

      await onSubmit(updatedShelf);
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Failed to save shelf");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!shelf?.id) return;
    setIsDeleting(true);
    try {
      await mutateDelete(shelf.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    reset();
    setIsDraggingLogo(false);
    onClose();
  };

  const colorsMatch = (a: string, b: string) => {
    try {
      return color(a).hex().toLowerCase() === color(b).hex().toLowerCase();
    } catch {
      return a === b;
    }
  };

  const isCustomColor = !COLOR_SWATCHES.some((swatch) =>
    colorsMatch(swatch, watchedColor || ""),
  );

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={handleClose}
        title={
          <span className="block text-left">
            {shelf
              ? `${t("shelves.editShelf")} : ${shelf.name}`
              : t("shelves.addShelf")}
          </span>
        }
        description={
          <span className="block text-left">
            {shelf
              ? t("shelves.editShelfDetails")
              : t("shelves.createNewShelfDetails")}
          </span>
        }
        size="lg"
        customChildren={true}
        footer={null}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,15.5rem)_minmax(0,1fr)] gap-5 md:gap-8 items-start">
                {/* Preview column — compact tile, not half the modal */}
                <div className="w-full max-w-[15.5rem] mx-auto md:mx-0 md:sticky md:top-0">
                  <FormField
                    control={form.control}
                    name="imageUrl"
                    render={() => (
                      <FormItem className="space-y-2">
                        <input
                          id={logoInputId}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            setLogoFile(e.target.files?.[0] || null);
                            e.target.value = "";
                          }}
                        />
                        <div
                          className={cn(
                            "rounded-2xl transition-all duration-200",
                            imageError &&
                              "ring-2 ring-destructive/40 ring-offset-2 ring-offset-background",
                            isDraggingLogo &&
                              "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                          )}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            setIsDraggingLogo(true);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDraggingLogo(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            if (
                              !e.currentTarget.contains(e.relatedTarget as Node)
                            ) {
                              setIsDraggingLogo(false);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingLogo(false);
                            const file = e.dataTransfer.files?.[0] || null;
                            if (file) setLogoFile(file);
                          }}
                        >
                          <ShelfCard
                            interactive={false}
                            name={displayName}
                            color={watchedColor}
                            imageUrl={previewImageSrc}
                            bestItem={previewBestItem}
                            className="shadow-md"
                            logoAccessory={
                              <ShelfLogoEditControl
                                src={previewImageSrc}
                                onPick={openLogoPicker}
                                addLabel={t("shelves.addLogo")}
                                onBroken={() => setLogoFile(null)}
                              />
                            }
                          >
                            {previewImageSrc && (
                              <button
                                type="button"
                                onClick={() => setLogoFile(null)}
                                className="absolute top-3 right-3 z-2 rounded-full bg-black/40 p-1.5 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55 cursor-pointer"
                                aria-label={t("shelves.removeLogo")}
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                            {isDraggingLogo && (
                              <div className="absolute inset-0 z-2 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
                                <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-5 py-4 text-white">
                                  <ImagePlus className="size-6" />
                                  <span className="text-xs font-semibold">
                                    {t("shelves.dropLogo")}
                                  </span>
                                </div>
                              </div>
                            )}
                          </ShelfCard>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Controls column */}
                <div className="space-y-5">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={FIELD_LABEL_CLASS}>
                          {t("common.name")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("shelves.shelfName")}
                            className="h-11 text-sm rounded-xl border-border/70 bg-transparent focus-visible:ring-primary/20"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={FIELD_LABEL_CLASS}>
                          {t("common.type")}
                        </FormLabel>
                        <div
                          role="radiogroup"
                          aria-label={t("common.type")}
                          className="flex flex-wrap gap-1.5"
                        >
                          {TYPE_OPTIONS.map((type) => {
                            const selected = field.value === type;
                            const comingSoon = isShelfTypeComingSoon(type);
                            return (
                              <button
                                key={type}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                aria-disabled={comingSoon}
                                disabled={comingSoon}
                                title={
                                  comingSoon ? t("shelf.type.soon") : undefined
                                }
                                onClick={() => {
                                  if (comingSoon) return;
                                  field.onChange(type);
                                }}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                                  comingSoon
                                    ? "cursor-not-allowed opacity-45 bg-zinc-100 text-muted-foreground dark:bg-zinc-900"
                                    : "cursor-pointer",
                                  !comingSoon && selected
                                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                                    : !comingSoon
                                      ? "bg-zinc-100 text-muted-foreground hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                                      : null,
                                )}
                              >
                                <ShelfTypeIcon
                                  type={type}
                                  className="size-3.5"
                                />
                                <span>{t(`shelf.type.${type}`)}</span>
                                {comingSoon ? (
                                  <span className="rounded-full bg-zinc-200/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground dark:bg-zinc-800">
                                    {t("shelf.type.soon")}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={FIELD_LABEL_CLASS}>
                          {t("common.color")}
                        </FormLabel>
                        <div className="flex flex-wrap items-center gap-2">
                          {COLOR_SWATCHES.map((swatch) => {
                            const selected = colorsMatch(
                              swatch,
                              field.value || "",
                            );
                            return (
                              <button
                                key={swatch}
                                type="button"
                                aria-label={swatch}
                                aria-pressed={selected}
                                onClick={() => field.onChange(swatch)}
                                className={cn(
                                  "size-8 rounded-full border transition-all duration-150 cursor-pointer",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                                  selected
                                    ? "scale-110 ring-2 ring-offset-2 ring-zinc-900 dark:ring-white ring-offset-background"
                                    : "border-black/10 dark:border-white/15 hover:scale-105",
                                )}
                                style={{ backgroundColor: swatch }}
                              />
                            );
                          })}
                          <button
                            type="button"
                            aria-label={t("common.chooseColor")}
                            onClick={() => customColorInputRef.current?.click()}
                            className={cn(
                              "relative size-8 rounded-full border border-dashed border-zinc-400/70 dark:border-zinc-500 flex items-center justify-center transition-all duration-150 cursor-pointer",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                              "hover:scale-105",
                              isCustomColor &&
                                "ring-2 ring-offset-2 ring-zinc-900 dark:ring-white ring-offset-background scale-110 border-solid",
                            )}
                            style={
                              isCustomColor
                                ? { backgroundColor: field.value }
                                : undefined
                            }
                          >
                            {!isCustomColor && (
                              <Plus className="size-3.5 text-muted-foreground" />
                            )}
                            <input
                              ref={customColorInputRef}
                              type="color"
                              className="sr-only"
                              value={(() => {
                                try {
                                  return color(field.value || "#3b82f6").hex();
                                } catch {
                                  return "#3b82f6";
                                }
                              })()}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cardBackUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={FIELD_LABEL_CLASS}>
                          {t("shelves.cardBackUrl")}
                        </FormLabel>
                        <input
                          id={cardBackInputId}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            setCardBackFile(event.target.files?.[0] || null);
                            event.target.value = "";
                          }}
                        />
                        <div className="flex items-start gap-3">
                          {/* The preview is card-shaped: a back that turns out
                              to be the wrong crop is obvious here rather than
                              only once a card is flipped. */}
                          <button
                            type="button"
                            onClick={() =>
                              document.getElementById(cardBackInputId)?.click()
                            }
                            className="relative aspect-[5/7] w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40 transition-colors hover:border-foreground/30"
                          >
                            {cardBackPreviewSrc ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={cardBackPreviewSrc}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <Upload className="absolute inset-0 m-auto size-4 text-muted-foreground" />
                            )}
                          </button>

                          <div className="flex-1 space-y-2">
                            <FormControl>
                              <Input
                                value={
                                  field.value instanceof File
                                    ? field.value.name
                                    : (field.value ?? "")
                                }
                                readOnly={field.value instanceof File}
                                onChange={(event) =>
                                  field.onChange(event.target.value)
                                }
                                inputMode="url"
                                placeholder="https://…"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              {t("shelves.cardBackUrlHint")}
                            </p>
                            {field.value ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => field.onChange(null)}
                              >
                                {t("shelves.clearCardBack")}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cardFormat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={FIELD_LABEL_CLASS}>
                          {t("shelves.cardFormat")}
                        </FormLabel>
                        <CardFormatPicker
                          value={field.value || "default"}
                          onChange={field.onChange}
                          shelfType={selectedType}
                          getLabel={getCardFormatLabel}
                          getDescription={getCardFormatDescription}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 md:p-5 border-t border-border/60 dark:border-zinc-900/60 bg-zinc-50/30 dark:bg-zinc-950/30 shrink-0 flex flex-row items-center justify-end gap-2 w-full">
              {shelf?.id && (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto rounded-xl h-10 px-5 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                >
                  {t("shelves.deleteShelf")}
                </Button>
              )}

              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                className="rounded-xl h-10 px-5 text-xs font-semibold border-border hover:bg-accent cursor-pointer active:scale-[0.98] transition-all"
                disabled={isSubmitting || isDeleting}
              >
                {t("shelves.cancel")}
              </Button>

              <Button
                variant="default"
                type="submit"
                className="rounded-xl h-10 px-5 text-xs font-semibold bg-primary hover:bg-primary/95 shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                disabled={isSubmitting || isDeleting}
              >
                {isSubmitting && (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                )}
                {shelf ? t("shelves.saveChanges") : t("shelves.addShelf")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </BaseModal>

      <BaseModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t("shelves.confirmDeletion")}
        description={t("shelves.deleteConfirmMessage")}
        size="sm"
        onCancel={() => setShowDeleteConfirm(false)}
        onDelete={handleDelete}
        deleteLabel={t("shelves.deleteShelf")}
        isDeleting={isDeleting}
        cancelLabel={t("shelves.cancel")}
      >
        <div className="hidden" />
      </BaseModal>
    </>
  );
}
