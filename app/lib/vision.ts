/** Google Cloud Vision text detection for page images. */

export class VisionError extends Error {
  constructor(readonly code: "ocr_not_configured" | "ocr_forbidden" | "ocr_failed") {
    super(code);
  }
}

export const visionConfigured = () => !!process.env.GOOGLE_VISION_API_KEY;

type VisionResponse = { responses?: { fullTextAnnotation?: { text?: string }; error?: { message?: string } }[]; error?: { message?: string } };

/** Recognizes the text in each PNG. Returns text per image, in order; an image with no text gives "". */
export async function recognize(images: Uint8Array[]): Promise<string[]> {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) throw new VisionError("ocr_not_configured");
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: images.map((image) => ({
        image: { content: Buffer.from(image).toString("base64") },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["en", "zh"] },
      })),
    }),
    signal: AbortSignal.timeout(90_000),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as VisionResponse;
  if (!response.ok) {
    // The reason (for example billing or the API being disabled) appears in the runtime logs.
    console.error("Vision request failed", response.status, data.error?.message?.slice(0, 300));
    throw new VisionError(response.status === 400 || response.status === 403 || response.status === 429 ? "ocr_forbidden" : "ocr_failed");
  }
  return images.map((_, index) => {
    const item = data.responses?.[index];
    if (item?.error) console.error("Vision page failed", item.error.message?.slice(0, 200));
    return item?.fullTextAnnotation?.text ?? "";
  });
}
