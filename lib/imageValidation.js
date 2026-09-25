// Validation for customer-uploaded try-on photographs.
//
// Deliberately provider-independent: nothing here knows or cares whether the
// image is going to Gemini, Replicate, or anything else. It answers one
// question -- "is this bytes we are willing to accept and forward?" -- and it
// answers it from the BYTES, not from what the caller claims.
//
// Why the file signature and not just the declared MIME type: the declared
// type arrives inside a base64 data URL built by the browser, which is
// attacker-controlled. `data:image/png;base64,<an SVG>` is trivial to send.
// SVG is the one that matters -- it is an XML document that can carry script
// and external entity references, and several image pipelines will happily
// rasterise it. So the declared type is treated as a hint and the magic bytes
// as the truth; when they disagree, the upload is rejected.

// Accepted per spec: JPEG, PNG, WEBP.
const ACCEPTED = [
  {
    mime: 'image/jpeg',
    aliases: ['image/jpg'],
    // JPEG has no single terminator worth checking; the SOI marker plus a
    // valid segment byte is the standard signature.
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  },
  {
    mime: 'image/png',
    aliases: [],
    // 8-byte PNG signature, including the CRLF/EOF trap bytes.
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a
  },
  {
    mime: 'image/webp',
    aliases: [],
    // RIFF container whose form type is WEBP. Checking only "RIFF" would also
    // accept WAV and AVI, which share the container.
    test: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP'
  }
];

// Formats we reject by name in the error, because a shopper who uploaded one
// deserves to be told which rule they hit rather than a generic refusal.
const NAMED_REJECTS = [
  { label: 'GIF', test: (b) => b.length >= 6 && b.toString('ascii', 0, 3) === 'GIF' },
  { label: 'PDF', test: (b) => b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-' },
  {
    label: 'SVG',
    test: (b) => {
      // SVG is text; sniff a generous prefix for the root element, allowing a
      // BOM, an XML declaration, comments or a doctype in front of it.
      const head = b.toString('utf8', 0, Math.min(b.length, 1024)).trimStart();
      return /^(﻿)?(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg[\s\S]*?>\s*)?<svg[\s>]/i.test(
        head
      );
    }
  },
  {
    label: 'an executable',
    test: (b) =>
      (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) || // MZ  -- DOS/PE
      (b.length >= 4 && b[0] === 0x7f && b.toString('ascii', 1, 4) === 'ELF') || // ELF
      (b.length >= 4 && b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe) // Mach-O
  }
];

export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB, per spec.

/** Bytes for a base64 payload, without allocating the buffer to find out. */
export function base64ByteLength(base64) {
  const len = base64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (base64[len - 1] === '=') padding += 1;
  if (base64[len - 2] === '=') padding += 1;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Parses a `data:<mime>;base64,<payload>` URL.
 * Returns { declaredMime, base64 } or null when the string is not one.
 */
export function parseDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = /^data:([a-z0-9.+/-]+)?;base64,([\s\S]*)$/i.exec(value.trim());
  if (!match) return null;
  return {
    declaredMime: (match[1] || '').toLowerCase(),
    // Browsers never insert whitespace, but hand-built payloads sometimes do.
    base64: match[2].replace(/\s+/g, '')
  };
}

/**
 * Validates a customer photograph supplied as a base64 data URL.
 *
 * Returns `{ ok: true, buffer, mime, bytes }` or
 * `{ ok: false, message }` where `message` is safe to show a customer -- it
 * never contains byte content, paths, or internal detail.
 *
 * @param {string} dataUrl
 * @param {{ maxBytes?: number }} [options]
 */
export function validateCustomerImage(dataUrl, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxMb = Math.round(maxBytes / (1024 * 1024));

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { ok: false, message: 'Please upload a JPEG, PNG, or WEBP photograph.' };
  }
  if (!parsed.base64) {
    return { ok: false, message: 'The uploaded photograph was empty. Please try again.' };
  }

  // Size is checked BEFORE decoding: a 200 MB payload should be refused
  // without first materialising 200 MB in the server's heap.
  if (base64ByteLength(parsed.base64) > maxBytes) {
    return { ok: false, message: `Please upload a photograph smaller than ${maxMb} MB.` };
  }

  let buffer;
  try {
    buffer = Buffer.from(parsed.base64, 'base64');
  } catch {
    return { ok: false, message: 'The uploaded photograph could not be read. Please try again.' };
  }

  // Buffer.from is lenient with invalid base64 -- it silently drops bad
  // characters rather than throwing -- so re-check the decoded length.
  if (buffer.length === 0) {
    return { ok: false, message: 'The uploaded photograph could not be read. Please try again.' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, message: `Please upload a photograph smaller than ${maxMb} MB.` };
  }

  for (const reject of NAMED_REJECTS) {
    if (reject.test(buffer)) {
      return {
        ok: false,
        message: `${reject.label} files are not supported. Please upload a JPEG, PNG, or WEBP photograph.`
      };
    }
  }

  const matched = ACCEPTED.find((format) => format.test(buffer));
  if (!matched) {
    return { ok: false, message: 'Please upload a JPEG, PNG, or WEBP photograph.' };
  }

  // The declared type is only a hint, but a mismatch means the file is not
  // what it says it is, which is a signal worth refusing on rather than
  // quietly correcting.
  const declared = parsed.declaredMime;
  const declaredMatches =
    !declared || declared === matched.mime || matched.aliases.includes(declared);
  if (!declaredMatches) {
    return {
      ok: false,
      message: 'The uploaded file did not match its declared image type. Please try again.'
    };
  }

  return { ok: true, buffer, mime: matched.mime, bytes: buffer.length };
}
