import axios from "axios";

/**
 * Uploads an image file to the `/api/upload` endpoint and returns the relative URL.
 * @param file The image file to upload
 * @param options.trim Trim light margins (good for box art). Defaults to `true`;
 *   pass `false` for logos (e.g. shelf logos) whose padding is intentional.
 */
export async function uploadImage(
  file: File,
  options: { trim?: boolean } = {},
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  if (options.trim === false) {
    formData.append("trim", "false");
  }

  const response = await axios.post<{ url: string }>("/api/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data.url;
}
