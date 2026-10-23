/**
 * Translation utility using the public Google Translate endpoint.
 * This is a backend proxy so no API key is exposed to the client.
 *
 * NOTE: The free endpoint is rate-limited and intended for lightweight use.
 * For production, replace with a licensed service (see README notes).
 */

// Optionally override the base URL via env var.
const TRANSLATE_URL =
  process.env.TRANSLATE_API_URL ||
  "https://translate.googleapis.com/translate_a/single";

/**
 * Translate `text` into `targetLang` (e.g. "en", "es", "hi").
 * @returns {Promise<string>} translated text
 */
export const translateText = async (text, targetLang = "en") => {
  if (!text) return "";

  const url = new URL(TRANSLATE_URL);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", targetLang);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Translation request failed with status ${res.status}`);
    }
    const data = await res.json();
    // Response format: [ [ [phrase, ...], ... ], ... ]
    const parts = Array.isArray(data) ? data[0] : [];
    const translated = parts
      .map((part) => (Array.isArray(part) ? part[0] : ""))
      .filter(Boolean)
      .join("");
    return translated || text;
  } finally {
    clearTimeout(timeoutId);
  }
};
