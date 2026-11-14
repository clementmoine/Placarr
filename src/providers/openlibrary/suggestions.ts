import { httpGet } from "@/lib/http/httpClient";

export async function getOpenLibrarySuggestions(
  name: string,
): Promise<string[]> {
  try {
    const res = await httpGet<{ docs?: Array<{ title?: string }> }>(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(name)}&limit=5`,
    );
    return (res.data?.docs || [])
      .slice(0, 5)
      .map((doc: { title?: string }) => doc.title as string)
      .filter(Boolean);
  } catch (error) {
    console.warn("[OpenLibrary] Suggestions failed:", error);
    return [];
  }
}
