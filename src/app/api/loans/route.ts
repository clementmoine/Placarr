import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import {
  itemWithMetadataInclude,
  presentItemFromStorage,
} from "@/lib/presentItem";

function presentLoanRequest<
  T extends {
    item: Parameters<typeof presentItemFromStorage>[0];
  },
>(loan: T) {
  return {
    ...loan,
    item: presentItemFromStorage(loan.item),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const sent = await prisma.loanRequest.findMany({
      where: {
        requesterId: auth.user.id,
      },
      include: {
        item: {
          include: itemWithMetadataInclude,
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const received = await prisma.loanRequest.findMany({
      where: {
        ownerId: auth.user.id,
      },
      include: {
        item: {
          include: itemWithMetadataInclude,
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      sent: sent.map(presentLoanRequest),
      received: received.map(presentLoanRequest),
    });
  } catch (error) {
    console.error("Error in loans GET route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot request loans" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { itemId, notes } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 },
      );
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { userId: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (item.userId === auth.user.id) {
      return NextResponse.json(
        { error: "You cannot borrow your own item" },
        { status: 400 },
      );
    }

    const existingRequest = await prisma.loanRequest.findFirst({
      where: {
        itemId,
        requesterId: auth.user.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });

    if (existingRequest) {
      return NextResponse.json(
        { error: "You already have an active loan request for this item" },
        { status: 400 },
      );
    }

    const loanRequest = await prisma.loanRequest.create({
      data: {
        itemId,
        requesterId: auth.user.id,
        ownerId: item.userId,
        notes: notes || null,
        status: "PENDING",
      },
      include: {
        item: {
          include: itemWithMetadataInclude,
        },
      },
    });

    return NextResponse.json(presentLoanRequest(loanRequest));
  } catch (error) {
    console.error("Error in loans POST route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "Loan request ID and status are required" },
        { status: 400 },
      );
    }

    const loanRequest = await prisma.loanRequest.findUnique({
      where: { id },
    });

    if (!loanRequest) {
      return NextResponse.json(
        { error: "Loan request not found" },
        { status: 404 },
      );
    }

    const isOwner = loanRequest.ownerId === auth.user.id;
    const isRequester = loanRequest.requesterId === auth.user.id;

    if (auth.user.role !== "admin" && !isOwner && !isRequester) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (!isOwner && auth.user.role !== "admin") {
      if (status !== "RETURNED" && status !== "REJECTED") {
        return NextResponse.json(
          { error: "Borrowers can only mark loans as returned or cancel them" },
          { status: 400 },
        );
      }
    }

    const updatedRequest = await prisma.loanRequest.update({
      where: { id },
      data: {
        status,
      },
      include: {
        item: {
          include: itemWithMetadataInclude,
        },
      },
    });

    return NextResponse.json(presentLoanRequest(updatedRequest));
  } catch (error) {
    console.error("Error in loans PATCH route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
