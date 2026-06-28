/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  SparklesIcon,
  XIcon,
  Loader2,
  Upload,
  Link as LinkIcon,
  Check,
  Settings,
  Image as ImageIcon,
  Info,
  Maximize2,
} from "lucide-react";
import Image from "next/image";
import { RemoteImage } from "@/components/RemoteImage";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { BaseModal } from "@/components/modals/BaseModal";
import { ImagePickerField } from "@/components/modals/ImagePickerField";
import { ScannerButton } from "@/components/ScannerButton";
import { ConditionIcon } from "@/components/ConditionIcon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";

import { isUrl } from "@/lib/core/isUrl";
import { useDebounce } from "@/lib/client/hooks/useDebounce";
import { deleteItem, getItem } from "@/lib/api/items";
import { getShelf, getShelves } from "@/lib/api/shelves";
import { uploadImage } from "@/lib/api/upload";
import { getAspectRatio } from "@/lib/text/cardFormat";
import {
  itemsBarcodeLabelKey,
  itemsBarcodePlaceholderKey,
  scannerBarcodePlaceholderKey,
  scannerEnterBarcodeKey,
} from "@/lib/barcode/shelfLabels";
import { shelfPath } from "@/lib/routing/slugs";

import {
  type AttachmentType,
  type Prisma,
  type Item,
  type Shelf,
  Condition,
} from "@prisma/client";
import {
  mergeCoverAttachmentsForPicker,
  resolveMetadataCoverUrl,
  filterMetadataForShelfPlatform,
} from "@/lib/item/media";
import { stripCropSuffixFromUrl, urlsReferToSameLocalizedImage } from "@/lib/media/coverUrl";
import {
  getAttachmentGalleryLabels,
  type AttachmentDisplayLocale,
} from "@/lib/media/attachmentDisplayLabels";
import { cn } from "@/lib/core/utils";
import type { ItemWithMetadata } from "@/types/items";
import type { MetadataResult } from "@/types/metadataProvider";
import { getMetadataPreview, getMetadataSuggestions } from "@/lib/api/metadata";
import { useRefetchItemWhenMetadataIdle } from "@/lib/item/useRefetchItemWhenMetadataIdle";
import { invalidateItemQueries } from "@/lib/item/queryCache";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function ShelfIcon({ type, className }: { type: string; className?: string }) {
  return (
    <ShelfTypeIcon type={type} className={cn("size-4 shrink-0", className)} />
  );
}

function attachmentTraitsOf(attachment: unknown) {
  const traits = attachment as
    | {
        isRealBoxCoverSource?: boolean;
        isFullWrapCoverSource?: boolean;
        isGameMediaGallerySource?: boolean;
        isMusicGallerySource?: boolean;
        providerImageScoreAdjustment?: number;
        providerLabel?: string | null;
      }
    | null
    | undefined;
  return {
    isRealBoxCoverSource: traits?.isRealBoxCoverSource,
    isFullWrapCoverSource: traits?.isFullWrapCoverSource,
    isGameMediaGallerySource: traits?.isGameMediaGallerySource,
    isMusicGallerySource: traits?.isMusicGallerySource,
    providerImageScoreAdjustment: traits?.providerImageScoreAdjustment,
    providerLabel: traits?.providerLabel,
  };
}

export function ItemModal({
  isOpen,
  onClose,
  onSubmit,
  itemId,
  shelfId,
  shelfType,
  defaultTab,
  prefilledValues,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    item: Prisma.ItemUpdateInput | Prisma.ItemCreateInput,
  ) => Promise<void>;
  itemId?: Item["id"];
  shelfId: Shelf["id"];
  shelfType?: Shelf["type"];
  defaultTab?: "general" | "poster" | "background" | "info";
  prefilledValues?: {
    name?: string;
    barcode?: string;
    imageUrl?: string | null;
    shelfId?: string;
    metadataPreview?: MetadataResult | null;
  };
}) {
  const { t, locale } = useLocale();

  const itemSchema = z.object({
    shelfId: z.string().trim().min(1, t("items.shelfIdRequired")),

    name: z
      .string()
      .trim()
      .min(1, t("items.nameRequired"))
      .refine((value) => value.trim().length > 0, t("items.nameNotEmpty")),

    barcode: z.string().trim().optional(),

    description: z.string().trim().optional(),

    condition: z.nativeEnum(Condition),

    imageUrl: z
      .any()
      .refine(
        (url) =>
          url == null ||
          url instanceof File ||
          (typeof url === "string" && url.startsWith("/uploads/")) ||
          isUrl(url) ||
          /^data:image\/[a-zA-Z+]+;base64,[^\s]+$/.test(url),
        t("items.invalidImage"),
      )
      .optional(),

    backgroundImageUrl: z
      .any()
      .refine(
        (url) =>
          url == null ||
          url instanceof File ||
          (typeof url === "string" && url.startsWith("/uploads/")) ||
          isUrl(url) ||
          /^data:image\/[a-zA-Z+]+;base64,[^\s]+$/.test(url),
        t("items.invalidImage"),
      )
      .optional(),
  });

  type FormValues = z.infer<typeof itemSchema>;

  const defaultValues: FormValues = useMemo(
    () => ({
      shelfId: prefilledValues?.shelfId || shelfId || "",
      name: prefilledValues?.name || "",
      imageUrl: prefilledValues?.imageUrl || null,
      backgroundImageUrl: null,
      description: "",
      barcode: prefilledValues?.barcode || "",
      condition: "used",
    }),
    [shelfId, prefilledValues],
  );

  const form = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues,
  });
  const { isDirty } = form.formState;

  const debounce = useDebounce(1000);

  const queryClient = useQueryClient();

  const { data: item } = useQuery<ItemWithMetadata>({
    queryKey: ["shelf", shelfId, "items", itemId],
    queryFn: () => getItem(itemId!, shelfId),
    enabled: Boolean(isOpen && itemId && shelfId),
    refetchOnMount: "always",
    initialData: () =>
      queryClient.getQueryData<ItemWithMetadata>([
        "shelf",
        shelfId,
        "items",
        itemId,
      ]),
  });

  useRefetchItemWhenMetadataIdle(queryClient, item, shelfId);

  const { data: shelf } = useQuery<Shelf>({
    queryKey: ["shelf", shelfId],
    queryFn: () => getShelf(shelfId),
    enabled: !!shelfId,
  });

  const { data: shelves } = useQuery<Shelf[]>({
    queryKey: ["shelves"],
    queryFn: () => getShelves(),
    enabled: isOpen,
  });

  const hasPrefilledScanImage =
    !itemId &&
    typeof prefilledValues?.imageUrl === "string" &&
    prefilledValues.imageUrl.trim().length > 0;
  const prefilledScanImageUrl = hasPrefilledScanImage
    ? prefilledValues?.imageUrl?.trim() || null
    : null;

  const currentShelfId = form.watch("shelfId");
  const selectedShelf = shelves?.find((s) => s.id === currentShelfId);
  const activeShelfType = selectedShelf?.type || shelfType;
  const activeShelf = selectedShelf || shelf;

  const activeShelfForMedia = useMemo(
    () => ({
      type: activeShelfType,
      name:
        activeShelf?.name ??
        shelves?.find((entry) => entry.id === currentShelfId)?.name ??
        shelves?.find((entry) => entry.id === shelfId)?.name ??
        item?.shelf?.name ??
        shelf?.name ??
        currentShelfId ??
        shelfId,
    }),
    [
      activeShelf?.name,
      activeShelfType,
      currentShelfId,
      item?.shelf?.name,
      shelf?.name,
      shelfId,
      shelves,
    ],
  );

  const itemAspectRatio = useMemo(() => {
    return getAspectRatio(
      activeShelf?.cardFormat,
      activeShelf?.type || shelfType,
    );
  }, [activeShelf, shelfType]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [nameSuggestion, setNameSuggestion] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [guessedShelfId, setGuessedShelfId] = useState<string | null>(null);
  const metadataPreviewRequestRef = useRef<string | null>(null);
  const metadataSuggestionsRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      metadataPreviewRequestRef.current = null;
      metadataSuggestionsRequestRef.current = null;
      setPosterPage(1);
      setBgPage(1);
      if (prefilledValues?.shelfId) {
        setGuessedShelfId(prefilledValues.shelfId);
      } else {
        setGuessedShelfId(null);
      }
      if (prefilledValues?.name) {
        setNameSuggestion(prefilledValues.name);
      } else {
        setNameSuggestion(null);
      }
    }
  }, [isOpen, prefilledValues]);

  const isNameMatchingSuggestion = useMemo(() => {
    if (!nameSuggestion) return false;
    const val = (form.watch("name") || "").trim().toLowerCase();
    if (val === nameSuggestion.trim().toLowerCase()) return true;
    return suggestions.some((s) => s.trim().toLowerCase() === val);
  }, [form.watch("name"), nameSuggestion, suggestions]);
  const [showDropdown, setShowDropdown] = useState(false);
  interface GameMatch {
    name: string;
    suggestions: string[];
    coverUrl?: string | null;
  }
  const [matches, setMatches] = useState<GameMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<GameMatch | null>(null);

  const [activeTab, setActiveTab] = useState<
    "general" | "poster" | "background" | "info"
  >("general");

  const [initializedItemId, setInitializedItemId] = useState<
    string | null | undefined
  >(undefined);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("");
  const [showGenUrlInput, setShowGenUrlInput] = useState(false);
  const [genUrlInputValue, setGenUrlInputValue] = useState("");

  const [showBgUrlInput, setShowBgUrlInput] = useState(false);
  const [bgUrlInputValue, setBgUrlInputValue] = useState("");
  const [lastInitializedShelfId, setLastInitializedShelfId] = useState<
    string | null
  >(null);
  const lastMetadataStampRef = useRef<string | null>(null);

  const [fetchedMetadata, setFetchedMetadata] = useState<MetadataResult | null>(
    null,
  );
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [posterPage, setPosterPage] = useState(1);
  const [bgPage, setBgPage] = useState(1);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const applyMetadataPreviewToForm = useCallback(
    (
      metadata: MetadataResult,
      options: {
        forceOverwrite?: boolean;
        barcodeContext?: string;
      } = {},
    ) => {
      const forceOverwrite = options.forceOverwrite ?? false;
      const barcodeContext = options.barcodeContext;

      setFetchedMetadata(
        filterMetadataForShelfPlatform(metadata, activeShelfForMedia) ?? metadata,
      );

      const currentBarcode = (
        barcodeContext ||
        form.getValues("barcode") ||
        ""
      ).trim();
      if (metadata.barcode && !currentBarcode) {
        form.setValue("barcode", metadata.barcode, {
          shouldDirty: true,
        });
      }

      if (metadata.description?.trim()) {
        if (forceOverwrite || !form.getValues("description")?.trim()) {
          form.setValue("description", metadata.description.trim(), {
            shouldDirty: true,
          });
        }
      }

      if (metadata.imageUrl) {
        const currentImageUrl = form.getValues("imageUrl");
        const canReplaceScanImage =
          activeShelfType === "games" &&
          hasPrefilledScanImage &&
          typeof currentImageUrl === "string" &&
          currentImageUrl.trim() === prefilledScanImageUrl;

        if (forceOverwrite || !currentImageUrl || canReplaceScanImage) {
          form.setValue("imageUrl", metadata.imageUrl, {
            shouldDirty: true,
          });
        }
      }

      const bgAttachment =
        metadata.attachments?.find((a) => a.type === "background") ||
        metadata.attachments?.find((a) => a.type === "screenshot") ||
        metadata.attachments?.find((a) => a.type === "artwork");
      if (bgAttachment?.url) {
        if (forceOverwrite || !form.getValues("backgroundImageUrl")) {
          form.setValue("backgroundImageUrl", bgAttachment.url, {
            shouldDirty: true,
          });
        }
      }
    },
    [activeShelfForMedia, activeShelfType, form, hasPrefilledScanImage, prefilledScanImageUrl],
  );

  const fetchMetadataPreview = useCallback(
    async (name: string, barcode?: string, forceOverwrite = false) => {
      if (!name || !activeShelfType) return;
      const requestKey = [
        activeShelfType,
        activeShelf?.name || "",
        name.trim().toLowerCase(),
        (barcode || "").trim(),
      ].join("|");
      metadataPreviewRequestRef.current = requestKey;
      setIsFetchingMetadata(true);
      try {
        const metadata = await getMetadataPreview(
          name,
          activeShelfType,
          barcode || null,
          null,
          activeShelf?.name || null,
        );
        if (metadataPreviewRequestRef.current !== requestKey) return;
        if (metadata) {
          applyMetadataPreviewToForm(metadata, {
            forceOverwrite,
            barcodeContext: barcode,
          });
        }
      } catch (err) {
        console.error("Error fetching metadata preview:", err);
      } finally {
        if (metadataPreviewRequestRef.current === requestKey) {
          setIsFetchingMetadata(false);
        }
      }
    },
    [activeShelfType, activeShelf?.name, applyMetadataPreviewToForm],
  );

  const fetchNameSuggestions = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length < 2 || !activeShelfType) return;

      const requestKey = `${activeShelfType}|${trimmed.toLowerCase()}`;
      metadataSuggestionsRequestRef.current = requestKey;

      try {
        const nextSuggestions = await getMetadataSuggestions(
          trimmed,
          activeShelfType,
          null,
          activeShelf?.name || null,
        );

        if (metadataSuggestionsRequestRef.current !== requestKey) return;
        if (!nextSuggestions || nextSuggestions.length === 0) return;

        const cleanSuggestions = Array.from(
          new Set(nextSuggestions.filter((suggestion) => suggestion.trim())),
        );
        setSuggestions(cleanSuggestions);
        setNameSuggestion(cleanSuggestions[0] || null);
      } catch (err) {
        console.error("Error fetching name suggestions:", err);
      }
    },
    [activeShelf?.name, activeShelfType],
  );

  const handleNameChange = useCallback(
    (name: string) => {
      if (!name.trim()) {
        setSuggestions([]);
        setNameSuggestion(null);
        return;
      }
      const barcode = form.getValues("barcode") || "";
      debounce(() => {
        fetchMetadataPreview(name, barcode);
        fetchNameSuggestions(name);
      });
    },
    [form, debounce, fetchMetadataPreview, fetchNameSuggestions],
  );

  const availableBackgrounds = useMemo(() => {
    const metadata = filterMetadataForShelfPlatform(
      item?.metadata || fetchedMetadata,
      activeShelfForMedia,
    );
    if (!metadata) return [];

    const urls = new Set<string>();
    const list: {
      url: string;
      type: string;
      label: string;
      source?: string | null;
      role?: string | null;
      galleryProvider?: string | null;
      galleryDetail?: string | null;
    }[] = [];

    const displayLocale: AttachmentDisplayLocale =
      locale === "en" ? "en" : "fr";

    // Add attachments of type background, artwork, screenshot, image
    const attachments = metadata.attachments || [];
    attachments.forEach((a: any) => {
      if (
        a.url &&
        !urls.has(a.url) &&
        ["background", "artwork", "screenshot", "image"].includes(a.type)
      ) {
        urls.add(a.url);
        const gallery = getAttachmentGalleryLabels(
          {
            type: a.type,
            role: a.role,
            title: a.title,
            source: a.source,
            providerLabel: a.providerLabel,
          },
          displayLocale,
        );
        list.push({
          url: a.url,
          type: a.type,
          label: gallery.caption,
          source: a.source,
          role: a.role,
          galleryProvider: gallery.provider,
          galleryDetail: gallery.detail,
        });
      }
    });

    return list;
  }, [item?.metadata, fetchedMetadata, locale]);

  const currentBackgroundUrl = form.watch("backgroundImageUrl");

  const finalBackgrounds = useMemo(() => {
    const list = [...availableBackgrounds];

    if (
      currentBackgroundUrl &&
      typeof currentBackgroundUrl === "string" &&
      !availableBackgrounds.some((img) => img.url === currentBackgroundUrl)
    ) {
      list.unshift({
        url: currentBackgroundUrl,
        type: "custom",
        label: t("items.editTabs.chooseImage"),
      });
    }

    return list;
  }, [availableBackgrounds, currentBackgroundUrl, t]);

  const totalBgPages = useMemo(
    () => Math.ceil(finalBackgrounds.length / 12) || 1,
    [finalBackgrounds.length],
  );
  const currentBgPage = useMemo(
    () => Math.min(bgPage, totalBgPages),
    [bgPage, totalBgPages],
  );

  const availableImages = useMemo(() => {
    const rawMetadata =
      itemId && item?.metadata ? item.metadata : (item?.metadata ?? fetchedMetadata);
    const metadata = filterMetadataForShelfPlatform(
      rawMetadata,
      activeShelfForMedia,
    );

    const urls = new Set<string>();
    const attachments: Array<{
      type: AttachmentType;
      url: string;
      source?: string | null;
      role?: string | null;
      title?: string | null;
      isRealBoxCoverSource?: boolean;
      isFullWrapCoverSource?: boolean;
      isGameMediaGallerySource?: boolean;
      isMusicGallerySource?: boolean;
      providerImageScoreAdjustment?: number;
      providerLabel?: string | null;
    }> = [];

    const displayLocale: AttachmentDisplayLocale =
      locale === "en" ? "en" : "fr";

    const addAttachment = (entry: {
      type: AttachmentType | string;
      url: string;
      source?: string | null;
      role?: string | null;
      title?: string | null;
      isRealBoxCoverSource?: boolean;
      isFullWrapCoverSource?: boolean;
      isGameMediaGallerySource?: boolean;
      isMusicGallerySource?: boolean;
      providerImageScoreAdjustment?: number;
      providerLabel?: string | null;
    }) => {
      if (!entry.url || urls.has(entry.url)) return;
      urls.add(entry.url);
      attachments.push({
        type: entry.type as AttachmentType,
        url: entry.url,
        source: entry.source,
        role: entry.role,
        title: entry.title,
        isRealBoxCoverSource: entry.isRealBoxCoverSource,
        isFullWrapCoverSource: entry.isFullWrapCoverSource,
        isGameMediaGallerySource: entry.isGameMediaGallerySource,
        isMusicGallerySource: entry.isMusicGallerySource,
        providerImageScoreAdjustment: entry.providerImageScoreAdjustment,
        providerLabel: entry.providerLabel,
      });
    };

    // URLs that already exist as real metadata attachments, with their true
    // type/source. The currently-selected cover is almost always one of these;
    // re-injecting it below as a transient "barcode"/"image" entry would give it
    // a different score and rank, so the whole list reordered every time the
    // selection changed. Only inject the scanned/selected cover when it is NOT
    // already a metadata attachment (e.g. a fresh scan not yet in metadata).
    const metadataImageUrls = new Set<string>();
    if (metadata?.imageUrl) metadataImageUrls.add(metadata.imageUrl);
    for (const attachment of metadata?.attachments || []) {
      if (attachment.url) metadataImageUrls.add(attachment.url);
    }

    // The stored cover is cropped to a new "_crop" file, so its URL no longer
    // matches the gallery attachment it was derived from. Index attachments by
    // their crop-normalized URL so the cover still inherits its real provenance
    // (source + region role) instead of looking like an orphan.
    const stripCrop = stripCropSuffixFromUrl;
    const attachmentByNormalizedUrl = new Map<string, any>();
    for (const attachment of metadata?.attachments || []) {
      if (attachment.url) {
        attachmentByNormalizedUrl.set(stripCrop(attachment.url), attachment);
      }
    }

    // A freshly-scanned cover (prefill, usually a remote URL not yet enriched)
    // is the only thing that should read as "Scan".
    const scannedCover = prefilledValues?.imageUrl;
    if (
      scannedCover &&
      typeof scannedCover === "string" &&
      !metadataImageUrls.has(scannedCover)
    ) {
      addAttachment({
        url: scannedCover,
        type: activeShelfType === "games" ? "image" : "cover",
        source: "barcode",
      });
    }

    // A persisted local cover keeps the provenance of the attachment it was
    // cropped from (so its region badge survives); it falls back to the user's
    // own selection — never "Scan".
    const persistedCover = item?.imageUrl;
    if (
      persistedCover &&
      typeof persistedCover === "string" &&
      persistedCover !== scannedCover &&
      !metadataImageUrls.has(persistedCover)
    ) {
      const matching = attachmentByNormalizedUrl.get(stripCrop(persistedCover));
      addAttachment({
        url: persistedCover,
        type:
          matching?.type || (activeShelfType === "games" ? "image" : "cover"),
        source: matching?.source || "user",
        role: matching?.role,
        title: matching?.title,
        ...attachmentTraitsOf(matching),
      });
    }

    // The current cover is usually a cropped derivative of one gallery image.
    // Once that crop is shown as the cover, its uncropped twin is a redundant
    // duplicate — drop it from the list. (It comes back automatically when the
    // user selects a different cover, since the gallery is rebuilt uncropped.)
    const currentCover = item?.imageUrl;
    const isRedundantTwinOfCover = (url: string) =>
      typeof currentCover === "string" &&
      url !== currentCover &&
      stripCrop(url) === stripCrop(currentCover);

    if (metadata) {
      if (metadata.imageUrl && !isRedundantTwinOfCover(metadata.imageUrl)) {
        const matchingAttachment = metadata.attachments?.find(
          (a: any) => a.url === metadata.imageUrl,
        );
        addAttachment({
          url: metadata.imageUrl,
          type: "cover",
          source: matchingAttachment?.source || "metadata",
          role: matchingAttachment?.role,
          title: matchingAttachment?.title,
          ...attachmentTraitsOf(matchingAttachment),
        });
      }

      for (const attachment of metadata.attachments || []) {
        if (
          attachment.url &&
          ["cover", "artwork", "image"].includes(attachment.type) &&
          !isRedundantTwinOfCover(attachment.url)
        ) {
          addAttachment({
            url: attachment.url,
            type: attachment.type,
            source: attachment.source,
            role: attachment.role,
            title: attachment.title,
            ...attachmentTraitsOf(attachment),
          });
        }
      }
    }

    const defaultCoverUrl = resolveMetadataCoverUrl({
      metadata,
      shelf: activeShelfForMedia,
    });

    return mergeCoverAttachmentsForPicker(
      {
        imageUrl: item?.imageUrl ?? prefilledValues?.imageUrl ?? null,
        metadata,
        shelf: activeShelfForMedia,
      },
      attachments,
    ).map((attachment) => {
      const gallery = getAttachmentGalleryLabels(
        {
          type: attachment.type,
          role: attachment.role,
          title: attachment.title,
          source: attachment.source,
          providerLabel: attachment.providerLabel,
        },
        displayLocale,
      );
      const label =
        attachment.source === "barcode"
          ? t("items.editTabs.scannedImage")
          : defaultCoverUrl &&
              urlsReferToSameLocalizedImage(defaultCoverUrl, attachment.url)
            ? t("items.editTabs.defaultMetadataImage")
            : gallery.caption;

      return {
        url: attachment.url,
        type: attachment.type,
        label,
        source: attachment.source,
        role: attachment.role,
        galleryProvider: gallery.provider,
        galleryDetail: gallery.detail,
      };
    });
  }, [
    itemId,
    item?.metadata,
    item?.imageUrl,
    fetchedMetadata,
    prefilledValues?.imageUrl,
    activeShelfForMedia,
    locale,
    t,
  ]);

  const currentImageUrl = form.watch("imageUrl");

  const finalImages = useMemo(() => {
    const rawMetadata =
      itemId && item?.metadata ? item.metadata : (item?.metadata ?? fetchedMetadata);
    const metadata = filterMetadataForShelfPlatform(
      rawMetadata,
      activeShelfForMedia,
    );
    const displayLocale: AttachmentDisplayLocale =
      locale === "en" ? "en" : "fr";
    const list = [...availableImages];

    if (
      currentImageUrl &&
      typeof currentImageUrl === "string" &&
      !availableImages.some((img) =>
        urlsReferToSameLocalizedImage(img.url, currentImageUrl),
      )
    ) {
      const provenance = (metadata?.attachments || []).find(
        (attachment: { url?: string | null }) =>
          attachment.url &&
          urlsReferToSameLocalizedImage(attachment.url, currentImageUrl),
      );
      const gallery = provenance
        ? getAttachmentGalleryLabels(
            {
              type: provenance.type,
              role: provenance.role,
              title: provenance.title,
              source: provenance.source,
              providerLabel: attachmentTraitsOf(provenance).providerLabel,
            },
            displayLocale,
          )
        : null;

      list.unshift({
        url: currentImageUrl,
        type: provenance?.type ?? "image",
        label: gallery?.caption ?? t("items.editTabs.chooseImage"),
        source: provenance?.source ?? null,
        role: provenance?.role ?? null,
        galleryProvider: gallery?.provider ?? null,
        galleryDetail: gallery?.detail ?? null,
      });
    }

    return list;
  }, [
    availableImages,
    currentImageUrl,
    itemId,
    item?.metadata,
    fetchedMetadata,
    activeShelfForMedia,
    locale,
    t,
  ]);

  const totalPosterPages = useMemo(
    () => Math.ceil(finalImages.length / 12) || 1,
    [finalImages.length],
  );
  const currentPosterPage = useMemo(
    () => Math.min(posterPage, totalPosterPages),
    [posterPage, totalPosterPages],
  );

  const router = useRouter();

  const { mutate: mutateDelete } = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      toast.success(t("items.itemDeleted").replace("{name}", item?.name || ""));
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["shelf", item?.shelfId] });
      handleClose();

      router.push(shelfPath(shelf || { id: item?.shelfId || shelfId || "" }));
    },
    onError: () => {
      toast.error(t("items.deleteFailed"));
    },
  });

  const { reset } = form;

  const handleBarcodeChange = useCallback(
    async (barcode: string) => {
      if (barcode.trim() === "") {
        setSuggestions([]);
        setNameSuggestion(null);
        setMatches([]);
        setSelectedMatch(null);
        setGuessedShelfId(null);
        return;
      }

      try {
        const typeParam = activeShelfType ? `&type=${activeShelfType}` : "";
        const response = await axios.get(
          `/api/barcode?q=${barcode}${typeParam}`,
        );
        const data = response.data;
        const displayName = data?.displayName || data?.cleanName;
        const metadataTitle = data?.cleanName || data?.displayName;

        // Set guessed shelf
        if (shelves && shelves.length > 0) {
          const matches = data?.matches || [];
          const suggestions = data?.suggestions || [];
          const cleanName = data?.cleanName;
          const rawNames = data?.rawNames || [];
          const platformKey = data?.platformKey;
          // Physical-format clue ("LaserDisc"…) leads so a matching format shelf
          // is recommended over a generic same-type one.
          const mediaFormat = data?.mediaFormat as string | undefined;

          const allSearchNames = Array.from(
            new Set([
              ...(mediaFormat ? [mediaFormat] : []),
              ...(displayName ? [displayName] : []),
              ...(cleanName ? [cleanName] : []),
              ...rawNames,
              ...suggestions,
              ...matches.map((m: any) => m.name),
            ]),
          ).filter(Boolean) as string[];

          const shelfGuess = guessShelfFromBarcodeLookup({
            platformKey,
            searchNames: allSearchNames,
            shelves,
            preferredShelfId: form.getValues("shelfId") || shelfId || null,
          });

          setGuessedShelfId(shelfGuess?.shelfId ?? null);
        }

        if (
          data?.matches &&
          Array.isArray(data.matches) &&
          data.matches.length > 1
        ) {
          setMatches(data.matches);

          let chosenMatch = data.matches[0];
          if (prefilledValues?.name) {
            const matchByName = data.matches.find(
              (m: any) =>
                m.name.toLowerCase().trim() ===
                  prefilledValues.name?.toLowerCase().trim() ||
                m.suggestions?.some(
                  (s: string) =>
                    s.toLowerCase().trim() ===
                    prefilledValues.name?.toLowerCase().trim(),
                ),
            );
            if (matchByName) {
              chosenMatch = matchByName;
            }
          }

          setSelectedMatch(chosenMatch);
          setSuggestions(chosenMatch.suggestions);
          const bestSuggestion = chosenMatch.name;
          setNameSuggestion(bestSuggestion);

          if (!form.watch("name") || prefilledValues?.name) {
            form.setValue("name", bestSuggestion);
          }
          // Apply barcode cover directly only when the form does not already
          // carry the cover selected in the quick-scan step.
          if (chosenMatch.coverUrl && !form.getValues("imageUrl")) {
            form.setValue("imageUrl", chosenMatch.coverUrl, {
              shouldDirty: true,
            });
          }
          fetchMetadataPreview(metadataTitle || bestSuggestion, barcode, true);
        } else {
          setMatches([]);
          setSelectedMatch(null);

          if (
            data?.suggestions &&
            Array.isArray(data.suggestions) &&
            data.suggestions.length > 0
          ) {
            setSuggestions(data.suggestions);
            const bestSuggestion = displayName || data.suggestions[0];
            setNameSuggestion(bestSuggestion);

            if (!form.watch("name") || prefilledValues?.name) {
              form.setValue("name", bestSuggestion);
            }
            // Apply barcode cover from first match if available and no image set
            const firstMatchCover = data.matches?.[0]?.coverUrl || null;
            if (firstMatchCover && !form.getValues("imageUrl")) {
              form.setValue("imageUrl", firstMatchCover, { shouldDirty: true });
            }
            fetchMetadataPreview(
              metadataTitle || bestSuggestion,
              barcode,
              true,
            );
          } else if (displayName) {
            setSuggestions(
              data.suggestions?.length ? data.suggestions : [displayName],
            );
            setNameSuggestion(displayName);

            if (!form.watch("name") || prefilledValues?.name) {
              form.setValue("name", displayName);
            }
            // Apply barcode cover from first match if available and no image set
            const firstMatchCover = data.matches?.[0]?.coverUrl || null;
            if (firstMatchCover && !form.getValues("imageUrl")) {
              form.setValue("imageUrl", firstMatchCover, {
                shouldDirty: true,
              });
            }
            fetchMetadataPreview(metadataTitle || displayName, barcode, true);
          } else {
            setSuggestions([]);
            setNameSuggestion(null);
          }
        }
      } catch (error) {
        console.error("Erreur de recherche:", error);
        setSuggestions([]);
        setNameSuggestion(null);
        setMatches([]);
        setSelectedMatch(null);
        setGuessedShelfId(null);
      }
    },
    [form, activeShelfType, fetchMetadataPreview, shelves, prefilledValues],
  );

  const handleLogoChange = async (file: File | string | null) => {
    if (file != null) {
      if (file instanceof File) {
        if (!file.type.startsWith("image/")) {
          toast.error(t("items.invalidImageFile"));
          form.setValue("imageUrl", null);
          return;
        }
        form.setValue("imageUrl", file);
      } else {
        form.setValue("imageUrl", file);
      }
    } else {
      form.setValue("imageUrl", null);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      let imageUrl: FormValues["imageUrl"] = values.imageUrl;
      if (imageUrl && imageUrl instanceof File) {
        imageUrl = await uploadImage(imageUrl);
      }

      let backgroundImageUrl: FormValues["backgroundImageUrl"] =
        values.backgroundImageUrl;
      if (backgroundImageUrl && backgroundImageUrl instanceof File) {
        backgroundImageUrl = await uploadImage(backgroundImageUrl);
      }

      const updatedItem: any = {
        ...values,
        id: item ? item?.id : undefined,
        imageUrl: imageUrl,
        backgroundImageUrl: backgroundImageUrl,
      };

      await onSubmit(updatedItem);
      if (itemId) {
        void invalidateItemQueries(queryClient, itemId, [shelfId, values.shelfId]);
      }
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error(t("items.saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    setIsDeleting(true);
    try {
      await mutateDelete(item.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    reset();
    metadataPreviewRequestRef.current = null;
    metadataSuggestionsRequestRef.current = null;
    setSuggestions([]);
    setNameSuggestion(null);
    setActiveTab(defaultTab || "general");
    setInitializedItemId(undefined);
    setFetchedMetadata(null);
    setLastInitializedShelfId(null);
    lastMetadataStampRef.current = null;
    onClose();
  };

  useEffect(() => {
    if (item?.metadata) {
      setFetchedMetadata(null);
    }
  }, [item?.id, item?.metadata?.lastFetched]);

  useEffect(() => {
    if (!isOpen) {
      setInitializedItemId(undefined);
      setFetchedMetadata(null);
      lastMetadataStampRef.current = null;
      return;
    }

    // If editing (itemId is defined) but item is still loading, wait for it
    if (itemId && !item) {
      return;
    }

    const currentId = itemId || null;
    const isAlreadyInitialized = initializedItemId === currentId;
    const metadataStamp = item?.metadata?.lastFetched
      ? new Date(item.metadata.lastFetched).toISOString()
      : (item?.metadataId ?? "none");
    const metadataChanged =
      isAlreadyInitialized &&
      lastMetadataStampRef.current !== null &&
      lastMetadataStampRef.current !== metadataStamp;

    if (isAlreadyInitialized && (isDirty || !item) && !metadataChanged) {
      return;
    }

    if (item) {
      reset({
        shelfId: item.shelfId || defaultValues.shelfId,
        name: item.name || defaultValues.name,
        description:
          item.description ||
          item.metadata?.description ||
          defaultValues.description,
        condition: item.condition || defaultValues.condition,
        imageUrl: item.imageUrl || defaultValues.imageUrl,
        backgroundImageUrl:
          item.backgroundImageUrl || defaultValues.backgroundImageUrl,
        barcode: item.barcode || defaultValues.barcode,
      });
      setLastInitializedShelfId(item.shelfId || defaultValues.shelfId);
      lastMetadataStampRef.current = metadataStamp;

      if (item.barcode && !item.metadata) {
        handleBarcodeChange(item.barcode);
      }
    } else {
      reset(defaultValues);
      setSuggestions(prefilledValues?.name ? [prefilledValues.name] : []);
      setNameSuggestion(prefilledValues?.name || null);
      setLastInitializedShelfId(defaultValues.shelfId);
      const prefilledMetadata = prefilledValues?.metadataPreview || null;

      if (prefilledMetadata) {
        applyMetadataPreviewToForm(prefilledMetadata, {
          barcodeContext: prefilledValues?.barcode,
        });
      }

      // If we have prefilled values with barcode/name, let's fetch metadata preview!
      if (
        !prefilledMetadata &&
        (prefilledValues?.barcode || prefilledValues?.name)
      ) {
        if (prefilledValues.barcode) {
          handleBarcodeChange(prefilledValues.barcode);
        } else if (prefilledValues.name) {
          fetchMetadataPreview(prefilledValues.name, "");
        }
      }
    }

    if (!isAlreadyInitialized) {
      setActiveTab(defaultTab || "general");
    }

    setInitializedItemId(currentId);
  }, [
    isOpen,
    itemId,
    item,
    defaultValues,
    applyMetadataPreviewToForm,
    handleBarcodeChange,
    fetchMetadataPreview,
    reset,
    defaultTab,
    initializedItemId,
    isDirty,
    prefilledValues,
  ]);

  // Re-fetch metadata preview when shelf/platform changes
  useEffect(() => {
    if (!isOpen || initializedItemId === undefined || !lastInitializedShelfId)
      return;
    if (currentShelfId !== lastInitializedShelfId) {
      setLastInitializedShelfId(currentShelfId);
      const name = form.getValues("name");
      const barcode = form.getValues("barcode") || "";
      if (name) {
        fetchMetadataPreview(name, barcode, true);
      }
    }
  }, [
    currentShelfId,
    lastInitializedShelfId,
    isOpen,
    initializedItemId,
    fetchMetadataPreview,
    form,
  ]);

  // Barcode-prefilled items can initialize before shelves are loaded. Once the
  // shelf type/platform is known, fetch the full metadata image set.
  useEffect(() => {
    if (
      !isOpen ||
      item ||
      !activeShelfType ||
      fetchedMetadata ||
      isFetchingMetadata
    ) {
      return;
    }

    const name = form.getValues("name") || prefilledValues?.name || "";
    const barcode = form.getValues("barcode") || prefilledValues?.barcode || "";
    if (!name.trim()) return;

    const requestKey = [
      activeShelfType,
      activeShelf?.name || "",
      name.trim().toLowerCase(),
      barcode.trim(),
    ].join("|");

    if (metadataPreviewRequestRef.current === requestKey) return;
    fetchMetadataPreview(name, barcode, false);
  }, [
    activeShelf?.name,
    activeShelfType,
    fetchedMetadata,
    fetchMetadataPreview,
    form,
    isFetchingMetadata,
    isOpen,
    item,
    prefilledValues?.barcode,
    prefilledValues?.name,
  ]);

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={handleClose}
        title={
          <div className="flex items-center gap-2">
            {shelf && <ShelfTypeIcon type={shelf.type} className="size-5" />}
            <span>
              {item
                ? `${t("items.editItem")} : ${item.name}`
                : t("items.addNewItem")}
            </span>
          </div>
        }
        description={
          item ? t("items.editItemDetails") : t("items.createNewItem")
        }
        size="xl"
        customChildren={true}
        footer={null}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="flex flex-1 overflow-hidden flex-col min-h-0">
              {/* Sidebar for tabs (when editing, when metadata available, or when coming from a scan) */}
              {(item ||
                fetchedMetadata ||
                prefilledValues?.imageUrl ||
                prefilledValues?.barcode) && (
                <div className="w-[calc(100%-2rem)] mx-auto mt-3 bg-zinc-200/50 dark:bg-zinc-900/60 border border-border/60 p-1 flex gap-1 rounded-xl shrink-0 overflow-x-auto backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setActiveTab("general")}
                    className={cn(
                      "group flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg select-none cursor-pointer whitespace-nowrap transition-all flex-1 border border-transparent",
                      activeTab === "general"
                        ? "bg-white text-zinc-950 dark:bg-zinc-850 dark:text-zinc-50 shadow-sm border-zinc-200/50 dark:border-zinc-700/50"
                        : "text-muted-foreground hover:text-foreground hover:bg-zinc-300/30 dark:hover:bg-zinc-800/40",
                    )}
                  >
                    <Settings
                      className={cn(
                        "size-4 shrink-0 transition-all duration-500 ease-out group-hover:rotate-45",
                        activeTab === "general"
                          ? "text-amber-500"
                          : "text-muted-foreground group-hover:text-amber-500",
                      )}
                    />
                    <span className="hidden sm:inline">
                      {t("items.editTabs.general")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("poster")}
                    className={cn(
                      "group flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg select-none cursor-pointer whitespace-nowrap transition-all flex-1 border border-transparent",
                      activeTab === "poster"
                        ? "bg-white text-zinc-950 dark:bg-zinc-850 dark:text-zinc-50 shadow-sm border-zinc-200/50 dark:border-zinc-700/50"
                        : "text-muted-foreground hover:text-foreground hover:bg-zinc-300/30 dark:hover:bg-zinc-800/40",
                    )}
                  >
                    <ImageIcon
                      className={cn(
                        "size-4 shrink-0 transition-all duration-500 ease-out group-hover:scale-110 group-hover:rotate-3",
                        activeTab === "poster"
                          ? "text-emerald-500"
                          : "text-muted-foreground group-hover:text-emerald-500",
                      )}
                    />
                    <span className="hidden sm:inline">
                      {t("items.editTabs.poster")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("background")}
                    className={cn(
                      "group flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg select-none cursor-pointer whitespace-nowrap transition-all flex-1 border border-transparent",
                      activeTab === "background"
                        ? "bg-white text-zinc-950 dark:bg-zinc-850 dark:text-zinc-50 shadow-sm border-zinc-200/50 dark:border-zinc-700/50"
                        : "text-muted-foreground hover:text-foreground hover:bg-zinc-300/30 dark:hover:bg-zinc-800/40",
                    )}
                  >
                    <ImageIcon
                      className={cn(
                        "size-4 shrink-0 transition-all duration-500 ease-out group-hover:-rotate-6 group-hover:scale-105",
                        activeTab === "background"
                          ? "text-blue-500"
                          : "text-muted-foreground group-hover:text-blue-500",
                      )}
                    />
                    <span className="hidden sm:inline">
                      {t("items.editTabs.background")}
                    </span>
                  </button>
                </div>
              )}

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
                {activeTab === "general" && (
                  <div className="flex flex-col space-y-4">
                    <FormField
                      control={form.control}
                      name="shelfId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {t("items.shelf")}
                          </FormLabel>
                          <FormControl>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                className={cn(
                                  "w-full bg-zinc-50 dark:bg-zinc-950/20 h-10 border-border/80 rounded-xl cursor-pointer text-xs font-semibold shadow-none flex items-center gap-2",
                                  field.value === guessedShelfId &&
                                    "border-violet-500/50 focus-visible:border-violet-500/80 focus-visible:ring-violet-500/20 text-violet-700 dark:text-violet-400 bg-violet-500/5 dark:bg-violet-500/5",
                                )}
                              >
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <SelectValue
                                    placeholder={
                                      t("scanner.selectShelf") ||
                                      "Sélectionner une étagère"
                                    }
                                  />
                                </div>
                              </SelectTrigger>
                              <SelectContent className="bg-popover border border-border dark:border-zinc-800 rounded-xl shadow-lg">
                                {shelves?.map((s) => {
                                  const isGuessed = s.id === guessedShelfId;
                                  return (
                                    <SelectItem
                                      key={s.id}
                                      value={s.id}
                                      className="cursor-pointer text-xs"
                                    >
                                      <div
                                        className={cn(
                                          "flex items-center gap-2",
                                          isGuessed &&
                                            "text-violet-700 dark:text-violet-400 font-semibold",
                                        )}
                                      >
                                        {s.type && (
                                          <ShelfIcon
                                            type={s.type}
                                            className={cn(
                                              "text-muted-foreground size-3.5",
                                              isGuessed && "text-violet-500",
                                            )}
                                          />
                                        )}
                                        <span className="flex items-center gap-1.5">
                                          {s.name}
                                          {isGuessed && (
                                            <SparklesIcon className="size-3 text-violet-500 dark:text-violet-400" />
                                          )}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Barcode */}
                    <FormField
                      control={form.control}
                      name="barcode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {t(itemsBarcodeLabelKey(shelfType))}
                          </FormLabel>
                          <FormControl>
                            <div className="flex relative items-center">
                              <Input
                                type="text"
                                className="pr-11 bg-zinc-50/50 dark:bg-zinc-950/20 border-border/80 rounded-xl focus-visible:border-amber-500/80 focus-visible:ring-amber-500/20 focus-visible:ring-[3px] transition-all duration-200 text-xs sm:text-sm h-10"
                                placeholder={t(itemsBarcodePlaceholderKey(shelfType))}
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  debounce(() =>
                                    handleBarcodeChange(e.target.value),
                                  );
                                }}
                              />
                              <ScannerButton
                                className="absolute right-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                                onScan={(barcode) => {
                                  form.setValue("barcode", barcode);
                                  handleBarcodeChange(barcode);
                                }}
                              />
                            </div>
                          </FormControl>
                          {matches.length > 1 && (
                            <div className="mt-2.5 p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl animate-fade-in shadow-xs">
                              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-2">
                                <SparklesIcon className="size-3.5" />
                                {t("items.multipleMatchesTitle")}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {matches.map((m) => (
                                  <Button
                                    key={m.name}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                      "text-xs px-3 py-1.5 h-auto rounded-lg font-semibold transition-all border select-none cursor-pointer",
                                      selectedMatch?.name === m.name
                                        ? "bg-amber-600 border-amber-600 text-white hover:bg-amber-700 hover:border-amber-700 hover:text-white dark:bg-amber-500 dark:border-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400 dark:hover:border-amber-400 dark:hover:text-zinc-950"
                                        : "bg-background border-border hover:bg-accent text-muted-foreground hover:text-foreground",
                                    )}
                                    onClick={() => {
                                      setSelectedMatch(m);
                                      setSuggestions(m.suggestions);
                                      setNameSuggestion(m.name);
                                      form.setValue("name", m.name);

                                      // Overwrite cover and background for the new match selection
                                      form.setValue(
                                        "imageUrl",
                                        m.coverUrl || null,
                                        { shouldDirty: true },
                                      );
                                      form.setValue(
                                        "backgroundImageUrl",
                                        null,
                                        { shouldDirty: true },
                                      );

                                      fetchMetadataPreview(
                                        m.name,
                                        form.getValues("barcode") || "",
                                        true,
                                      );
                                    }}
                                  >
                                    {m.name}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Name */}
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {t("common.name")}
                          </FormLabel>
                          <FormControl>
                            <div className="relative flex flex-col items-stretch w-full">
                              <div className="relative flex items-center">
                                {isNameMatchingSuggestion && (
                                  <SparklesIcon className="absolute left-3 size-4 text-violet-500 dark:text-violet-400 z-10" />
                                )}

                                <Input
                                  placeholder={t("items.enterName")}
                                  className={cn(
                                    "bg-zinc-50/50 dark:bg-zinc-950/20 border-border/80 rounded-xl focus-visible:border-amber-500/80 focus-visible:ring-amber-500/20 focus-visible:ring-[3px] transition-all duration-200 w-full text-xs sm:text-sm h-10",
                                    {
                                      "pl-9 text-violet-700 dark:text-violet-400 font-semibold bg-violet-500/5 border-violet-500/30":
                                        isNameMatchingSuggestion,
                                    },
                                  )}
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    handleNameChange(e.target.value);
                                  }}
                                  onFocus={() => {
                                    setShowDropdown(true);
                                    if (suggestions.length === 0) {
                                      fetchNameSuggestions(
                                        field.value ||
                                          form.getValues("name") ||
                                          "",
                                      );
                                    }
                                  }}
                                  onBlur={(e) => {
                                    field.onBlur();
                                    setTimeout(
                                      () => setShowDropdown(false),
                                      200,
                                    );
                                  }}
                                />

                                {isFetchingMetadata && (
                                  <Loader2 className="absolute right-3.5 size-4 animate-spin text-muted-foreground z-10" />
                                )}
                              </div>

                              {showDropdown && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border/60 rounded-xl shadow-lg max-h-48 overflow-y-auto z-50 py-1 divide-y divide-border/30 animate-in fade-in slide-in-from-top-1 duration-100">
                                  {suggestions.map((suggestion) => (
                                    <button
                                      key={suggestion}
                                      type="button"
                                      className="w-full text-left px-3 py-2.5 text-xs sm:text-sm hover:bg-accent hover:text-accent-foreground text-foreground transition-colors font-medium cursor-pointer"
                                      onClick={() => {
                                        form.setValue("name", suggestion);
                                        setNameSuggestion(suggestion);
                                        setShowDropdown(false);
                                        fetchMetadataPreview(
                                          suggestion,
                                          form.getValues("barcode") || "",
                                        );
                                      }}
                                    >
                                      {suggestion}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Description */}
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {t("common.description")}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("items.enterDescription")}
                              className="bg-zinc-50/50 dark:bg-zinc-950/20 border-border/80 rounded-xl focus-visible:border-amber-500/80 focus-visible:ring-amber-500/20 focus-visible:ring-[3px] transition-all duration-200 font-sans min-h-[120px] text-xs sm:text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Condition */}
                    <FormField
                      control={form.control}
                      name="condition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {t("items.condition")}
                          </FormLabel>
                          <FormControl>
                            <ToggleGroup
                              size="sm"
                              type="single"
                              variant="outline"
                              className="flex w-full gap-2 p-1 bg-zinc-200/50 dark:bg-zinc-900/60 rounded-xl border border-border/40"
                              onValueChange={field.onChange}
                              {...field}
                            >
                              {Object.values(Condition).map((condition) => {
                                const isActive = field.value === condition;
                                let activeStyles = "";
                                if (isActive) {
                                  if (condition === "new") {
                                    activeStyles =
                                      "bg-white text-emerald-600 dark:bg-zinc-800 dark:text-emerald-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-emerald-500/10";
                                  } else if (condition === "used") {
                                    activeStyles =
                                      "bg-white text-amber-600 dark:bg-zinc-800 dark:text-amber-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-amber-500/10";
                                  } else if (condition === "damaged") {
                                    activeStyles =
                                      "bg-white text-rose-600 dark:bg-zinc-800 dark:text-rose-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-rose-500/10";
                                  }
                                }
                                return (
                                  <ToggleGroupItem
                                    key={condition}
                                    value={condition}
                                    aria-label={condition}
                                    className={cn(
                                      "flex flex-auto py-2.5 px-3 gap-1.5 text-xs font-bold rounded-lg transition-all duration-200 border border-transparent hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 text-muted-foreground cursor-pointer select-none",
                                      isActive
                                        ? activeStyles
                                        : "bg-transparent hover:text-foreground",
                                    )}
                                  >
                                    <ConditionIcon condition={condition} />
                                    <span className="shrink-0 font-medium">
                                      {t(`items.conditions.${condition}`)}
                                    </span>
                                  </ToggleGroupItem>
                                );
                              })}
                            </ToggleGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Premium Cover Selector inside General tab */}
                    <FormField
                      control={form.control}
                      name="imageUrl"
                      render={({ field }) => (
                        <ImagePickerField
                          value={field.value}
                          onChange={field.onChange}
                          onFileChange={handleLogoChange}
                          label={t("items.cover")}
                          placeholder="Pas de couverture"
                          chooseImageText={t("items.editTabs.chooseImage")}
                          enterUrlText={t("items.editTabs.enterUrl")}
                          urlPlaceholderText={t(
                            "items.editTabs.urlPlaceholder",
                          )}
                          suggestedImagesText="Images suggérées"
                          invalidUrlText={t("items.invalidImage")}
                          suggestions={finalImages}
                          onViewMore={() => setActiveTab("poster")}
                          aspectRatio={itemAspectRatio}
                          contain={true}
                        />
                      )}
                    />
                  </div>
                )}

                {activeTab === "poster" &&
                  (item ||
                    fetchedMetadata ||
                    prefilledValues?.imageUrl ||
                    prefilledValues?.barcode) && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border/60">
                        {/* File Upload Selector */}
                        <div className="relative">
                          <input
                            id="poster-file-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (!file.type.startsWith("image/")) {
                                  toast.error(t("items.invalidImageFile"));
                                  return;
                                }
                                form.setValue("imageUrl", file);
                                toast.success(t("common.success"));
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              document
                                .getElementById("poster-file-upload")
                                ?.click()
                            }
                            className="flex items-center gap-1.5 text-xs"
                          >
                            <Upload className="size-4" />
                            {t("items.editTabs.chooseImage")}
                          </Button>
                        </div>

                        {/* URL Entry Button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowUrlInput(!showUrlInput)}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          <LinkIcon className="size-4" />
                          {t("items.editTabs.enterUrl")}
                        </Button>
                      </div>

                      {showUrlInput && (
                        <div className="flex items-center gap-2 p-3 bg-zinc-950/20 dark:bg-zinc-950/30 border border-border rounded-xl animate-fade-in">
                          <Input
                            type="text"
                            placeholder={t("items.editTabs.urlPlaceholder")}
                            value={urlInputValue}
                            onChange={(e) => setUrlInputValue(e.target.value)}
                            className="flex-1 text-xs bg-background text-foreground animate-none"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              if (urlInputValue.trim()) {
                                if (isUrl(urlInputValue.trim())) {
                                  form.setValue(
                                    "imageUrl",
                                    urlInputValue.trim(),
                                    { shouldDirty: true },
                                  );
                                  setUrlInputValue("");
                                  setShowUrlInput(false);
                                  toast.success(t("common.success"));
                                } else {
                                  toast.error(t("items.invalidImage"));
                                }
                              }
                            }}
                            className="text-xs"
                          >
                            OK
                          </Button>
                        </div>
                      )}

                      {/* Poster Grid */}
                      {finalImages.length > 0 ? (
                        <div className="flex flex-col gap-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-2">
                            {finalImages
                              .slice(
                                (currentPosterPage - 1) * 12,
                                currentPosterPage * 12,
                              )
                              .map((img, i) => {
                                const selectedCoverUrl = form.watch("imageUrl");
                                const isSelected =
                                  typeof selectedCoverUrl === "string" &&
                                  urlsReferToSameLocalizedImage(
                                    selectedCoverUrl,
                                    img.url,
                                  );
                                return (
                                  <div
                                    key={i}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                      form.setValue("imageUrl", img.url, {
                                        shouldDirty: true,
                                      })
                                    }
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        form.setValue("imageUrl", img.url, {
                                          shouldDirty: true,
                                        });
                                      }
                                    }}
                                    className={cn(
                                      "group relative overflow-hidden rounded-xl border-2 bg-white text-left transition-all duration-200 outline-none flex flex-col items-center justify-center cursor-pointer",
                                      isSelected
                                        ? "border-amber-600 dark:border-amber-500 shadow-md ring-2 ring-amber-600/30"
                                        : "border-border/60 hover:border-border hover:shadow-sm",
                                    )}
                                    style={{ aspectRatio: itemAspectRatio }}
                                  >
                                    <RemoteImage
                                      src={img.url}
                                      alt={img.label}
                                      className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                                    />

                                    {/* Hover Zoom Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setZoomImageUrl(img.url);
                                      }}
                                      className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/85 text-white backdrop-blur-md p-1.5 rounded-lg border border-white/10 shadow-md active:scale-95 transition-all opacity-0 group-hover:opacity-100 z-30 cursor-pointer"
                                    >
                                      <Maximize2 className="size-3.5" />
                                    </button>

                                    {/* Selected overlay checkmark */}
                                    {isSelected && (
                                      <div className="absolute top-1.5 right-1.5 bg-amber-600 dark:bg-amber-500 text-white rounded-full p-1 shadow-md z-20">
                                        <Check className="size-3" />
                                      </div>
                                    )}

                                    {/* Source & Type Badges */}
                                    <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start z-10 pointer-events-none select-none">
                                      {img.galleryProvider && (
                                        <Badge
                                          variant="secondary"
                                          className="bg-black/85 backdrop-blur text-[8px] font-extrabold border-none text-amber-400 uppercase px-1.5 py-0.5 rounded leading-none tracking-wider"
                                        >
                                          {img.galleryProvider}
                                        </Badge>
                                      )}
                                      {img.galleryDetail && (
                                        <Badge
                                          variant="secondary"
                                          className="bg-black/85 backdrop-blur text-[8px] font-bold border-none text-zinc-300 uppercase px-1.5 py-0.5 rounded leading-none"
                                        >
                                          {img.galleryDetail}
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Source label */}
                                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-zinc-950/80 backdrop-blur-sm text-[10px] text-zinc-300 font-semibold text-center truncate">
                                      {img.label}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>

                          {/* Pagination Controls */}
                          {totalPosterPages > 1 && (
                            <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2 select-none">
                              <span className="text-xs text-muted-foreground">
                                {t("common.page", {
                                  current: currentPosterPage,
                                  total: totalPosterPages,
                                }) ||
                                  `Page ${currentPosterPage} sur ${totalPosterPages}`}
                              </span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={currentPosterPage === 1}
                                  onClick={() =>
                                    setPosterPage((prev) =>
                                      Math.max(prev - 1, 1),
                                    )
                                  }
                                  className="h-8 text-xs rounded-lg cursor-pointer"
                                >
                                  {t("common.previous") || "Précédent"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    currentPosterPage >= totalPosterPages
                                  }
                                  onClick={() =>
                                    setPosterPage((prev) =>
                                      Math.min(prev + 1, totalPosterPages),
                                    )
                                  }
                                  className="h-8 text-xs rounded-lg cursor-pointer"
                                >
                                  {t("common.next") || "Suivant"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground py-8 text-center bg-zinc-950/5 dark:bg-zinc-950/10 border border-dashed border-border rounded-xl">
                          {t("items.editTabs.noMetadata")}
                        </div>
                      )}
                    </div>
                  )}

                {activeTab === "background" &&
                  (item ||
                    fetchedMetadata ||
                    prefilledValues?.imageUrl ||
                    prefilledValues?.barcode) && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border/60">
                        {/* File Upload Selector */}
                        <div className="relative">
                          <input
                            id="background-file-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (!file.type.startsWith("image/")) {
                                  toast.error(t("items.invalidImageFile"));
                                  return;
                                }
                                form.setValue("backgroundImageUrl", file);
                                toast.success(t("common.success"));
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              document
                                .getElementById("background-file-upload")
                                ?.click()
                            }
                            className="flex items-center gap-1.5 text-xs"
                          >
                            <Upload className="size-4" />
                            {t("items.editTabs.chooseImage")}
                          </Button>
                        </div>

                        {/* URL Entry Button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowBgUrlInput(!showBgUrlInput)}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          <LinkIcon className="size-4" />
                          {t("items.editTabs.enterUrl")}
                        </Button>
                      </div>

                      {showBgUrlInput && (
                        <div className="flex items-center gap-2 p-3 bg-zinc-950/20 dark:bg-zinc-950/30 border border-border rounded-xl animate-fade-in">
                          <Input
                            type="text"
                            placeholder={t("items.editTabs.urlPlaceholder")}
                            value={bgUrlInputValue}
                            onChange={(e) => setBgUrlInputValue(e.target.value)}
                            className="flex-1 text-xs bg-background text-foreground"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              if (bgUrlInputValue.trim()) {
                                if (isUrl(bgUrlInputValue.trim())) {
                                  form.setValue(
                                    "backgroundImageUrl",
                                    bgUrlInputValue.trim(),
                                    { shouldDirty: true },
                                  );
                                  setBgUrlInputValue("");
                                  setShowBgUrlInput(false);
                                  toast.success(t("common.success"));
                                } else {
                                  toast.error(t("items.invalidImage"));
                                }
                              }
                            }}
                            className="text-xs"
                          >
                            OK
                          </Button>
                        </div>
                      )}

                      {/* Background Grid */}
                      {finalBackgrounds.length > 0 ? (
                        <div className="flex flex-col gap-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-2">
                            {finalBackgrounds
                              .slice(
                                (currentBgPage - 1) * 12,
                                currentBgPage * 12,
                              )
                              .map((img, i) => {
                                const isSelected =
                                  form.watch("backgroundImageUrl") === img.url;
                                return (
                                  <div
                                    key={i}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                      form.setValue(
                                        "backgroundImageUrl",
                                        img.url,
                                        {
                                          shouldDirty: true,
                                        },
                                      )
                                    }
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        form.setValue(
                                          "backgroundImageUrl",
                                          img.url,
                                          {
                                            shouldDirty: true,
                                          },
                                        );
                                      }
                                    }}
                                    className={cn(
                                      "group relative aspect-[1.7/1] overflow-hidden rounded-xl border-2 bg-zinc-950/20 text-left transition-all duration-200 outline-none flex flex-col items-center justify-center cursor-pointer",
                                      isSelected
                                        ? "border-amber-600 dark:border-amber-500 shadow-md ring-2 ring-amber-600/30"
                                        : "border-border/60 hover:border-border hover:shadow-sm",
                                    )}
                                  >
                                    <RemoteImage
                                      src={img.url}
                                      alt={img.label}
                                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    />

                                    {/* Hover Zoom Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setZoomImageUrl(img.url);
                                      }}
                                      className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/85 text-white backdrop-blur-md p-1.5 rounded-lg border border-white/10 shadow-md active:scale-95 transition-all opacity-0 group-hover:opacity-100 z-30 cursor-pointer"
                                    >
                                      <Maximize2 className="size-3.5" />
                                    </button>

                                    {/* Selected overlay checkmark */}
                                    {isSelected && (
                                      <div className="absolute top-1.5 right-1.5 bg-amber-600 dark:bg-amber-500 text-white rounded-full p-1 shadow-md z-20">
                                        <Check className="size-3" />
                                      </div>
                                    )}

                                    {/* Source & Type Badges */}
                                    <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start z-10 pointer-events-none select-none">
                                      {img.galleryProvider && (
                                        <Badge
                                          variant="secondary"
                                          className="bg-black/85 backdrop-blur text-[8px] font-extrabold border-none text-amber-400 uppercase px-1.5 py-0.5 rounded leading-none tracking-wider"
                                        >
                                          {img.galleryProvider}
                                        </Badge>
                                      )}
                                      {img.galleryDetail && (
                                        <Badge
                                          variant="secondary"
                                          className="bg-black/85 backdrop-blur text-[8px] font-bold border-none text-zinc-300 uppercase px-1.5 py-0.5 rounded leading-none"
                                        >
                                          {img.galleryDetail}
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Source label */}
                                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-zinc-950/80 backdrop-blur-sm text-[10px] text-zinc-300 font-semibold text-center truncate">
                                      {img.label}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>

                          {/* Pagination Controls */}
                          {totalBgPages > 1 && (
                            <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2 select-none">
                              <span className="text-xs text-muted-foreground">
                                {t("common.page", {
                                  current: currentBgPage,
                                  total: totalBgPages,
                                }) ||
                                  `Page ${currentBgPage} sur ${totalBgPages}`}
                              </span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={currentBgPage === 1}
                                  onClick={() =>
                                    setBgPage((prev) => Math.max(prev - 1, 1))
                                  }
                                  className="h-8 text-xs rounded-lg cursor-pointer"
                                >
                                  {t("common.previous") || "Précédent"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={currentBgPage >= totalBgPages}
                                  onClick={() =>
                                    setBgPage((prev) =>
                                      Math.min(prev + 1, totalBgPages),
                                    )
                                  }
                                  className="h-8 text-xs rounded-lg cursor-pointer"
                                >
                                  {t("common.next") || "Suivant"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground py-8 text-center bg-zinc-950/5 dark:bg-zinc-950/10 border border-dashed border-border rounded-xl">
                          {t("items.editTabs.noMetadata")}
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>

            <DialogFooter className="p-4 md:p-5 border-t border-border/60 dark:border-zinc-900/60 bg-zinc-50/30 dark:bg-zinc-950/30 shrink-0 flex flex-row items-center justify-end gap-2 w-full">
              {item?.id && (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto rounded-xl h-10 px-5 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                >
                  {t("common.delete")}
                </Button>
              )}

              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                className="rounded-xl h-10 px-5 text-xs font-semibold border-border hover:bg-accent cursor-pointer active:scale-[0.98] transition-all"
                disabled={isSubmitting || isDeleting}
              >
                {t("common.cancel")}
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
                {item ? t("common.save") : t("items.addItem")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </BaseModal>

      {/* Delete dialog */}
      <BaseModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t("items.confirmDeletion")}
        description={t("items.deleteConfirmMessage")}
        size="sm"
        onCancel={() => setShowDeleteConfirm(false)}
        onDelete={handleDelete}
        deleteLabel={t("common.delete")}
        isDeleting={isDeleting}
        cancelLabel={t("common.cancel")}
      >
        <div className="hidden" />
      </BaseModal>

      {/* Lightbox Zoom Dialog */}
      <Dialog
        open={!!zoomImageUrl}
        onOpenChange={(open) => {
          if (!open) setZoomImageUrl(null);
        }}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/90 border-none flex flex-col items-center justify-center backdrop-blur-xl">
          <DialogTitle className="sr-only">Zoom Image</DialogTitle>
          <div className="relative w-full h-full max-h-[85vh] flex items-center justify-center p-4">
            {zoomImageUrl && (
              <img
                src={zoomImageUrl}
                alt="Zoom"
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl transition-transform duration-300 animate-zoom-in"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
