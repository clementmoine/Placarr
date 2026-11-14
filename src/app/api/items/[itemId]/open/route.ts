/**
 * Ouvre un item scellé (known_bundle / mixed_bundle / pack_container) —
 * étapes 4–6.
 *
 * Transaction : event `opened` + `openedAt` ; matérialise les enfants
 * (cartes + pile de scellés) ; liens `content` ; shell optionnel.
 * Body optionnel : `takeSealedCount`, `childBoosterSlug`, `packCount`.
 */
import { Prisma } from "@/generated/prisma/browser";
import { NextRequest, NextResponse } from "next/server";

import { allocatePurchasePriceCents } from "@/core/collect/costBasis";
import { countsAsOwned } from "@/core/collect/itemAbsence";
import { buildPresenceEvent } from "@/core/collect/itemAbsence";
import { presentItemFromStorage } from "@/core/collect/present";
import {
  parseSealedSkuKey,
  planSealedOpen,
} from "@/core/collect/sealedOpen";
import { lookupPrintCandidate } from "@/core/identify/printSearch";
import { withRequestUiLocale } from "@/core/locale/serverPreference";
import { requireGuestOrHigher } from "@/lib/auth";
import { loadSealedProductEntries } from "@/lib/collect/sealedProductsLoad";
import { prisma } from "@/lib/db/prisma";
import { allocateUniqueItemSlug } from "@/lib/routing/itemSlug";
import { resolveItemId } from "@/lib/routing/resolveIds";
import { randomUUID } from "node:crypto";

function eventSnapshot(
  snap: Record<string, unknown> | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return snap == null
    ? Prisma.JsonNull
    : (snap as Prisma.InputJsonValue);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  return withRequestUiLocale(req, async (uiLocale) => {
    const auth = await requireGuestOrHigher(req);
    if (auth instanceof NextResponse) return auth;
    if (auth.user.role === "guest") {
      return NextResponse.json(
        { error: "Guests cannot open sealed items" },
        { status: 403 },
      );
    }

    const { itemId: rawId } = await context.params;
    const shelfIdParam = req.nextUrl.searchParams.get("shelfId");
    const body = await req.json().catch(() => ({}));
    const createShell = body?.createShell === true;
    const childBoosterSlug =
      typeof body?.childBoosterSlug === "string"
        ? body.childBoosterSlug.trim()
        : "";
    const packCount =
      typeof body?.packCount === "number" && body.packCount > 0
        ? Math.floor(body.packCount)
        : null;
    const takeSealedCount =
      typeof body?.takeSealedCount === "number"
        ? Math.floor(body.takeSealedCount)
        : null;

    const resolvedId = await resolveItemId(
      rawId,
      shelfIdParam,
      auth.user.id,
    );
    const item = await prisma.item.findUnique({
      where: { id: resolvedId },
      include: { shelf: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (item.kind !== "sealed") {
      return NextResponse.json(
        { error: "Only sealed items can be opened", reason: "not_sealed" },
        { status: 400 },
      );
    }

    const parsed = parseSealedSkuKey(item.skuKey);
    if (!parsed) {
      return NextResponse.json(
        { error: "Missing skuKey", reason: "missing_sku" },
        { status: 400 },
      );
    }

    const entries = loadSealedProductEntries(parsed.packId);
    const entry = entries.find((row) => row.slug === parsed.slug);
    if (!entry) {
      return NextResponse.json(
        { error: "Sealed catalogue entry not found", reason: "missing_sku" },
        { status: 404 },
      );
    }

    const titleCache = new Map<string, string>();
    const titleForPrint = (printKey: string) => {
      const hit = titleCache.get(printKey);
      if (hit) return hit;
      return printKey;
    };

    // Best-effort catalogue titles (parallel, capped).
    const printKeys = [
      ...new Set(
        (entry.guaranteedPrints ?? [])
          .map((row) => row.printKey?.trim())
          .filter((key): key is string => Boolean(key)),
      ),
    ].slice(0, 80);
    await Promise.all(
      printKeys.map(async (printKey) => {
        try {
          const hit = await lookupPrintCandidate(printKey, item.shelf.type, {
            language: item.skuLanguage ?? item.language ?? undefined,
          });
          const title = hit?.title?.trim();
          if (title) titleCache.set(printKey, title);
        } catch {
          /* keep printKey */
        }
      }),
    );

    const plan = planSealedOpen({
      skuKey: item.skuKey,
      openedAt: item.openedAt,
      countsAsOwned: countsAsOwned(item),
      packId: parsed.packId,
      product: {
        behavior: entry.behavior,
        contentsKnown: entry.contentsKnown,
        printsArePreview: entry.containsPrintsIsPreview,
        lang: entry.lang,
        kind: entry.kind,
        name: entry.name,
        guaranteedPrints: entry.guaranteedPrints,
        guaranteedProducts: entry.guaranteedProducts,
        printKeys: entry.prints?.map((p) => p.printKey).filter(Boolean) as
          | string[]
          | undefined,
        packsContained: entry.packsContained,
        cardsPerPack: entry.cardsPerPack,
        randomPoolScope: entry.randomPoolScope,
        structureUnits: entry.structureUnits,
      },
      titleForPrint: (key) => titleForPrint(key),
      titleForSku: (slug) => {
        const child = entries.find((row) => row.slug === slug);
        return child?.name?.trim() || slug;
      },
      ...(childBoosterSlug ? { childBoosterSlug } : {}),
      ...(packCount != null ? { packCount } : {}),
      ...(takeSealedCount != null ? { takeSealedCount } : {}),
    });

    if (!plan.ok) {
      return NextResponse.json(
        { error: "Cannot open this sealed item", reason: plan.reason },
        { status: 400 },
      );
    }

    const groupId = randomUUID();
    const openedAt = new Date();
    const reservedSlugs = new Set<string>();

    const result = await prisma.$transaction(async (tx) => {
      const openedEvent = buildPresenceEvent({
        from: item.presence,
        to: item.presence,
        kind: "opened",
        at: openedAt,
        extraSnapshot: {
          groupId,
          skuKey: item.skuKey,
          skuName: item.skuName,
          childCount: plan.children.length,
          createShell,
          composition: plan.children.map((child) =>
            child.kind === "card"
              ? { kind: "card", printKey: child.printKey }
              : { kind: "sealed", skuKey: child.skuKey },
          ),
        },
      });

      const openedRow = await tx.itemPresenceEvent.create({
        data: {
          itemId: item.id,
          at: openedEvent.at,
          fromPresence: openedEvent.fromPresence,
          toPresence: openedEvent.toPresence,
          reason: openedEvent.reason,
          kind: openedEvent.kind,
          snapshot: eventSnapshot(openedEvent.snapshot),
        },
      });

      await tx.item.update({
        where: { id: item.id },
        data: { openedAt },
      });

      const childIds: string[] = [];
      const costShares = allocatePurchasePriceCents({
        parentPriceCents: item.purchasePriceCents,
        childCount: plan.children.length,
      });

      for (let index = 0; index < plan.children.length; index += 1) {
        const child = plan.children[index]!;
        const share = costShares[index] ?? null;
        const childName = child.name;
        const slug = await allocateUniqueItemSlug(item.shelfId, childName, {
          reserved: reservedSlugs,
          print:
            child.kind === "card"
              ? {
                  printKey: child.printKey,
                  language: child.language,
                }
              : undefined,
        });
        reservedSlugs.add(slug);

        const created = await tx.item.create({
          data: {
            shelfId: item.shelfId,
            userId: item.userId,
            name: childName,
            slug,
            condition: "new",
            kind: child.kind === "card" ? "card" : "sealed",
            printKey: child.kind === "card" ? child.printKey : null,
            language: child.language,
            skuKey: child.kind === "sealed" ? child.skuKey : null,
            skuName: child.kind === "sealed" ? child.name : null,
            skuLanguage: child.kind === "sealed" ? child.language : null,
            presence: "owned",
            purchasePriceCents: share,
            purchasedAt: item.purchasedAt ?? openedAt,
          },
        });
        childIds.push(created.id);

        const materialized = buildPresenceEvent({
          from: "owned",
          to: "owned",
          kind: "materialized",
          at: openedAt,
          extraSnapshot: {
            groupId,
            parentId: item.id,
            openedEventId: openedRow.id,
            purchasePriceCents: share,
            parentPurchasePriceCents: item.purchasePriceCents,
            ...(child.kind === "card"
              ? { printKey: child.printKey }
              : { skuKey: child.skuKey }),
          },
        });
        const matEvent = await tx.itemPresenceEvent.create({
          data: {
            itemId: created.id,
            at: materialized.at,
            fromPresence: materialized.fromPresence,
            toPresence: materialized.toPresence,
            reason: materialized.reason,
            kind: materialized.kind,
            snapshot: eventSnapshot(materialized.snapshot),
          },
        });

        await tx.itemContainmentLink.create({
          data: {
            parentId: item.id,
            childId: created.id,
            role: "content",
            eventId: matEvent.id,
          },
        });
      }

      let shellId: string | null = null;
      if (createShell) {
        const shellName = `${item.name}`.trim() || "Shell";
        const shellSlug = await allocateUniqueItemSlug(
          item.shelfId,
          `${shellName} shell`,
          { reserved: reservedSlugs },
        );
        reservedSlugs.add(shellSlug);
        const shell = await tx.item.create({
          data: {
            shelfId: item.shelfId,
            userId: item.userId,
            name: shellName,
            slug: shellSlug,
            condition: item.condition,
            kind: "shell",
            imageUrl: item.imageUrl,
            skuKey: item.skuKey,
            skuName: item.skuName,
            skuLanguage: item.skuLanguage,
            presence: "owned",
          },
        });
        shellId = shell.id;
        await tx.itemContainmentLink.create({
          data: {
            parentId: item.id,
            childId: shell.id,
            role: "shell",
            eventId: openedRow.id,
          },
        });
      }

      return { childIds, shellId, openedEventId: openedRow.id, groupId };
    });

    const refreshed = await prisma.item.findUnique({
      where: { id: item.id },
      include: {
        shelf: true,
        metadata: {
          include: { attachments: true, authors: true, publishers: true },
        },
      },
    });

    return NextResponse.json({
      item: refreshed
        ? presentItemFromStorage(refreshed, uiLocale)
        : { id: item.id },
      ...result,
      childCount: result.childIds.length,
      remainingSealed: plan.remainingSealed,
    });
  });
}
