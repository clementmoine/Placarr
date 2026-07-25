"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import {
  SparklesIcon,
  Loader2,
  Upload,
  Link as LinkIcon,
  Check,
  Settings,
  Image as ImageIcon,
  Maximize2,
  HardDrive,
} from "lucide-react";
import { RemoteImage } from "@/components/RemoteImage";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
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
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { BaseModal } from "@/components/modals/BaseModal";
import { ImagePickerField } from "@/components/modals/ImagePickerField";
import { ScannerButton } from "@/components/ScannerButton";
import {
  ConditionIcon,
  conditionToggleActiveClass,
} from "@/components/ConditionIcon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { itemConditionsForShelfType } from "@/core/collect/condition";

import { isUrl } from "@/lib/shared/isUrl";
import { useDebounce } from "@/lib/client/hooks/useDebounce";
import { useItemModalMetadataMutations } from "@/lib/client/hooks/useItemModalMetadataMutations";
import {
  dumpTitleFromFileName,
  formatRomHashSizeMiB,
  hashRomFile,
  romHashProgressPercent,
  shouldWarnRomHashSize,
} from "@/lib/client/hashRomFile";
import {
  buildItemModalSessionInit,
  itemModalSessionKey,
} from "@/lib/client/itemModalSession";
import { deleteItem, getItem } from "@/lib/api/items";
import { getShelf, getShelves } from "@/lib/api/shelves";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import { getAspectRatio } from "@/lib/text/cardFormat";
import {
  itemsBarcodeLabelKey,
  itemsBarcodePlaceholderKey,
} from "@/core/identify/shelfLabels";
import {
  guessShelfFromBarcodeLookup,
  shelfSearchHintsFromBarcodePayload,
} from "@/core/identify/query";
import { isAbortError } from "@/lib/http/abort";
import { shelfPath } from "@/lib/routing/slugs";

import {
  type AttachmentType,
  type Prisma,
  type Item,
  type Shelf,
  Condition,
} from "@/generated/prisma/browser";
import {
  mergeCoverAttachmentsForPicker,
  getCoverImage,
  filterMetadataForShelfPlatform,
  backgroundPickerAttachmentsForItem,
} from "@/core/collect/media";
import {
  findAttachmentForUrl,
  stripCropSuffixFromUrl,
  urlsReferToSameLocalizedImage,
} from "@/core/enrich/media/coverUrl";
import { localizeImageFieldForSubmit } from "@/core/enrich/media/localizeImageForSubmit";
import {
  getAttachmentGalleryLabels,
  type AttachmentDisplayLocale,
} from "@/core/enrich/media/attachmentDisplayLabels";
import { AttachmentSourceChip } from "@/components/AttachmentSourceChip";
import { cn } from "@/lib/shared/utils";
import type { ItemWithMetadata } from "@/types/items";
import type { ShelfWithItemCount } from "@/types/shelves";
import { collectMetadataTitleSuggestions } from "@/core/collect/titleSuggestions";
import type {
  MetadataResult,
  MetadataAttachment,
} from "@/types/metadataProvider";
import { useRefetchItemWhenMetadataIdle } from "@/core/collect/useRefetchItemWhenMetadataIdle";
import { invalidateItemQueries } from "@/core/collect/queryCache";
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
        isFullWrapCoverSource?: boolean;
        isGameMediaGallerySource?: boolean;
        isMusicGallerySource?: boolean;
        providerImageScoreAdjustment?: number;
        coverProvenance?: string | null;
        providerLabel?: string | null;
        gridStyleCoverLabelsSource?: boolean;
      }
    | null
    | undefined;
  return {
    isFullWrapCoverSource: traits?.isFullWrapCoverSource,
    isGameMediaGallerySource: traits?.isGameMediaGallerySource,
    isMusicGallerySource: traits?.isMusicGallerySource,
    providerImageScoreAdjustment: traits?.providerImageScoreAdjustment,
    coverProvenance: traits?.coverProvenance,
    providerLabel: traits?.providerLabel,
    gridStyleCoverLabelsSource: traits?.gridStyleCoverLabelsSource,
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
    enabled: Boolean(isOpen && shelfId),
    initialData: () => queryClient.getQueryData<Shelf>(["shelf", shelfId]),
  });

  // Lite list for the picker — skip bestItem; reuse grid cache while it loads.
  const { data: shelves } = useQuery<ShelfWithItemCount[]>({
    queryKey: ["shelves", "picker"],
    queryFn: () => getShelves(null, { lite: true }),
    enabled: isOpen,
    placeholderData: () =>
      queryClient.getQueryData<ShelfWithItemCount[]>(["shelves", "picker"]) ??
      queryClient.getQueryData<ShelfWithItemCount[]>(["shelves"]),
  });

  const hasPrefilledScanImage =
    !itemId &&
    typeof prefilledValues?.imageUrl === "string" &&
    prefilledValues.imageUrl.trim().length > 0;
  const prefilledScanImageUrl = hasPrefilledScanImage
    ? prefilledValues?.imageUrl?.trim() || null
    : null;

  // useWatch (abonnement par champ) au lieu de form.watch : API compatible
  // avec le compilateur React et re-rendus limités au champ concerné.
  const currentShelfId = useWatch({ control: form.control, name: "shelfId" });

  // Radix SelectValue stays blank until a matching SelectItem exists — seed the
  // current shelf so the trigger never flashes empty while the list loads.
  const shelfOptions = useMemo(() => {
    type Opt = { id: string; name: string; type?: Shelf["type"] | null };
    const byId = new Map<string, Opt>();
    for (const entry of shelves ?? []) {
      byId.set(entry.id, {
        id: entry.id,
        name: entry.name,
        type: entry.type,
      });
    }
    const cachedCurrent =
      queryClient.getQueryData<Shelf>(["shelf", shelfId]) ??
      queryClient
        .getQueryData<ShelfWithItemCount[]>(["shelves"])
        ?.find((entry) => entry.id === shelfId);
    const seed = (
      id: string | null | undefined,
      name?: string | null,
      type?: Shelf["type"] | null,
    ) => {
      if (!id || byId.has(id)) return;
      byId.set(id, {
        id,
        name: name?.trim() || id,
        type: type ?? null,
      });
    };
    seed(
      shelfId,
      shelf?.name ?? cachedCurrent?.name,
      shelf?.type ?? cachedCurrent?.type ?? shelfType,
    );
    seed(
      currentShelfId,
      shelf?.name ?? cachedCurrent?.name,
      shelf?.type ?? cachedCurrent?.type ?? shelfType,
    );
    seed(item?.shelfId, item?.shelf?.name, item?.shelf?.type);
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [
    shelves,
    shelfId,
    shelf?.name,
    shelf?.type,
    shelfType,
    currentShelfId,
    item?.shelfId,
    item?.shelf?.name,
    item?.shelf?.type,
    queryClient,
  ]);

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

  const watchedName = useWatch({ control: form.control, name: "name" });
  const watchedCondition = useWatch({
    control: form.control,
    name: "condition",
  });
  const isNameMatchingSuggestion = useMemo(() => {
    if (!nameSuggestion) return false;
    const val = (watchedName || "").trim().toLowerCase();
    if (val === nameSuggestion.trim().toLowerCase()) return true;
    return suggestions.some((s) => s.trim().toLowerCase() === val);
  }, [watchedName, nameSuggestion, suggestions]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isHashingDump, setIsHashingDump] = useState(false);
  const [hashDumpPercent, setHashDumpPercent] = useState(0);
  const dumpFileInputRef = useRef<HTMLInputElement>(null);
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

  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("");

  const [showBgUrlInput, setShowBgUrlInput] = useState(false);
  const [bgUrlInputValue, setBgUrlInputValue] = useState("");
  const lastInitializedShelfIdRef = useRef<string | null>(null);
  const prefilledPreviewRequestRef = useRef<string | null>(null);

  const [fetchedMetadata, setFetchedMetadata] = useState<MetadataResult | null>(
    null,
  );
  const [posterPage, setPosterPage] = useState(1);
  const [bgPage, setBgPage] = useState(1);

  const sessionKey = itemModalSessionKey({
    isOpen,
    itemId,
    item,
    prefilledValues,
    shelfId,
  });
  const [sessionState, setSessionState] = useState<{
    key: string;
    init: ReturnType<typeof buildItemModalSessionInit>;
  } | null>(null);
  if (sessionKey !== sessionState?.key) {
    if (sessionKey) {
      const init = buildItemModalSessionInit({
        item,
        prefilledValues,
        shelfId,
        activeShelfForMedia,
      });
      setSessionState({ key: sessionKey, init });
      setSuggestions(init.suggestions);
      setNameSuggestion(init.nameSuggestion);
      setActiveTab(defaultTab || "general");
      setFetchedMetadata(init.fetchedMetadata);
      setGuessedShelfId(null);
      setMatches([]);
      setSelectedMatch(null);
      setPosterPage(1);
      setBgPage(1);
    } else if (!isOpen && sessionState !== null) {
      setSessionState(null);
    }
  }

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
        filterMetadataForShelfPlatform(metadata, activeShelfForMedia) ??
          metadata,
      );

      const currentBarcode = (
        barcodeContext ||
        form.getValues("barcode") ||
        ""
      ).trim();
      const shelfPlatformKey =
        activeShelfType === "games"
          ? detectShelfGamePlatformKey(activeShelfForMedia?.name)
          : undefined;
      const userInitiatedBarcodeLookup = Boolean(barcodeContext?.trim());

      if (
        metadata.barcode &&
        !currentBarcode &&
        (!shelfPlatformKey || userInitiatedBarcodeLookup)
      ) {
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
    [
      activeShelfForMedia,
      activeShelfType,
      form,
      hasPrefilledScanImage,
      prefilledScanImageUrl,
    ],
  );

  const {
    fetchMetadataPreview,
    fetchNameSuggestions,
    isFetchingMetadata,
    cancelMetadataRequests,
  } = useItemModalMetadataMutations({
    activeShelfType,
    activeShelfName: activeShelf?.name ?? null,
    applyMetadataPreviewToForm,
    onSuggestionsLoaded: (cleanSuggestions, primary) => {
      setSuggestions(cleanSuggestions);
      setNameSuggestion(primary);
    },
  });

  useEffect(() => {
    if (!isOpen) {
      cancelMetadataRequests();
      prefilledPreviewRequestRef.current = null;
    }
  }, [isOpen, cancelMetadataRequests]);

  useEffect(() => {
    if (watchedCondition !== "loose") return;
    if (itemConditionsForShelfType(activeShelfType).includes("loose")) return;
    form.setValue("condition", "used");
  }, [activeShelfType, form, watchedCondition]);

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

  const handleDumpFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || activeShelfType !== "games") return;

      if (shouldWarnRomHashSize(file.size)) {
        toast.warning(
          t("items.hashDumpLargeWarn").replace(
            "{size}",
            formatRomHashSizeMiB(file.size),
          ),
        );
      }

      setIsHashingDump(true);
      setHashDumpPercent(0);
      try {
        const checksums = await hashRomFile(file, {
          onProgress: (progress) => {
            setHashDumpPercent(romHashProgressPercent(progress.ratio));
          },
        });
        const currentName = (form.getValues("name") || "").trim();
        const lookupName = currentName || dumpTitleFromFileName(file.name);
        if (!currentName && lookupName) {
          form.setValue("name", lookupName, { shouldDirty: true });
        }
        fetchMetadataPreview(
          lookupName,
          form.getValues("barcode") || "",
          true,
          checksums,
        );
        toast.success(t("items.hashDumpDone"));
      } catch (error) {
        console.error("Dump hash failed:", error);
        toast.error(t("items.hashDumpFailed"));
      } finally {
        setIsHashingDump(false);
        setHashDumpPercent(0);
      }
    },
    [activeShelfType, fetchMetadataPreview, form, t],
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
      gallerySourceNames?: string[];
      galleryDetail?: string | null;
    }[] = [];

    const displayLocale: AttachmentDisplayLocale =
      locale === "en" ? "en" : "fr";

    backgroundPickerAttachmentsForItem(
      metadata,
      activeShelfForMedia,
      locale,
    ).forEach((a) => {
      if (!a.url || urls.has(a.url)) return;
      urls.add(a.url);
      const gallery = getAttachmentGalleryLabels(
        {
          type: a.type,
          role: a.role,
          title: a.title,
          source: a.source,
          providerLabel: a.providerLabel,
          sourceNames: a.sourceNames,
          gridStyleCoverLabelsSource: a.gridStyleCoverLabelsSource,
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
        gallerySourceNames: gallery.sourceNames,
        galleryDetail: gallery.detail,
      });
    });

    return list;
  }, [item?.metadata, fetchedMetadata, locale, activeShelfForMedia]);

  const currentBackgroundUrl = useWatch({
    control: form.control,
    name: "backgroundImageUrl",
  });

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
      itemId && item?.metadata
        ? item.metadata
        : (item?.metadata ?? fetchedMetadata);
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
      isFullWrapCoverSource?: boolean;
      isGameMediaGallerySource?: boolean;
      isMusicGallerySource?: boolean;
      providerImageScoreAdjustment?: number;
      coverProvenance?: string | null;
      providerLabel?: string | null;
      sourceNames?: string[] | null;
      width?: number | null;
      height?: number | null;
      meanLuminance?: number | null;
      darkPixelRatio?: number | null;
    }> = [];

    const displayLocale: AttachmentDisplayLocale =
      locale === "en" ? "en" : "fr";

    const addAttachment = (entry: {
      type: AttachmentType | string;
      url: string;
      source?: string | null;
      role?: string | null;
      title?: string | null;
      isFullWrapCoverSource?: boolean;
      isGameMediaGallerySource?: boolean;
      isMusicGallerySource?: boolean;
      providerImageScoreAdjustment?: number;
      coverProvenance?: string | null;
      providerLabel?: string | null;
      sourceNames?: string[] | null;
      width?: number | null;
      height?: number | null;
      meanLuminance?: number | null;
      darkPixelRatio?: number | null;
    }) => {
      if (!entry.url) return;
      const existingIndex = attachments.findIndex((attachment) =>
        urlsReferToSameLocalizedImage(attachment.url, entry.url),
      );
      if (existingIndex >= 0) {
        const existing = attachments[existingIndex]!;
        // Honor pin (`user`) often shares the provider file URL — upgrade the
        // row so the chip shows Booknode / SensCritique, not "Perso".
        if (
          existing.source === "user" &&
          entry.source &&
          entry.source !== "user"
        ) {
          attachments[existingIndex] = {
            ...existing,
            ...entry,
            type: entry.type as AttachmentType,
            url: entry.url,
          };
        }
        return;
      }
      urls.add(entry.url);
      attachments.push({
        type: entry.type as AttachmentType,
        url: entry.url,
        source: entry.source,
        role: entry.role,
        title: entry.title,
        isFullWrapCoverSource: entry.isFullWrapCoverSource,
        isGameMediaGallerySource: entry.isGameMediaGallerySource,
        isMusicGallerySource: entry.isMusicGallerySource,
        providerImageScoreAdjustment: entry.providerImageScoreAdjustment,
        coverProvenance: entry.coverProvenance,
        providerLabel: entry.providerLabel,
        sourceNames: entry.sourceNames,
        width: entry.width,
        height: entry.height,
        meanLuminance: entry.meanLuminance,
        darkPixelRatio: entry.darkPixelRatio,
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
    const attachmentByNormalizedUrl = new Map<string, MetadataAttachment>();
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
        // Provider covers are localized to `/uploads` before metadata lands —
        // do not invent "user"/"Perso" without a real gallery row.
        source: matching?.source || null,
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
          (a) => a.url === metadata.imageUrl,
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

    const mediaForCover = {
      imageUrl: item?.imageUrl ?? prefilledValues?.imageUrl ?? null,
      updatedAt: item?.updatedAt,
      condition: watchedCondition ?? item?.condition ?? null,
      metadata,
      shelf: activeShelfForMedia,
    };

    const orderedCovers = mergeCoverAttachmentsForPicker(
      mediaForCover,
      attachments,
      locale,
    );

    // "Par défaut" = top of the dynamic gallery ranking (same as displayed cover
    // when the user has not explicitly picked one).
    const defaultCoverUrl =
      orderedCovers[0]?.url ??
      getCoverImage({ ...mediaForCover, imageUrl: null }, locale);

    return orderedCovers.map((attachment) => {
      const gallery = getAttachmentGalleryLabels(
        {
          type: attachment.type,
          role: attachment.role,
          title: attachment.title,
          source: attachment.source,
          providerLabel: attachment.providerLabel,
          sourceNames: attachment.sourceNames,
          gridStyleCoverLabelsSource:
            attachment.gridStyleCoverLabelsSource ??
            attachmentTraitsOf(attachment).gridStyleCoverLabelsSource,
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
        gallerySourceNames: gallery.sourceNames,
        galleryDetail: gallery.detail,
      };
    });
  }, [
    itemId,
    item,
    fetchedMetadata,
    prefilledValues?.imageUrl,
    activeShelfForMedia,
    activeShelfType,
    watchedCondition,
    locale,
    t,
  ]);

  const currentImageUrl = useWatch({ control: form.control, name: "imageUrl" });
  const [pendingUploadPreviewUrl, setPendingUploadPreviewUrl] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!(currentImageUrl instanceof File)) {
      setPendingUploadPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(currentImageUrl);
    setPendingUploadPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [currentImageUrl]);

  const finalImages = useMemo(() => {
    const rawMetadata =
      itemId && item?.metadata
        ? item.metadata
        : (item?.metadata ?? fetchedMetadata);
    const metadata = filterMetadataForShelfPlatform(
      rawMetadata,
      activeShelfForMedia,
    );
    const displayLocale: AttachmentDisplayLocale =
      locale === "en" ? "en" : "fr";
    const list = [...availableImages];

    if (pendingUploadPreviewUrl) {
      list.unshift({
        url: pendingUploadPreviewUrl,
        type: "image",
        label: t("items.editTabs.chooseImage"),
        source: "user",
        role: null,
        galleryProvider: "Perso",
        gallerySourceNames: ["Perso"],
        galleryDetail: null,
      });
      return list;
    }

    if (
      currentImageUrl &&
      typeof currentImageUrl === "string" &&
      !availableImages.some((img) =>
        urlsReferToSameLocalizedImage(img.url, currentImageUrl),
      )
    ) {
      const provenance = findAttachmentForUrl(
        metadata?.attachments || [],
        currentImageUrl,
      );
      const gallery = provenance
        ? getAttachmentGalleryLabels(
            {
              type: provenance.type,
              role: provenance.role,
              title: provenance.title,
              source: provenance.source,
              providerLabel: attachmentTraitsOf(provenance).providerLabel,
              gridStyleCoverLabelsSource:
                attachmentTraitsOf(provenance).gridStyleCoverLabelsSource,
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
        gallerySourceNames: gallery?.sourceNames ?? [],
        galleryDetail: gallery?.detail ?? null,
      });
    }

    return list;
  }, [
    availableImages,
    currentImageUrl,
    pendingUploadPreviewUrl,
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
          const matches: GameMatch[] = data?.matches || [];
          const suggestions = data?.suggestions || [];
          const cleanName = data?.cleanName;
          const rawNames = data?.rawNames || [];
          const platformKey = data?.platformKey;
          // Physical-format + brand clues ("DVD", "DISNEY JUNIOR") lead so a
          // matching format shelf is recommended over a generic same-type one.
          const shelfHints = shelfSearchHintsFromBarcodePayload(data || {});

          const allSearchNames = Array.from(
            new Set([
              ...shelfHints,
              ...(displayName ? [displayName] : []),
              ...(cleanName ? [cleanName] : []),
              ...rawNames,
              ...suggestions,
              ...matches.map((m) => m.name),
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
          const dataMatches = data.matches as GameMatch[];
          setMatches(dataMatches);

          let chosenMatch = dataMatches[0];
          if (prefilledValues?.name) {
            const matchByName = dataMatches.find(
              (m) =>
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

          if (!form.getValues("name") || prefilledValues?.name) {
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

            if (!form.getValues("name") || prefilledValues?.name) {
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

            if (!form.getValues("name") || prefilledValues?.name) {
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
    [
      form,
      activeShelfType,
      fetchMetadataPreview,
      shelves,
      shelfId,
      prefilledValues,
    ],
  );

  const handleBarcodeChangeRef = useRef(handleBarcodeChange);
  handleBarcodeChangeRef.current = handleBarcodeChange;
  const fetchMetadataPreviewRef = useRef(fetchMetadataPreview);
  fetchMetadataPreviewRef.current = fetchMetadataPreview;

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
      const imageUrl = await localizeImageFieldForSubmit(values.imageUrl);
      const backgroundImageUrl = await localizeImageFieldForSubmit(
        values.backgroundImageUrl,
        { trim: false },
      );

      // Form payload forwarded to the parent's onSubmit. It carries a scalar
      // `shelfId` (and a raw `id`), which Prisma's *checked* create/update input
      // types don't accept (they expect `shelf: { connect }`); the parent
      // adapts it before hitting Prisma. `any` is load-bearing at that boundary.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedItem: any = {
        ...values,
        id: item ? item?.id : undefined,
        imageUrl: imageUrl,
        backgroundImageUrl: backgroundImageUrl,
        // Create-from-scan: persist the preview so the item page keeps gallery /
        // facts while background enrichment runs (otherwise only the chosen cover survives).
        ...(item
          ? {}
          : {
              metadataPreview:
                fetchedMetadata ?? prefilledValues?.metadataPreview ?? null,
            }),
      };

      await onSubmit(updatedItem);
      if (itemId) {
        void invalidateItemQueries(queryClient, itemId, [
          shelfId,
          values.shelfId,
        ]);
      }
      onClose();
    } catch (error) {
      if (!isAbortError(error)) {
        console.error("Error submitting form:", error);
        toast.error(t("items.saveFailed"));
      }
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
    cancelMetadataRequests();
    setSuggestions([]);
    setNameSuggestion(null);
    setActiveTab(defaultTab || "general");
    setSessionState(null);
    setFetchedMetadata(null);
    lastInitializedShelfIdRef.current = null;
    onClose();
  };

  useEffect(() => {
    if (!sessionState) return;

    reset(sessionState.init.formValues);
    lastInitializedShelfIdRef.current =
      sessionState.init.lastInitializedShelfId;

    const asyncInit = sessionState.init.asyncInit;
    if (!asyncInit) return;

    void Promise.resolve().then(() => {
      if (asyncInit.kind === "barcode") {
        return handleBarcodeChangeRef.current(asyncInit.barcode);
      }
      fetchMetadataPreviewRef.current(asyncInit.name, "");
    });
    // Bootstrap only when the modal session identity changes. Do not depend on
    // fetchMetadataPreview / handleBarcodeChange — those recreate when the
    // selected shelf type changes and would reset shelfId mid-edit.
  }, [sessionState, reset]);

  // Re-fetch metadata preview when shelf/platform changes.
  useEffect(() => {
    if (!isOpen || !sessionState?.key || !lastInitializedShelfIdRef.current)
      return;
    if (currentShelfId !== lastInitializedShelfIdRef.current) {
      lastInitializedShelfIdRef.current = currentShelfId;
      const name = form.getValues("name");
      const barcode = form.getValues("barcode") || "";
      if (name) {
        fetchMetadataPreview(name, barcode, true);
      }
    }
  }, [currentShelfId, isOpen, sessionState?.key, fetchMetadataPreview, form]);

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

    if (prefilledPreviewRequestRef.current === requestKey) return;
    prefilledPreviewRequestRef.current = requestKey;
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
          <span className="block text-left">
            {item
              ? `${t("items.editItem")} : ${item.name}`
              : t("items.addNewItem")}
          </span>
        }
        description={
          <span className="block text-left">
            {item ? t("items.editItemDetails") : t("items.createNewItem")}
          </span>
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
                                {shelfOptions.map((s) => {
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
                                placeholder={t(
                                  itemsBarcodePlaceholderKey(shelfType),
                                )}
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
                                    if (suggestions.length > 0) return;

                                    const metadata =
                                      filterMetadataForShelfPlatform(
                                        item?.metadata || fetchedMetadata,
                                        activeShelfForMedia,
                                      );
                                    if (metadata) {
                                      const storedName = (
                                        item?.storedName ??
                                        field.value ??
                                        form.getValues("name") ??
                                        ""
                                      ).trim();
                                      const seeded =
                                        collectMetadataTitleSuggestions(
                                          metadata,
                                          {
                                            itemName: storedName,
                                            barcode:
                                              form.getValues("barcode") ||
                                              item?.barcode ||
                                              null,
                                          },
                                        );
                                      if (seeded.length > 0) {
                                        setSuggestions(seeded);
                                        setNameSuggestion(seeded[0]);
                                        return;
                                      }
                                    }

                                    fetchNameSuggestions(
                                      field.value ||
                                        form.getValues("name") ||
                                        "",
                                    );
                                  }}
                                  onBlur={() => {
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

                    {activeShelfType === "games" && (
                      <div className="flex flex-col gap-1.5 -mt-1">
                        <input
                          ref={dumpFileInputRef}
                          type="file"
                          className="hidden"
                          onChange={handleDumpFileSelect}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-fit rounded-lg text-xs font-semibold"
                          disabled={isHashingDump || isFetchingMetadata}
                          onClick={() => dumpFileInputRef.current?.click()}
                        >
                          {isHashingDump ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <HardDrive className="size-3.5" />
                          )}
                          {isHashingDump
                            ? t("items.hashDumpProgress").replace(
                                "{percent}",
                                String(hashDumpPercent),
                              )
                            : t("items.hashDump")}
                        </Button>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {t("items.hashDumpHint")}
                        </p>
                      </div>
                    )}

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
                              className="flex w-full flex-wrap gap-2 p-1 bg-zinc-200/50 dark:bg-zinc-900/60 rounded-xl border border-border/40"
                              value={field.value}
                              onValueChange={(value) => {
                                // Radix allows clearing a single toggle — keep one grade selected.
                                if (value) field.onChange(value);
                              }}
                            >
                              {itemConditionsForShelfType(activeShelfType).map(
                                (condition) => {
                                  const isActive = field.value === condition;
                                  return (
                                    <ToggleGroupItem
                                      key={condition}
                                      value={condition}
                                      aria-label={condition}
                                      className={cn(
                                        "flex flex-auto py-2.5 px-3 gap-1.5 text-xs font-bold rounded-lg transition-all duration-200 border border-transparent hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 text-muted-foreground cursor-pointer select-none",
                                        isActive
                                          ? conditionToggleActiveClass(
                                              condition,
                                            )
                                          : "bg-transparent hover:text-foreground",
                                      )}
                                    >
                                      <ConditionIcon condition={condition} />
                                      <span className="shrink-0 font-medium">
                                        {t(`items.conditions.${condition}`)}
                                      </span>
                                    </ToggleGroupItem>
                                  );
                                },
                              )}
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
                                const selectedCoverUrl = currentImageUrl;
                                const isSelected =
                                  pendingUploadPreviewUrl != null
                                    ? img.url === pendingUploadPreviewUrl
                                    : typeof selectedCoverUrl === "string" &&
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
                                      sizes="180px"
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
                                    <div
                                      className="absolute top-1.5 left-1.5 z-30"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <AttachmentSourceChip
                                        className="items-start"
                                        badgeClassName="text-[8px] font-extrabold bg-black/85 tracking-wider leading-none"
                                        detailClassName="text-[8px] bg-black/85 text-zinc-300 leading-none"
                                        sourceNames={
                                          img.gallerySourceNames ??
                                          (img.galleryProvider
                                            ? [img.galleryProvider]
                                            : [])
                                        }
                                        detail={img.galleryDetail}
                                      />
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
                                  currentBackgroundUrl === img.url;
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
                                      sizes="180px"
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
                                    <div
                                      className="absolute top-1.5 left-1.5 z-30"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <AttachmentSourceChip
                                        className="items-start"
                                        badgeClassName="text-[8px] font-extrabold bg-black/85 tracking-wider leading-none"
                                        detailClassName="text-[8px] bg-black/85 text-zinc-300 leading-none"
                                        sourceNames={
                                          img.gallerySourceNames ??
                                          (img.galleryProvider
                                            ? [img.galleryProvider]
                                            : [])
                                        }
                                        detail={img.galleryDetail}
                                      />
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
              // Zoom plein écran d'une URL arbitraire (distante ou blob),
              // affichée telle quelle sans optimisation.
              // eslint-disable-next-line @next/next/no-img-element
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
