import axios from "axios";

/**
 * Uploads an image file to the `/api/upload` endpoint and returns the relative URL.
 * @param file The image file to upload
 */
export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post<{ url: string }>("/api/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data.url;
}
