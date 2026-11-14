/**
 * Contenance bidirectionnelle (décisions 8–9) :
 * - GET  : parent actuel + candidats de remontage sur l'étagère
 * - POST : rattacher cet item sous `{ parentId }`
 * - DELETE : détacher du parent content actuel
 */
import { Prisma } from "@/generated/prisma/browser";
import { NextRequest, NextResponse } from "next/server";

import { buildPresenceEvent, countsAsOwned } from "@/core/collect/itemAbsence";
import { presentItemFromStorage } from "@/core/collect/present";
import type { SealedContentsSource } from "@/core/collect/sealedContentsTree";
import { parseSealedSkuKey } from "@/core/collect/sealedOpen";
import {
  countMatchingAttachedChildren,
  listCompatibleContainmentParents,
  planContainmentAttach,
  reattachChildRef,
} from "@/core/collect/sealedReattach";
import { withRequestUiLocale } from "@/core/locale/serverPreference";
import { requireGuestOrHigher } from "@/lib/auth";
import { loadSealedProductEntries } from "@/lib/collect/sealedProductsLoad";
import { prisma } from "@/lib/db/prisma";
import { resolveItemId } from "@/lib/routing/resolveIds";
import type { SealedProductEntry } from "@/providers/shared/sealedProducts/indexFormat";

function eventSnapshot(
  snap: Record<string, unknown> | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return snap == null
    ? Prisma.JsonNull
    : (snap as Prisma.InputJsonValue);
}

function entryToContentsSource(entry: SealedProductEntry): SealedContentsSource {
  return {
    behavior: entry.behavior,
    contentsKnown: entry.contentsKnown,
    printsArePreview: entry.containsPrintsIsPreview,
    guaranteedPrints: entry.guaranteedPrints,
    guaranteedProducts: entry.guaranteedProducts,
    printKeys: (entry.prints ?? [])
      .map((row) => row.printKey?.trim())
      .filter((key): key is string => Boolean(key)),
    packsContained: entry.packsContained,
    cardsPerPack: entry.cardsPerPack,
    packsBySet: entry.packsBySet,
    randomPoolScope: entry.randomPoolScope,
    randomPoolPrints: (entry.randomPoolPrints ?? [])
      .map((row) => row.printKey?.trim())
      .filter((key): key is string => Boolean(key)),
    structureUnits: entry.structureUnits,
  };
}

function loadProductForSku(
  skuKey: string | null | undefined,
): SealedContentsSource | null {
  const parsed = parseSealedSkuKey(skuKey);
  if (!parsed) return null;
  const entry = loadSealedProductEntries(parsed.packId).find(
    (row) => row.slug === parsed.slug,
  );
  return entry ? entryToContentsSource(entry) : null;
}

async function loadChildItem(
  rawId: string,
  shelfIdParam: string | null,
  userId: string,
) {
  const resolvedId = await resolveItemId(rawId, shelfIdParam, userId);
  return prisma.item.findUnique({
    where: { id: resolvedId },
    include: {
      shelf: true,
      containmentAsChild: {
        where: { role: "content" },
        include: {
          parent: { select: { id: true, name: true, skuKey: true, slug: true } },
        },
      },
    },
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  return withRequestUiLocale(req, async () => {
    const auth = await requireGuestOrHigher(req);
    if (auth instanceof NextResponse) return auth;

    const { itemId: rawId } = await context.params;
    const shelfIdParam = req.nextUrl.searchParams.get("shelfId");
    const item = await loadChildItem(rawId, shelfIdParam, auth.user.id);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const current = item.containmentAsChild[0] ?? null;
    const child = reattachChildRef(item);
    if (!child || current) {
      return NextResponse.json({
        childId: item.id,
        childRef: child,
        currentParent: current
          ? {
              id: current.parent.id,
              name: current.parent.name,
              skuKey: current.parent.skuKey,
              slug: current.parent.slug,
              linkId: current.id,
            }
          : null,
        candidates: [],
      });
    }

    const shelfSealed = await prisma.item.findMany({
      where: {
        shelfId: item.shelfId,
        kind: "sealed",
        id: { not: item.id },
        openedAt: { not: null },
      },
      select: {
        id: true,
        name: true,
        kind: true,
        skuKey: true,
        openedAt: true,
        presence: true,
        absenceReason: true,
        containmentAsParent: {
          where: { role: "content" },
          include: {
            child: {
              select: {
                kind: true,
                skuKey: true,
                printKey: true,
              },
            },
          },
        },
      },
    });

    const parents = shelfSealed.flatMap((parent) => {
      const product = loadProductForSku(parent.skuKey);
      if (!product) return [];
      const attachedChildren = parent.containmentAsParent.map((link) => link.child);
      return [
        {
          parent: {
            id: parent.id,
            name: parent.name,
            kind: parent.kind,
            skuKey: parent.skuKey,
            openedAt: parent.openedAt,
            countsAsOwned: countsAsOwned(parent),
          },
          product,
          attachedMatching: countMatchingAttachedChildren({
            child,
            attachedChildren,
          }),
        },
      ];
    });

    return NextResponse.json({
      childId: item.id,
      childRef: child,
      currentParent: null,
      candidates: listCompatibleContainmentParents({ child, parents }),
    });
  });
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
        { error: "Guests cannot change containment" },
        { status: 403 },
      );
    }

    const { itemId: rawId } = await context.params;
    const shelfIdParam = req.nextUrl.searchParams.get("shelfId");
    const body = await req.json().catch(() => ({}));
    const parentId =
      typeof body?.parentId === "string" ? body.parentId.trim() : "";
    if (!parentId) {
      return NextResponse.json(
        { error: "parentId required", reason: "missing_parent" },
        { status: 400 },
      );
    }

    const item = await loadChildItem(rawId, shelfIdParam, auth.user.id);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (item.id === parentId) {
      return NextResponse.json(
        { error: "Cannot contain self", reason: "self_parent" },
        { status: 400 },
      );
    }
    if (item.containmentAsChild.length > 0) {
      return NextResponse.json(
        { error: "Already contained", reason: "already_linked" },
        { status: 400 },
      );
    }

    const child = reattachChildRef(item);
    const parent = await prisma.item.findUnique({
      where: { id: parentId },
      include: {
        containmentAsParent: {
          where: { role: "content" },
          include: {
            child: { select: { kind: true, skuKey: true, printKey: true } },
          },
        },
      },
    });
    if (!parent || parent.shelfId !== item.shelfId) {
      return NextResponse.json(
        { error: "Parent not found on shelf", reason: "parent_not_found" },
        { status: 404 },
      );
    }

    const product = loadProductForSku(parent.skuKey);
    if (!product) {
      return NextResponse.json(
        { error: "Parent catalogue entry missing", reason: "missing_sku" },
        { status: 400 },
      );
    }

    const plan = planContainmentAttach({
      child,
      parent: {
        id: parent.id,
        name: parent.name,
        kind: parent.kind,
        skuKey: parent.skuKey,
        openedAt: parent.openedAt,
        countsAsOwned: countsAsOwned(parent),
      },
      product,
      attachedMatching: countMatchingAttachedChildren({
        child: child!,
        attachedChildren: parent.containmentAsParent.map((link) => link.child),
      }),
      childAlreadyLinked: false,
    });
    if (!plan.ok) {
      return NextResponse.json(
        { error: "Cannot attach", reason: plan.reason },
        { status: 400 },
      );
    }

    const event = buildPresenceEvent({
      from: item.presence,
      to: item.presence,
      kind: "contained",
      extraSnapshot: {
        parentId: parent.id,
        parentSkuKey: parent.skuKey,
        childRef: plan.childRef,
      },
    });

    await prisma.$transaction(async (tx) => {
      const created = await tx.itemPresenceEvent.create({
        data: {
          itemId: item.id,
          fromPresence: event.fromPresence,
          toPresence: event.toPresence,
          reason: event.reason,
          kind: event.kind,
          snapshot: eventSnapshot(event.snapshot),
        },
      });
      await tx.itemContainmentLink.create({
        data: {
          parentId: parent.id,
          childId: item.id,
          role: "content",
          eventId: created.id,
        },
      });
      await tx.itemPresenceEvent.create({
        data: {
          itemId: parent.id,
          fromPresence: parent.presence,
          toPresence: parent.presence,
          kind: "contained",
          snapshot: eventSnapshot({
            childId: item.id,
            childRef: plan.childRef,
          }),
        },
      });
    });

    const fresh = await prisma.item.findUnique({
      where: { id: item.id },
      include: {
        shelf: true,
        metadata: {
          include: { attachments: true, authors: true, publishers: true },
        },
      },
    });
    return NextResponse.json({
      item: fresh ? presentItemFromStorage(fresh, uiLocale) : null,
      parentId: parent.id,
    });
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  return withRequestUiLocale(req, async (uiLocale) => {
    const auth = await requireGuestOrHigher(req);
    if (auth instanceof NextResponse) return auth;
    if (auth.user.role === "guest") {
      return NextResponse.json(
        { error: "Guests cannot change containment" },
        { status: 403 },
      );
    }

    const { itemId: rawId } = await context.params;
    const shelfIdParam = req.nextUrl.searchParams.get("shelfId");
    const item = await loadChildItem(rawId, shelfIdParam, auth.user.id);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const link = item.containmentAsChild[0];
    if (!link) {
      return NextResponse.json(
        { error: "Not contained", reason: "not_linked" },
        { status: 400 },
      );
    }

    const event = buildPresenceEvent({
      from: item.presence,
      to: item.presence,
      kind: "detached",
      extraSnapshot: {
        parentId: link.parentId,
        parentSkuKey: link.parent.skuKey,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.itemContainmentLink.delete({ where: { id: link.id } });
      await tx.itemPresenceEvent.create({
        data: {
          itemId: item.id,
          fromPresence: event.fromPresence,
          toPresence: event.toPresence,
          kind: event.kind,
          snapshot: eventSnapshot(event.snapshot),
        },
      });
      const parentRow = await tx.item.findUnique({
        where: { id: link.parentId },
        select: { presence: true },
      });
      if (parentRow) {
        await tx.itemPresenceEvent.create({
          data: {
            itemId: link.parentId,
            fromPresence: parentRow.presence,
            toPresence: parentRow.presence,
            kind: "detached",
            snapshot: eventSnapshot({ childId: item.id }),
          },
        });
      }
    });

    const fresh = await prisma.item.findUnique({
      where: { id: item.id },
      include: {
        shelf: true,
        metadata: {
          include: { attachments: true, authors: true, publishers: true },
        },
      },
    });
    return NextResponse.json({
      item: fresh ? presentItemFromStorage(fresh, uiLocale) : null,
      detachedFrom: link.parentId,
    });
  });
}
