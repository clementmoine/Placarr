import { NextRequest, NextResponse } from "next/server";

import { getMetadata, getDatabaseSuggestions } from "@/services/metadata";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    const type = searchParams.get("type");
    const barcode = searchParams.get("barcode");
    const platform = searchParams.get("platform");
    const suggestions = searchParams.get("suggestions") === "true";

    if (!name || !type) {
      return NextResponse.json(
        { error: "Name and type are required" },
        { status: 400 },
      );
    }

    if (suggestions) {
      const list = await getDatabaseSuggestions(name, type, platform);
      return NextResponse.json(list);
    }

    const metadata = await getMetadata(name, type, barcode, platform);
    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Error in GET request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
