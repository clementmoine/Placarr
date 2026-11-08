import { Prisma, Type } from "@/generated/prisma/browser";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

import {
  canReadOwnedRow,
  collectionUserIdFor,
  getCollectionOwnerId,
  requireGuestOrHigher,
} from "@/lib/auth";
import { withRequestUiLocale } from "@/core/locale/serverPreference";

import {
  downloadRemoteImage,
  syncCroppedCoverAttachment,
  storeMetadata,
} from "@/core/enrich/storage";
import {
  presentItemFromStorage,
  itemDetailMetadataInclude,
} from "@/core/collect/present";
import type { MetadataResult } from "@/types/metadataProvider";
import { asSeedableMetadataPreview } from "@/core/collect/seedMetadataPreview";
import {
  applySeriesDisplayName,
  applySeriesDisplayNamesByShelf,
  seriesTitleEntryFromItemRow,
} from "@/core/enrich/titles/series";
import { resolveShelfId, resolveItemId } from "@/lib/routing/resolveIds";
import { allocateUniqueItemSlug } from "@/lib/routing/itemSlug";
import { buildBarcodePlaceholderItemName } from "@/core/collect/placeholderName";
import { resolveItemMetadataLookupQuery } from "@/core/collect/metadataLookupQuery";
import {
  catalogueSetFromPrintKey,
  isPrintKey,
  parsePrintKey,
} from "@/core/identify/printKey";
import { lookupPrintCandidate, supportsPrintSearch } from "@/core/identify/printSearch";
import { isPrintKeyPlaceholderItemName } from "@/core/collect/adoptMetadataTitle";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { parseItemCondition } from "@/core/collect/condition";
import {
  buildPresenceEvent,
  isAwaitingReceiptReason,
  normalizeItemAbsenceInput,
  ownedAbsenceState,
  parsePriceCents,
  type ItemAbsenceFields,
} from "@/core/collect/itemAbsence";
import {
  mergeItemGrade,
  rawGradeState,
  type ItemGradeFields,
} from "@/core/collect/itemGrade";
import {
  defaultItemKind,
  isItemKind,
  sealedAcquisitionSnapshot,
  type ItemKind,
} from "@/core/collect/itemKind";
import { buildExactBarcodeSearchCondition } from "@/core/collect/search";
import { buildItemSearchConditionsFolded } from "@/core/collect/searchFolded";
import {
  startItemMetadataRefresh,
  shelfMoveMetadataResetData,
} from "@/core/collect/jobs/scheduleMetadataRefresh";
import { clearStaleMetadataRefreshStartedAtIfNeeded } from "@/core/collect/jobs/metadataRefreshSession";
import {
  itemPricesContextFromRecord,
  readItemPrices,
  summarizeListItemPrices,
  itemPricesContextFromPresentedShelfItem,
  shelfGridItemPriceFields,
} from "@/core/commerce/pricing/itemDisplay";

const VALID_SHELF_TYPES = new Set<string>(Object.values(Type));

function parseShelfTypesParam(value: string | null): {
  values?: Type[];
  invalid?: string[];
} {
  if (!value) return {};

  const requested = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = requested.filter((item) => !VALID_SHELF_TYPES.has(item));
  if (invalid.length > 0) return { invalid };

  return { values: requested as Type[] };
}

export async function GET(req: NextRequest) {
  return withRequestUiLocale(req, async (uiLocale) => {
    const auth = await requireGuestOrHigher(req);
    if (auth instanceof NextResponse) return auth;
    const isAdmin = auth.user.role === "admin";

    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get("id");
    const q = searchParams.get("q");
    const shelfId = searchParams.get("shelfId");
    const parsedExcludeShelfTypes = parseShelfTypesParam(
      searchParams.get("excludeShelfTypes"),
    );
    const parsedIncludeShelfTypes = parseShelfTypesParam(
      searchParams.get("shelfTypes"),
    );
    if (parsedExcludeShelfTypes.invalid || parsedIncludeShelfTypes.invalid) {
      return NextResponse.json(
        {
          error: "Invalid shelf type",
          invalidShelfTypes: [
            ...(parsedExcludeShelfTypes.invalid || []),
            ...(parsedIncludeShelfTypes.invalid || []),
          ],
        },
        { status: 400 },
      );
    }
    const excludeShelfTypes = parsedExcludeShelfTypes.values;
    const includeShelfTypes = parsedIncludeShelfTypes.values;
    const includeMetadata = searchParams.get("includeMetadata") !== "false"; // Par défaut true
    const scopeUserId = await collectionUserIdFor(auth.user);
    const collectionOwnerId =
      auth.user.role === "guest" ? scopeUserId : await getCollectionOwnerId();

    if (id) {
      const resolvedId = await resolveItemId(id, shelfId, scopeUserId);
      const item = await prisma.item.findUnique({
        where: { id: resolvedId },
        include: {
          shelf: true,
          metadata: includeMetadata ? itemDetailMetadataInclude : false,
        },
      });

      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      // Mono-instance: admin, owner, or guest browsing the owner's collection.
      if (!canReadOwnedRow(auth.user, item.userId, collectionOwnerId)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      void clearStaleMetadataRefreshStartedAtIfNeeded(
        item.id,
        item.metadataRefreshStartedAt,
      );

      const prices = await readItemPrices(itemPricesContextFromRecord(item));
      const presented = presentItemFromStorage(item, { uiLocale });
      const siblingRows = await prisma.item.findMany({
        where: { shelfId: item.shelfId },
        select: {
          id: true,
          name: true,
          metadata: { select: { title: true } },
        },
      });
      const withSeries = applySeriesDisplayName(
        presented,
        siblingRows.map(seriesTitleEntryFromItemRow),
      );
      return NextResponse.json({
        ...withSeries,
        ...(prices ?? {
          priceNew: null,
          priceUsed: null,
          priceUsedCIB: null,
          priceLastUpdated: null,
        }),
      });
    }

    const whereClause: Prisma.ItemWhereInput = {};

    // Lists are scoped to the caller's collection (guests → instance owner).
    // Admins see everything.
    if (!isAdmin) {
      whereClause.userId = scopeUserId;
    }

    if (q) {
      const barcodeExact = searchParams.get("barcodeExact") === "true";
      const exactBarcodeCondition = barcodeExact
        ? buildExactBarcodeSearchCondition(q)
        : null;

      if (barcodeExact) {
        if (!exactBarcodeCondition) {
          return NextResponse.json([]);
        }
        Object.assign(whereClause, exactBarcodeCondition);
      } else {
        whereClause.OR = await buildItemSearchConditionsFolded(q);
      }
    }

    if (shelfId) {
      whereClause.shelfId = await resolveShelfId(shelfId, scopeUserId);
    }

    if (excludeShelfTypes?.length || includeShelfTypes?.length) {
      whereClause.shelf = includeShelfTypes?.length
        ? { type: { in: includeShelfTypes } }
        : { type: { notIn: excludeShelfTypes! } };
    }

    const items = await prisma.item.findMany({
      where: whereClause,
      include: {
        shelf: true,
        metadata: includeMetadata
          ? {
              include: {
                attachments: true,
                authors: true,
                publishers: true,
              },
            }
          : false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (includeMetadata) {
      const priceByItemId = await summarizeListItemPrices(items);
      return NextResponse.json(
        applySeriesDisplayNamesByShelf(
          items.map((item) => {
            const presented = presentItemFromStorage(item, { uiLocale });
            const prices = shelfGridItemPriceFields(
              itemPricesContextFromPresentedShelfItem(
                {
                  id: item.id,
                  name: item.name,
                  barcode: item.barcode,
                  printKey: item.printKey,
                  metadataId: item.metadataId,
                  metadataRefreshStartedAt: item.metadataRefreshStartedAt,
                  metadata: presented.metadata as MetadataResult | null,
                },
                item.shelf,
              ),
              priceByItemId.get(item.id) ?? null,
            );
            return {
              ...presented,
              ...prices,
            };
          }),
        ),
      );
    }

    return NextResponse.json(items);
  });
}

export async function POST(req: NextRequest) {
  return withRequestUiLocale(req, async (uiLocale) => {
    const auth = await requireGuestOrHigher(req);
    if (auth instanceof NextResponse) return auth;

    // Only admin and regular users can create items
    if (auth.user.role === "guest") {
      return NextResponse.json(
        { error: "Guests cannot create items" },
        { status: 403 },
      );
    }

    try {
      const body = await req.json();
      const {
        shelfId,
        name,
        description,
        imageUrl,
        backgroundImageUrl,
        barcode,
        printKey: rawPrintKey,
        setCode: rawSetCode,
        variant: rawVariant,
        language: rawLanguage,
        condition,
        fetchMetadata = true,
        metadataPreview,
        kind: rawKind,
        skuKey: rawSkuKey,
        skuName: rawSkuName,
        skuLanguage: rawSkuLanguage,
        purchasePriceCents: rawPurchasePriceCents,
        purchasedAt: rawPurchasedAt,
        catalogueKind: rawCatalogueKind,
        loanedTo: rawLoanedTo,
        loanedAt: rawLoanedAt,
        presence: rawPresence,
        absenceReason: rawAbsenceReason,
        absenceSince: rawAbsenceSince,
        absenceRecipient: rawAbsenceRecipient,
        absenceSource: rawAbsenceSource,
        absenceCarrier: rawAbsenceCarrier,
        absenceTracking: rawAbsenceTracking,
        absenceOrderRef: rawAbsenceOrderRef,
        absenceOrderUrl: rawAbsenceOrderUrl,
        absenceNote: rawAbsenceNote,
        absencePriceCents: rawAbsencePriceCents,
        absenceExpectedAt: rawAbsenceExpectedAt,
        gradeStatus: rawGradeStatus,
        gradeHouse: rawGradeHouse,
        gradeLabel: rawGradeLabel,
        gradeCertNo: rawGradeCertNo,
        gradedAt: rawGradedAt,
      } = body;
      if (typeof shelfId !== "string" || !shelfId.trim()) {
        return NextResponse.json(
          { error: "Shelf ID is required" },
          { status: 400 },
        );
      }

      const resolvedCondition = parseItemCondition(condition, "used");
      if (resolvedCondition == null) {
        return NextResponse.json(
          { error: "Invalid item condition" },
          { status: 400 },
        );
      }

      const normalizedBarcode = normalizeProductBarcode(
        typeof barcode === "string" ? barcode : null,
      );
      // Cards are anchored by their printing rather than a barcode. Store only
      // a key that parses: an unusable one would never resolve again, and would
      // be indistinguishable from a real anchor at read time.
      let printKey =
        typeof rawPrintKey === "string" && parsePrintKey(rawPrintKey)
          ? rawPrintKey.trim().toLowerCase()
          : null;
      // Free text on purpose: the vocabulary is the provider's, not ours. It is
      // validated against the metadata's declared options at read time, so an
      // unknown value degrades to "no variant" rather than being rejected here.
      const variant =
        typeof rawVariant === "string" && rawVariant.trim()
          ? rawVariant.trim()
          : null;
      /*
        La langue de **cet exemplaire**, pas du tirage : une clé vaut pour
        toutes les localisations d'une carte, et sans cette colonne l'Inari
        française et l'イナリ japonaise étaient le même objet. Code court en
        minuscules, comme les sources le donnent ; absent = inconnu, jamais
        « la langue par défaut ».
      */
      const language =
        typeof rawLanguage === "string" && rawLanguage.trim()
          ? rawLanguage.trim().toLowerCase()
          : null;
      const earlySkuName =
        typeof rawSkuName === "string" && rawSkuName.trim()
          ? rawSkuName.trim()
          : null;
      const earlySkuKey =
        typeof rawSkuKey === "string" && rawSkuKey.trim()
          ? rawSkuKey.trim()
          : null;
      let resolvedName = typeof name === "string" ? name.trim() : "";
      if (!resolvedName) {
        if (normalizedBarcode) {
          resolvedName = buildBarcodePlaceholderItemName(normalizedBarcode);
        } else if (earlySkuName || earlySkuKey) {
          resolvedName = earlySkuName || earlySkuKey!;
        } else {
          return NextResponse.json(
            { error: "Name, barcode, or sealed SKU is required" },
            { status: 400 },
          );
        }
      }
      // Scan used to send only `name: "naruto:ns-0003"` — recover the key so
      // local catalogue enrich can resolve (adapters are printKey-gated).
      if (!printKey && isPrintKey(resolvedName)) {
        printKey = resolvedName.trim().toLowerCase();
      }

      const resolvedShelfId = await resolveShelfId(shelfId, auth.user.id);

      // Check if shelf exists and user has permission to add items to it
      const shelf = await prisma.shelf.findUnique({
        where: { id: resolvedShelfId },
        select: { type: true, userId: true, name: true },
      });

      if (!shelf) {
        return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
      }

      // Only allow if user is admin or the shelf owner
      if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
        return NextResponse.json(
          { error: "You don't have permission to add items to this shelf" },
          { status: 403 },
        );
      }

      // Catalogue title immediately when the body still carries the printKey
      // as a placeholder name (scan tray) — same as batch resolve / PrintPicker.
      if (printKey && supportsPrintSearch(shelf.type)) {
        try {
          const hit = await lookupPrintCandidate(printKey, shelf.type, {
            language: language ?? undefined,
          });
          const title = hit?.title?.trim();
          if (
            title &&
            isPrintKeyPlaceholderItemName(resolvedName, printKey)
          ) {
            resolvedName = title;
          }
        } catch (error) {
          console.warn(
            `[Items] print title lookup failed for ${printKey}:`,
            error,
          );
        }
      }

      /*
        Extension checklist. Prefer body; else the set segment of a set-scoped
        printKey (`naruto:s3-ta0074`, `lorcana:1-106`). Legacy family-as-set
        keys (`naruto:ni-0049`) yield null — set is not the series.
      */
      const setCodeFromBody =
        typeof rawSetCode === "string" && rawSetCode.trim()
          ? rawSetCode.trim().toLowerCase()
          : null;
      const setCode = setCodeFromBody || catalogueSetFromPrintKey(printKey);

      const skuKey =
        typeof rawSkuKey === "string" && rawSkuKey.trim()
          ? rawSkuKey.trim()
          : null;
      const skuName =
        typeof rawSkuName === "string" && rawSkuName.trim()
          ? rawSkuName.trim()
          : null;
      const skuLanguage =
        typeof rawSkuLanguage === "string" && rawSkuLanguage.trim()
          ? rawSkuLanguage.trim().toLowerCase()
          : language;
      const catalogueKind =
        typeof rawCatalogueKind === "string" && rawCatalogueKind.trim()
          ? rawCatalogueKind.trim()
          : null;
      const purchasePriceCents = (() => {
        if (
          typeof rawPurchasePriceCents === "number" &&
          Number.isFinite(rawPurchasePriceCents) &&
          rawPurchasePriceCents >= 0
        ) {
          return Math.round(rawPurchasePriceCents);
        }
        if (typeof rawPurchasePriceCents === "string") {
          const n = Number(rawPurchasePriceCents.trim());
          if (Number.isFinite(n) && n >= 0) return Math.round(n);
        }
        return null;
      })();
      const purchasedAt = (() => {
        if (rawPurchasedAt == null || rawPurchasedAt === "") return null;
        const d = new Date(rawPurchasedAt as string | number | Date);
        return Number.isNaN(d.getTime()) ? null : d;
      })();
      const kind: ItemKind = defaultItemKind({
        printKey,
        skuKey,
        kind: isItemKind(rawKind) ? rawKind : null,
      });
      if (skuKey && !resolvedName) {
        resolvedName = skuName || skuKey;
      }

      let localImageUrl = imageUrl;
      let localBackgroundImageUrl = backgroundImageUrl;

      // No automatic crop: it rewrote the stored URL to a derived `_edited` file,
      // which detached the cover from its gallery attachment (losing source and
      // region) and could never be undone. Framing is the collector's call.
      if (imageUrl) {
        localImageUrl = await downloadRemoteImage(imageUrl);
      }
      if (backgroundImageUrl) {
        localBackgroundImageUrl = await downloadRemoteImage(backgroundImageUrl);
      }

      const itemSlug = await allocateUniqueItemSlug(
        resolvedShelfId,
        resolvedName,
        { print: { printKey, variant, language, setCode } },
      );

      const absence: ItemAbsenceFields =
        normalizeItemAbsenceInput({
          loanedTo: rawLoanedTo,
          loanedAt: rawLoanedAt,
          presence: rawPresence,
          absenceReason: rawAbsenceReason,
          absenceSince: rawAbsenceSince,
          absenceRecipient: rawAbsenceRecipient,
          absenceSource: rawAbsenceSource,
          absenceCarrier: rawAbsenceCarrier,
          absenceTracking: rawAbsenceTracking,
          absenceOrderRef: rawAbsenceOrderRef,
          absenceOrderUrl: rawAbsenceOrderUrl,
          absenceNote: rawAbsenceNote,
          absencePriceCents: rawAbsencePriceCents,
          absenceExpectedAt: rawAbsenceExpectedAt,
        }) ?? ownedAbsenceState();

      const grade: ItemGradeFields =
        mergeItemGrade(null, {
          gradeStatus: rawGradeStatus,
          gradeHouse: rawGradeHouse,
          gradeLabel: rawGradeLabel,
          gradeCertNo: rawGradeCertNo,
          gradedAt: rawGradedAt,
        }) ?? rawGradeState();

      const sealedSnapshot = skuKey
        ? sealedAcquisitionSnapshot({
            skuKey,
            skuName: skuName || resolvedName,
            skuLanguage,
            purchasePriceCents,
            purchasedAt,
            imageUrl:
              typeof localImageUrl === "string" ? localImageUrl : null,
            catalogueKind,
          })
        : null;

      const acquiredEvent = buildPresenceEvent({
        from: "owned",
        to: "owned",
        kind: "acquired",
        at: purchasedAt ?? undefined,
        extraSnapshot: sealedSnapshot,
      });

      const departedEvent =
        absence.presence !== "owned"
          ? buildPresenceEvent({
              from: "owned",
              to: absence.presence,
              reason: absence.absenceReason,
              at: absence.absenceSince ?? undefined,
              fields: absence,
            })
          : null;

      const item = await prisma.item.create({
        data: {
          shelfId: resolvedShelfId,
          name: resolvedName,
          slug: itemSlug,
          description,
          imageUrl: localImageUrl,
          backgroundImageUrl: localBackgroundImageUrl,
          barcode: normalizedBarcode ?? barcode,
          printKey,
          setCode,
          variant,
          language,
          condition: resolvedCondition,
          kind,
          skuKey,
          skuName: skuName || (skuKey ? resolvedName : null),
          skuLanguage: skuKey ? skuLanguage : null,
          purchasePriceCents,
          purchasedAt,
          ...absence,
          ...grade,
          userId: auth.user.id,
        },
        include: {
          shelf: true,
          metadata: {
            include: {
              attachments: true,
              authors: true,
              publishers: true,
            },
          },
        },
      });

      const writePresenceEvent = async (
        event: NonNullable<typeof acquiredEvent>,
      ) => {
        await prisma.itemPresenceEvent.create({
          data: {
            itemId: item.id,
            at: event.at,
            fromPresence: event.fromPresence,
            toPresence: event.toPresence,
            reason: event.reason,
            kind: event.kind,
            snapshot:
              event.snapshot == null
                ? Prisma.JsonNull
                : (event.snapshot as Prisma.InputJsonValue),
          },
        });
      };

      await writePresenceEvent(acquiredEvent);
      if (departedEvent) await writePresenceEvent(departedEvent);
      if (grade.gradeStatus !== "raw") {
        await writePresenceEvent(
          buildPresenceEvent({
            from: absence.presence,
            to: absence.presence,
            kind:
              grade.gradeStatus === "submitted"
                ? "grade_submitted"
                : "grade_updated",
            at: grade.gradedAt ?? undefined,
            extraSnapshot: {
              gradeStatus: grade.gradeStatus,
              gradeHouse: grade.gradeHouse,
              gradeLabel: grade.gradeLabel,
              gradeCertNo: grade.gradeCertNo,
              gradedAt: grade.gradedAt?.toISOString() ?? null,
            },
          }),
        );
      }

      // Scan/modal already fetched a rich preview — seed it so the item page
      // is not empty while the background worker deepens enrichment.
      const seedPreview = asSeedableMetadataPreview(metadataPreview);
      if (seedPreview) {
        try {
          await storeMetadata(item.id, seedPreview, shelf.type, resolvedName, {
            deferImageLocalization: true,
            skipDeferredLocalizationSchedule: true,
          });
        } catch (error) {
          console.error(
            `[Items] Failed to seed metadata preview for ${item.id}:`,
            error,
          );
        }
      }

      if (fetchMetadata) {
        await startItemMetadataRefresh({
          itemId: item.id,
          lookupQuery: resolveItemMetadataLookupQuery({
            name: resolvedName,
            barcode: normalizedBarcode ?? barcode,
          }),
          shelfType: shelf.type,
          barcode: normalizedBarcode ?? barcode,
          shelfName: shelf.name,
          bypassMetadataCache: false,
          forceRefresh: true,
        });
      }

      const itemForResponse = seedPreview
        ? await prisma.item.findUnique({
            where: { id: item.id },
            include: {
              shelf: true,
              metadata: itemDetailMetadataInclude,
            },
          })
        : item;

      return NextResponse.json(
        presentItemFromStorage(itemForResponse ?? item, { uiLocale }),
      );
    } catch (error) {
      console.error("Error in POST request:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withRequestUiLocale(req, async (uiLocale) => {
    const auth = await requireGuestOrHigher(req);
    if (auth instanceof NextResponse) return auth;

    // Only admin and regular users can update items
    if (auth.user.role === "guest") {
      return NextResponse.json(
        { error: "Guests cannot update items" },
        { status: 403 },
      );
    }

    try {
      const searchParams = req.nextUrl.searchParams;
      const body = await req.json();
      const { id, refreshMetadata, lookupQuery, currentShelfId, ...raw } = body;
      const requestId = typeof id === "string" ? id : searchParams.get("id");
      const sourceShelfId =
        typeof currentShelfId === "string"
          ? currentShelfId
          : searchParams.get("shelfId");

      if (!requestId) {
        return NextResponse.json(
          { error: "Item ID is required" },
          { status: 400 },
        );
      }

      const data: {
        name?: string;
        description?: string | null;
        imageUrl?: string | null;
        backgroundImageUrl?: string | null;
        barcode?: string | null;
        variant?: string | null;
        condition?: NonNullable<ReturnType<typeof parseItemCondition>>;
        shelfId?: string;
        slug?: string;
        metadataId?: null;
        purchasePriceCents?: number | null;
        purchasedAt?: Date | null;
      } & Partial<ItemAbsenceFields> &
        Partial<ItemGradeFields> = {};

      if (typeof raw.name === "string") data.name = raw.name;
      if ("variant" in raw) {
        const next =
          typeof raw.variant === "string" && raw.variant.trim()
            ? raw.variant.trim()
            : null;
        data.variant = next;
      }
      if (
        "description" in raw &&
        (typeof raw.description === "string" || raw.description === null)
      ) {
        data.description = raw.description;
      }
      if (
        "imageUrl" in raw &&
        (typeof raw.imageUrl === "string" || raw.imageUrl === null)
      ) {
        data.imageUrl = raw.imageUrl;
      }
      if (
        "backgroundImageUrl" in raw &&
        (typeof raw.backgroundImageUrl === "string" ||
          raw.backgroundImageUrl === null)
      ) {
        data.backgroundImageUrl = raw.backgroundImageUrl;
      }
      if (
        "barcode" in raw &&
        (typeof raw.barcode === "string" || raw.barcode === null)
      ) {
        data.barcode = raw.barcode;
      }
      if ("condition" in raw) {
        const resolvedCondition = parseItemCondition(raw.condition);
        if (resolvedCondition == null) {
          return NextResponse.json(
            { error: "Invalid item condition" },
            { status: 400 },
          );
        }
        data.condition = resolvedCondition;
      }
      const absencePatch = normalizeItemAbsenceInput(
        raw as Record<string, unknown>,
      );
      if (absencePatch) {
        Object.assign(data, absencePatch);
      }
      if ("purchasePriceCents" in raw) {
        data.purchasePriceCents = parsePriceCents(raw.purchasePriceCents);
      }
      if ("purchasedAt" in raw) {
        if (raw.purchasedAt == null || raw.purchasedAt === "") {
          data.purchasedAt = null;
        } else {
          const d = new Date(raw.purchasedAt as string | number | Date);
          data.purchasedAt = Number.isNaN(d.getTime()) ? null : d;
        }
      }
      // Grade patch applied after load (needs current fields) — see below.
      if (typeof raw.shelfId === "string") {
        data.shelfId = await resolveShelfId(raw.shelfId, auth.user.id);
      }

      const resolvedId = await resolveItemId(
        requestId,
        sourceShelfId,
        auth.user.id,
      );

      // Check if item exists and user has permission to update it
      const item = await prisma.item.findUnique({
        where: { id: resolvedId },
        select: {
          userId: true,
          presence: true,
          absenceReason: true,
          absenceSince: true,
          absenceRecipient: true,
          absenceSource: true,
          absenceCarrier: true,
          absenceTracking: true,
          absenceOrderRef: true,
          absenceOrderUrl: true,
          absenceNote: true,
          absencePriceCents: true,
          absenceExpectedAt: true,
          gradeStatus: true,
          gradeHouse: true,
          gradeLabel: true,
          gradeCertNo: true,
          gradedAt: true,
          shelfId: true,
          metadataId: true,
          name: true,
          barcode: true,
          imageUrl: true,
          backgroundImageUrl: true,
          shelf: { select: { type: true, name: true } },
        },
      });

      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      // Only allow if user is admin or the item owner
      if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
        return NextResponse.json(
          { error: "You don't have permission to update this item" },
          { status: 403 },
        );
      }

      const shelfChanged =
        typeof data.shelfId === "string" && data.shelfId !== item.shelfId;

      if (typeof data.name === "string" || shelfChanged) {
        data.slug = await allocateUniqueItemSlug(
          typeof data.shelfId === "string" ? data.shelfId : item.shelfId,
          typeof data.name === "string" ? data.name : item.name,
          { excludeItemId: resolvedId },
        );
      }

      if (shelfChanged) {
        Object.assign(data, shelfMoveMetadataResetData(item, data));
      }

      if (data.imageUrl) {
        const previousImageUrl = item.imageUrl;
        const selectedImageUrl =
          typeof data.imageUrl === "string" ? data.imageUrl : null;
        data.imageUrl = await downloadRemoteImage(data.imageUrl);
        // Always sync — even when the URL is unchanged — so a source=user pin
        // realigns to the cover the collector just confirmed (e.g. re-selecting
        // the stored marketplace pin while display was stuck on another image).
        if (data.imageUrl && item.metadataId) {
          const synced = await syncCroppedCoverAttachment(
            item.metadataId,
            data.imageUrl,
            previousImageUrl,
            selectedImageUrl,
          );
          if (synced.preferredImageUrl) {
            data.imageUrl = synced.preferredImageUrl;
          }
        }
      }
      if (data.backgroundImageUrl) {
        data.backgroundImageUrl = await downloadRemoteImage(
          data.backgroundImageUrl,
        );
      }

      const gradePatch = mergeItemGrade(item, {
        gradeStatus: raw.gradeStatus,
        gradeHouse: raw.gradeHouse,
        gradeLabel: raw.gradeLabel,
        gradeCertNo: raw.gradeCertNo,
        gradedAt: raw.gradedAt,
      });
      if (gradePatch) {
        Object.assign(data, gradePatch);
      }

      const presenceChanged =
        absencePatch != null &&
        (absencePatch.presence !== item.presence ||
          absencePatch.absenceReason !== item.absenceReason);

      const presenceEvent = presenceChanged
        ? buildPresenceEvent({
            from: item.presence,
            to: absencePatch.presence,
            reason: absencePatch.absenceReason,
            at: absencePatch.absenceSince ?? undefined,
            fields: absencePatch,
            // Clearing absence to owned after an order/wait → received, not a loan return.
            receiveFromOrder:
              absencePatch.presence === "owned" &&
              (item.presence === "wanted" ||
                (item.presence === "away" &&
                  isAwaitingReceiptReason(item.absenceReason))),
          })
        : null;

      const gradeChanged =
        gradePatch != null &&
        (gradePatch.gradeStatus !== item.gradeStatus ||
          gradePatch.gradeHouse !== item.gradeHouse ||
          gradePatch.gradeLabel !== item.gradeLabel ||
          gradePatch.gradeCertNo !== item.gradeCertNo);

      const updatedItem = await prisma.item.update({
        where: { id: resolvedId },
        data,
        include: {
          shelf: true,
          metadata: {
            include: {
              attachments: true,
              authors: true,
              publishers: true,
            },
          },
        },
      });

      if (presenceEvent) {
        await prisma.itemPresenceEvent.create({
          data: {
            itemId: updatedItem.id,
            at: presenceEvent.at,
            fromPresence: presenceEvent.fromPresence,
            toPresence: presenceEvent.toPresence,
            reason: presenceEvent.reason,
            kind: presenceEvent.kind,
            snapshot:
              presenceEvent.snapshot == null
                ? Prisma.JsonNull
                : (presenceEvent.snapshot as Prisma.InputJsonValue),
          },
        });
      }

      if (gradeChanged && gradePatch) {
        await prisma.itemPresenceEvent.create({
          data: {
            itemId: updatedItem.id,
            at: gradePatch.gradedAt ?? new Date(),
            fromPresence: updatedItem.presence,
            toPresence: updatedItem.presence,
            reason: null,
            kind:
              gradePatch.gradeStatus === "submitted"
                ? "grade_submitted"
                : "grade_updated",
            snapshot: {
              gradeStatus: gradePatch.gradeStatus,
              gradeHouse: gradePatch.gradeHouse,
              gradeLabel: gradePatch.gradeLabel,
              gradeCertNo: gradePatch.gradeCertNo,
              gradedAt: gradePatch.gradedAt?.toISOString() ?? null,
            } as Prisma.InputJsonValue,
          },
        });
      }

      if (typeof data.name === "string" && updatedItem.metadataId) {
        await prisma.metadata.update({
          where: { id: updatedItem.metadataId },
          data: { title: data.name },
        });
        if (updatedItem.metadata) {
          updatedItem.metadata.title = data.name;
        }
      }

      if (refreshMetadata || shelfChanged) {
        const metadataLookupQuery = resolveItemMetadataLookupQuery({
          name: updatedItem.name,
          barcode: updatedItem.barcode,
          metadataTitle: updatedItem.metadata?.title,
          explicitQuery:
            typeof lookupQuery === "string" ? lookupQuery.trim() : undefined,
        });

        const metadataRefreshStartedAt = (
          await startItemMetadataRefresh({
            itemId: updatedItem.id,
            lookupQuery: metadataLookupQuery,
            shelfType: updatedItem.shelf.type,
            barcode: shelfChanged
              ? updatedItem.barcode || undefined
              : lookupQuery
                ? undefined
                : updatedItem.barcode || undefined,
            shelfName: updatedItem.shelf.name,
            clearRemoteCover: Boolean(
              updatedItem.imageUrl && updatedItem.imageUrl.startsWith("http"),
            ),
          })
        ).startedAt;

        const itemWithRefreshFlag = await prisma.item.findUnique({
          where: { id: updatedItem.id },
          include: {
            shelf: true,
            metadata: {
              include: {
                attachments: true,
                authors: true,
                publishers: true,
              },
            },
          },
        });

        return NextResponse.json(
          presentItemFromStorage(
            {
              ...(itemWithRefreshFlag || updatedItem),
              metadataRefreshStartedAt,
            },
            { uiLocale },
          ),
        );
      }

      return NextResponse.json(
        presentItemFromStorage(updatedItem, { uiLocale }),
      );
    } catch (error) {
      console.error("Error in PATCH request:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can delete items
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot delete items" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const shelfId = searchParams.get("shelfId");

    if (!id) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 },
      );
    }

    const resolvedId = await resolveItemId(id, shelfId, auth.user.id);

    // Check if item exists and user has permission to delete it
    const item = await prisma.item.findUnique({
      where: { id: resolvedId },
      select: { userId: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Only allow if user is admin or the item owner
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to delete this item" },
        { status: 403 },
      );
    }

    await prisma.item.delete({
      where: { id: resolvedId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
