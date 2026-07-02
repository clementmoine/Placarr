export function isUrl(string: string) {
  let url;

  try {
    url = new URL(string);
  } catch (e) {
    console.log("Invalid URL:", e);
    return false;
  }

  return url.protocol === "http:" || url.protocol === "https:";
}
