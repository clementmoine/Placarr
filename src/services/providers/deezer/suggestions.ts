import axios from "axios";

export async function getDeezerSuggestions(name: string): Promise<string[]> {
  try {
    const searchUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(name)}`;
    const res = await axios.get(searchUrl);
    return (res.data?.data || []).slice(0, 5).map((album: {
      title?: string;
      artist?: { name?: string };
    }) => {
      const artistName = album.artist?.name || "";
      return (
        artistName ? `${artistName} - ${album.title}` : album.title
      ) as string;
    });
  } catch (error) {
    console.warn("[Deezer] Suggestions failed:", error);
    return [];
  }
}
