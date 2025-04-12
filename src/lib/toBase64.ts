export const logoCache: Record<string, string> = {};

export async function toBase64(url: string): Promise<string> {
  if (logoCache[url]) {
    return logoCache[url];
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/png";
    const dataUrl = `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;

    logoCache[url] = dataUrl;

    return dataUrl;
  } catch (error) {
    console.error(`Error converting image to base64: ${error}`);
    return "";
  }
}
