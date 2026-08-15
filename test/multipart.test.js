import { describe, expect, it } from 'vitest';
import { parseUpload } from '../lib/multipart.js';

// A real, valid 1x1 PNG -- same fixture bytes Task 2's contract capture
// harness uses (tools/fixtures/payment-proof.png), so this is a genuine
// PNG file, not a text file wearing a .png extension.
const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const validPngBuffer = Buffer.from(VALID_PNG_BASE64, 'base64');

function buildRequest(fields) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Blob) {
      formData.append(key, value, value.__filename ?? 'file');
    } else {
      formData.append(key, value);
    }
  }
  return new Request('http://localhost/api/test', { method: 'POST', body: formData });
}

function pngBlob(filename = 'proof.png') {
  const blob = new Blob([validPngBuffer], { type: 'image/png' });
  blob.__filename = filename;
  return blob;
}

describe('lib/multipart.js (parseUpload)', () => {
  it('accepts a valid PNG for kind "image"', async () => {
    const request = buildRequest({ image: pngBlob('kurta.png') });
    const result = await parseUpload(request, 'image', 'image');

    expect(result.filename).toBe('kurta.png');
    expect(result.contentType).toBe('image/png');
    expect(Buffer.compare(result.buffer, validPngBuffer)).toBe(0);
  });

  it('accepts a valid PNG for kind "proof"', async () => {
    const request = buildRequest({ proof: pngBlob('proof.png') });
    const result = await parseUpload(request, 'proof', 'proof');

    expect(result.filename).toBe('proof.png');
    expect(Buffer.compare(result.buffer, validPngBuffer)).toBe(0);
  });

  it('rejects a .txt file with the exact image error message', async () => {
    const txtBlob = new Blob(['not an image'], { type: 'text/plain' });
    txtBlob.__filename = 'notes.txt';
    const request = buildRequest({ image: txtBlob });

    await expect(parseUpload(request, 'image', 'image')).rejects.toThrow(
      'Only image files (jpg, jpeg, png, webp) are allowed'
    );
  });

  it('rejects a .txt file for kind "proof" with the exact proof error message', async () => {
    const txtBlob = new Blob(['not a proof'], { type: 'text/plain' });
    txtBlob.__filename = 'notes.txt';
    const request = buildRequest({ proof: txtBlob });

    await expect(parseUpload(request, 'proof', 'proof')).rejects.toThrow(
      'Invalid file format. Only JPG, PNG, WEBP images and PDF documents are allowed.'
    );
  });

  it('rejects a good extension with a bad MIME type (extension-plus-MIME double check)', async () => {
    // Filename says .png, but the browser/client reported a completely
    // different Content-Type -- must fail on the MIME half of the check
    // even though the extension half would pass.
    const mismatchedBlob = new Blob([validPngBuffer], { type: 'application/octet-stream' });
    mismatchedBlob.__filename = 'proof.png';
    const request = buildRequest({ proof: mismatchedBlob });

    await expect(parseUpload(request, 'proof', 'proof')).rejects.toThrow(
      'Invalid file format. Only JPG, PNG, WEBP images and PDF documents are allowed.'
    );
  });

  it('accepts a PDF for kind "proof" (proof allows pdf, image does not)', async () => {
    const pdfBlob = new Blob(['%PDF-1.4 fake pdf bytes'], { type: 'application/pdf' });
    pdfBlob.__filename = 'receipt.pdf';
    const request = buildRequest({ proof: pdfBlob });

    const result = await parseUpload(request, 'proof', 'proof');
    expect(result.filename).toBe('receipt.pdf');
  });

  it('rejects a PDF for kind "image" (image does not allow pdf)', async () => {
    const pdfBlob = new Blob(['%PDF-1.4 fake pdf bytes'], { type: 'application/pdf' });
    pdfBlob.__filename = 'receipt.pdf';
    const request = buildRequest({ image: pdfBlob });

    await expect(parseUpload(request, 'image', 'image')).rejects.toThrow(
      'Only image files (jpg, jpeg, png, webp) are allowed'
    );
  });

  it('rejects a file over 5MB with multer\'s exact "File too large" message', async () => {
    // 5MB + 1 byte, valid PNG magic bytes don't matter here -- the size
    // check is meant to fire regardless of content, exactly like multer's
    // limits.fileSize does before content is even fully considered.
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    const oversizedBlob = new Blob([oversized], { type: 'image/png' });
    oversizedBlob.__filename = 'huge.png';
    const request = buildRequest({ image: oversizedBlob });

    await expect(parseUpload(request, 'image', 'image')).rejects.toThrow('File too large');
  });

  it('accepts a file exactly at the 5MB boundary', async () => {
    const exactly5mb = Buffer.alloc(5 * 1024 * 1024, 0);
    const blob = new Blob([exactly5mb], { type: 'image/png' });
    blob.__filename = 'exactly5mb.png';
    const request = buildRequest({ image: blob });

    const result = await parseUpload(request, 'image', 'image');
    expect(result.buffer.length).toBe(5 * 1024 * 1024);
  });

  it('returns sibling form fields alongside the file', async () => {
    const request = buildRequest({
      proof: pngBlob(),
      orderId: 'order-123',
      paymentMethod: 'JazzCash',
      transactionReference: 'TXN001'
    });

    const result = await parseUpload(request, 'proof', 'proof');
    expect(result.fields).toEqual({
      orderId: 'order-123',
      paymentMethod: 'JazzCash',
      transactionReference: 'TXN001'
    });
  });

  it('rejects with the image error message when the named field is missing entirely', async () => {
    const request = buildRequest({ someOtherField: 'value' });
    await expect(parseUpload(request, 'image', 'image')).rejects.toThrow(
      'Only image files (jpg, jpeg, png, webp) are allowed'
    );
  });

  it('rejects with the proof error message when the named field is missing entirely', async () => {
    const request = buildRequest({ someOtherField: 'value' });
    await expect(parseUpload(request, 'proof', 'proof')).rejects.toThrow(
      'Invalid file format. Only JPG, PNG, WEBP images and PDF documents are allowed.'
    );
  });
});
