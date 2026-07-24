import axios from "axios";
import { convertXML } from "simple-xml-to-json";

import type { BGGChild, BGGResponse } from "./resolver";

export async function getBGGSuggestions(name: string): Promise<string[]> {
  try {
    const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(name)}&type=boardgame`;
    const searchRes = await axios.get(searchUrl, {
      responseType: "text",
      timeout: 5000,
    });
    const searchData = convertXML(searchRes.data) as BGGResponse;
    const items = searchData.items?.children || [];
    return items
      .slice(0, 5)
      .map((item) => {
        return (item.item.children.find(
          (child: BGGChild) => child.name?.type === "primary",
        )?.name?.value || "") as string;
      })
      .filter(Boolean);
  } catch (error) {
    console.warn("[BGG] Suggestions failed:", error);
    return [];
  }
}
