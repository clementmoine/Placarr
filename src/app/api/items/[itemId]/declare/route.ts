/**
 * Déclaration groupée / rip unitaire — étape 6.
 *
 * L'utilisateur annonce les printKeys tirés (loterie honnête). Crée des
 * cartes liées au parent (`declared`), pose `openedAt` si besoin. Cohabite
 * avec une pile de boosters déjà matérialisée.
 */
import { Prisma } from "@/generated/prisma/browser";
import { NextRequest, NextResponse } from "next/server";

import { allocatePurchasePriceCents } from "@/core/collect/costBasis";
import { countsAsOwned } from "@/core/collect/itemAbsence";
import { buildPresenceEvent } from "@/core/collect/itemAbsence";
import { presentItemFromStorage } from "@/core/collect/present";
import { planSealedDeclare } from "@/core/collect/sealedOpen";
import { lookupPrintCandidate } from "@/core/identify/printSearch";
import { withRequestUiLocale } from "@/core/locale/serverPreference";
import { requireGuestOrHigher } from "@/lib/auth";
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
        { error: "Guests cannot declare sealed pulls" },
        { status: 403 },
      );
    }

    const { itemId: rawId } = await context.params;
    const shelfIdParam = req.nextUrl.searchParams.get("shelfId");
    const body = await req.json().catch(() => ({}));
    const rawPrints = Array.isArray(body?.prints) ? body.prints : [];

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
        { error: "Only sealed items can declare pulls", reason: "not_sealed" },
        { status: 400 },
      );
    }
    if (!item.skuKey?.trim()) {
      return NextResponse.json(
        { error: "Missing skuKey", reason: "missing_sku" },
        { status: 400 },
      );
    }

    const printsInput = rawPrints
      .map((row: unknown) => {
        if (!row || typeof row !== "object") return null;
        const rec = row as Record<string, unknown>;
        const printKey =
          typeof rec.printKey === "string" ? rec.printKey.trim() : "";
        if (!printKey) return null;
        return {
          printKey,
          name: typeof rec.name === "string" ? rec.name : null,
          language: typeof rec.language === "string" ? rec.language : null,
        };
      })
      .filter(
        (row): row is { printKey: string; name: string | null; language: string | null } =>
          row != null,
      );

    const titleCache = new Map<string, string>();
    await Promise.all(
      [...new Set(printsInput.map((p) => p.printKey))].slice(0, 80).map(
        async (printKey) => {
          try {
            const hit = await lookupPrintCandidate(printKey, item.shelf.type, {
              language: item.skuLanguage ?? item.language ?? undefined,
            });
            const title = hit?.title?.trim();
            if (title) titleCache.set(printKey, title);
          } catch {
            /* keep printKey */
          }
        },
      ),
    );

    const plan = planSealedDeclare({
      skuKey: item.skuKey,
      countsAsOwned: countsAsOwned(item),
      defaultLanguage: item.skuLanguage ?? item.language,
      prints: printsInput.map((row) => ({
        ...row,
        name: row.name || titleCache.get(row.printKey) || row.printKey,
      })),
    });

    if (!plan.ok) {
      return NextResponse.json(
        { error: "Cannot declare pulls", reason: plan.reason },
        { status: 400 },
      );
    }

    const groupId = randomUUID();
    const at = new Date();
    const reservedSlugs = new Set<string>();
    const wasOpened = Boolean(item.openedAt);

    const result = await prisma.$transaction(async (tx) => {
      const declaredEvent = buildPresenceEvent({
        from: item.presence,
        to: item.presence,
        kind: "declared",
        at,
        extraSnapshot: {
          groupId,
          skuKey: item.skuKey,
          skuName: item.skuName,
          childCount: plan.children.length,
          printKeys: plan.children.map((c) => c.printKey),
        },
      });
      const declaredRow = await tx.itemPresenceEvent.create({
        data: {
          itemId: item.id,
          at: declaredEvent.at,
          fromPresence: declaredEvent.fromPresence,
          toPresence: declaredEvent.toPresence,
          reason: declaredEvent.reason,
          kind: declaredEvent.kind,
          snapshot: eventSnapshot(declaredEvent.snapshot),
        },
      });

      if (!wasOpened) {
        await tx.item.update({
          where: { id: item.id },
          data: { openedAt: at },
        });
        await tx.itemPresenceEvent.create({
          data: {
            itemId: item.id,
            at,
            fromPresence: item.presence,
            toPresence: item.presence,
            reason: null,
            kind: "opened",
            snapshot: eventSnapshot({
              groupId,
              skuKey: item.skuKey,
              via: "declare",
            }),
          },
        });
      }

      const childIds: string[] = [];
      const costShares = allocatePurchasePriceCents({
        parentPriceCents: item.purchasePriceCents,
        childCount: plan.children.length,
      });
      for (let index = 0; index < plan.children.length; index += 1) {
        const child = plan.children[index]!;
        const share = costShares[index] ?? null;
        const slug = await allocateUniqueItemSlug(item.shelfId, child.name, {
          reserved: reservedSlugs,
          print: {
            printKey: child.printKey,
            language: child.language,
          },
        });
        reservedSlugs.add(slug);
        const created = await tx.item.create({
          data: {
            shelfId: item.shelfId,
            userId: item.userId,
            name: child.name,
            slug,
            condition: "new",
            kind: "card",
            printKey: child.printKey,
            language: child.language,
            presence: "owned",
            purchasePriceCents: share,
            purchasedAt: item.purchasedAt ?? at,
          },
        });
        childIds.push(created.id);

        const mat = buildPresenceEvent({
          from: "owned",
          to: "owned",
          kind: "declared",
          at,
          extraSnapshot: {
            groupId,
            parentId: item.id,
            declaredEventId: declaredRow.id,
            printKey: child.printKey,
            purchasePriceCents: share,
            parentPurchasePriceCents: item.purchasePriceCents,
          },
        });
        const matEvent = await tx.itemPresenceEvent.create({
          data: {
            itemId: created.id,
            at: mat.at,
            fromPresence: mat.fromPresence,
            toPresence: mat.toPresence,
            reason: mat.reason,
            kind: mat.kind,
            snapshot: eventSnapshot(mat.snapshot),
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

      return { childIds, declaredEventId: declaredRow.id, groupId };
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
    });
  });
}
