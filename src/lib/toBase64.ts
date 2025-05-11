import axios from "axios";

export const logoCache: Record<string, string> = {};

/**
 * Converts a URL to base64 with caching
 */
export const urlToBase64 = async (url: string): Promise<string> => {
  if (logoCache[url]) {
    return logoCache[url];
  }

  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(response.data, "binary").toString("base64");
    const dataUrl = `data:${response.headers["content-type"]};base64,${buffer}`;

    logoCache[url] = dataUrl;

    return dataUrl;
  } catch (error) {
    console.error(`Error converting image to base64: ${error}`);
    return "";
  }
};

/**
 * Converts a File object to base64
 */
export const fileToBase64 = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};
