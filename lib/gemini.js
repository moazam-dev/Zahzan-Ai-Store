// Google Gemini image-generation service for Virtual Try-On.
//
// This module is the ONLY place that talks to Gemini. Routes call
// generateTryOnImage() and get back bytes or a typed error; they never see the
// SDK, the prompt, or the API key.
//
// Ruling P5 (docs/PARITY_REPORT.md §12). Replaces the previous Replicate /
// IDM-VTON implementation.

import { GoogleGenAI, Modality } from '@google/genai';

// The model is configurable ON PURPOSE. A pinned model id that silently stops
// existing is not hypothetical here: the Replicate implementation this
// replaces died in production with "422 Invalid version or not permitted"
// because its hardcoded version had been retired. GEMINI_IMAGE_MODEL lets that
// be fixed with an env change instead of a deploy.
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

/** Error the routes can distinguish from a generic failure. */
export class TryOnError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'TryOnError';
    this.code = code; // 'not_configured' | 'model_unavailable' | 'no_image' | 'blocked' | 'upstream'
    if (cause) this.cause = cause;
  }
}

export function getConfiguredModel() {
  const configured = (process.env.GEMINI_IMAGE_MODEL || '').trim();
  return configured || DEFAULT_IMAGE_MODEL;
}

export function isGeminiConfigured() {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(key) && !key.includes('your_') && !key.includes('xxxx');
}

function client() {
  if (!isGeminiConfigured()) {
    throw new TryOnError('not_configured', 'GEMINI_API_KEY is not configured.');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim() });
}

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------
//
// Exported so it can be iterated on against real ZAHZAN garments without
// touching call sites -- the spec is explicit that this first version should
// not be assumed correct. Two things it is doing deliberately:
//
//   * It states identity preservation as a hard constraint AND repeats the
//     negatives ("do not change the face"). Image models weight prohibitions
//     weakly; saying it once tends not to hold.
//   * It names Pakistani garment components (dupatta, shalwar, kameez) rather
//     than generic "clothing", because the garment vocabulary materially
//     affects whether a two-piece outfit survives the edit intact.
export const TRY_ON_PROMPT = `You are generating a realistic virtual try-on image for a premium Pakistani women's fashion ecommerce store.

Image 1 is the customer's photograph.
Image 2 is the official ZAHZAN garment reference.

Dress the person in Image 1 in the exact ZAHZAN garment shown in Image 2.

Preserve the customer's identity, facial features, skin tone, hairstyle, body proportions, pose, camera perspective, background, and lighting as much as possible.

Change only the clothing.

Accurately reproduce the garment's:
- silhouette
- color
- fabric appearance
- embroidery
- print
- neckline
- sleeves
- borders
- trouser/shalwar
- dupatta
- proportions

Do not redesign the garment.

Do not invent additional patterns.

Do not change the customer's face.

Do not beautify or alter the person's identity.

Do not change the customer's age or body shape.

Do not add accessories, jewellery, or footwear that were not already present.

Make the clothing naturally fit the person's body with realistic fabric folds, shadows, layering, and occlusion.

The result should look like a real photograph of this person wearing the exact ZAHZAN outfit.

Prioritize garment fidelity and identity preservation over creative interpretation.

Only modify the clothing.`;

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Pulls the first inline image out of a generateContent response.
 * Defensive on purpose: the model may return text parts alongside (or instead
 * of) the image, and part ordering is not guaranteed.
 */
function extractImage(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const inline = part?.inlineData;
      if (inline?.data) {
        return {
          buffer: Buffer.from(inline.data, 'base64'),
          mime: inline.mimeType || 'image/png'
        };
      }
    }
  }
  return null;
}

/** Any text the model returned -- useful for diagnosing a refusal. */
function extractText(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => p?.text)
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Generates a try-on image.
 *
 * @param {{
 *   personImage: { buffer: Buffer, mime: string },
 *   garmentImage: { buffer: Buffer, mime: string },
 *   garmentDescription?: string,
 *   model?: string
 * }} args
 * @returns {Promise<{ buffer: Buffer, mime: string, model: string }>}
 * @throws {TryOnError}
 */
export async function generateTryOnImage({
  personImage,
  garmentImage,
  garmentDescription = '',
  model = getConfiguredModel()
}) {
  const ai = client();

  const prompt = garmentDescription
    ? `${TRY_ON_PROMPT}\n\nThe garment in Image 2 is: ${garmentDescription}`
    : TRY_ON_PROMPT;

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: personImage.mime,
                data: personImage.buffer.toString('base64')
              }
            },
            {
              inlineData: {
                mimeType: garmentImage.mime,
                data: garmentImage.buffer.toString('base64')
              }
            }
          ]
        }
      ],
      config: {
        // Without this the model answers a picture request with prose.
        responseModalities: [Modality.IMAGE, Modality.TEXT]
      }
    });
  } catch (err) {
    const raw = err?.message || String(err);
    // NEVER log the payload -- it contains the customer's photograph.
    console.error('[try-on] Gemini generateContent failed:', raw.slice(0, 300));

    if (/not found|not supported|unknown name|does not exist|invalid model/i.test(raw)) {
      throw new TryOnError(
        'model_unavailable',
        `Gemini model "${model}" is unavailable to this API key.`,
        { cause: err }
      );
    }
    if (/api key|permission|unauthenticated|403|401/i.test(raw)) {
      throw new TryOnError('not_configured', 'Gemini rejected the configured API key.', {
        cause: err
      });
    }
    throw new TryOnError('upstream', 'Gemini request failed.', { cause: err });
  }

  const image = extractImage(response);
  if (image) return { ...image, model };

  // No image came back. Distinguish a safety block from an empty result --
  // they need different fixes and the difference is invisible otherwise.
  const blockReason =
    response?.promptFeedback?.blockReason ||
    response?.candidates?.[0]?.finishReason ||
    '';
  const text = extractText(response);

  if (/safety|blocked|prohibited|recitation/i.test(String(blockReason))) {
    throw new TryOnError(
      'blocked',
      `Gemini declined to generate an image (${blockReason}).`
    );
  }

  throw new TryOnError(
    'no_image',
    `Gemini returned no image${text ? ` -- it replied with text instead: "${text.slice(0, 200)}"` : ''}.`
  );
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Lists models this API key can reach. Used by tools/tryon-diagnostic.mjs to
 * verify GEMINI_IMAGE_MODEL actually exists rather than discovering it from a
 * customer-facing failure.
 *
 * @returns {Promise<Array<{ name: string, supportsGenerate: boolean }>>}
 */
export async function listAvailableModels() {
  const ai = client();
  const out = [];
  const pager = await ai.models.list();
  for await (const model of pager) {
    const name = String(model.name || '').replace(/^models\//, '');
    const actions = model.supportedActions || model.supportedGenerationMethods || [];
    out.push({ name, supportsGenerate: actions.includes('generateContent') });
  }
  return out;
}

/** Fetches a remote garment image and returns its bytes. */
export async function fetchImageBytes(url, { maxBytes = 15 * 1024 * 1024 } = {}) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new TryOnError('upstream', `Could not load the garment image (HTTP ${res.status}).`);
  }
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new TryOnError('upstream', 'The garment image is too large to process.');
  }
  const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  return { buffer: Buffer.from(arrayBuffer), mime };
}
