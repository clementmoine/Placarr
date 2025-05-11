import { NextRequest, NextResponse } from "next/server";

import { getMetadata } from "@/services/metadata";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    const type = searchParams.get("type");
    const barcode = searchParams.get("barcode");

    if (!name || !type) {
      return NextResponse.json(
        { error: "Name and type are required" },
        { status: 400 },
      );
    }

    const metadata = await getMetadata(name, type, barcode);
    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Error in GET request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
