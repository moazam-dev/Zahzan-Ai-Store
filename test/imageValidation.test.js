// Unit tests for lib/imageValidation.js -- the gate that customer try-on
// photographs pass through before any AI provider is called.
//
// The point of these is adversarial: the declared MIME type in a data URL is
// attacker-controlled, so the tests are mostly about what happens when the
// declaration and the actual bytes disagree.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_BYTES,
  base64ByteLength,
  parseDataUrl,
  validateCustomerImage
} from '../lib/imageValidation.js';

// --- fixture builders --------------------------------------------------------

function dataUrl(mime, buffer) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function jpeg(extra = 64) {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extra, 0x20)]);
}

function png(extra = 64) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(extra, 0x20)
  ]);
}

function webp(extra = 64) {
  return Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
    Buffer.alloc(extra, 0x20)
  ]);
}

function gif() {
  return Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(32, 0x20)]);
}

function pdf() {
  return Buffer.concat([Buffer.from('%PDF-1.7', 'ascii'), Buffer.alloc(32, 0x20)]);
}

function svg(body = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>') {
  return Buffer.from(body, 'utf8');
}

function windowsExe() {
  return Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(64, 0x00)]);
}

function elfBinary() {
  return Buffer.concat([Buffer.from([0x7f]), Buffer.from('ELF', 'ascii'), Buffer.alloc(64, 0x00)]);
}

// --- tests -------------------------------------------------------------------

describe('lib/imageValidation.js', () => {
  describe('accepts the three permitted formats', () => {
    it('accepts a JPEG', () => {
      const res = validateCustomerImage(dataUrl('image/jpeg', jpeg()));
      expect(res.ok).toBe(true);
      expect(res.mime).toBe('image/jpeg');
      expect(res.bytes).toBeGreaterThan(0);
      expect(Buffer.isBuffer(res.buffer)).toBe(true);
    });

    it('accepts a JPEG declared with the image/jpg alias', () => {
      expect(validateCustomerImage(dataUrl('image/jpg', jpeg())).ok).toBe(true);
    });

    it('accepts a PNG', () => {
      const res = validateCustomerImage(dataUrl('image/png', png()));
      expect(res.ok).toBe(true);
      expect(res.mime).toBe('image/png');
    });

    it('accepts a WEBP', () => {
      const res = validateCustomerImage(dataUrl('image/webp', webp()));
      expect(res.ok).toBe(true);
      expect(res.mime).toBe('image/webp');
    });

    it('accepts bytes with no declared MIME type, trusting the signature', () => {
      const res = validateCustomerImage(`data:;base64,${png().toString('base64')}`);
      expect(res.ok).toBe(true);
      expect(res.mime).toBe('image/png');
    });
  });

  describe('rejects the formats the spec names', () => {
    it.each([
      ['GIF', gif(), /GIF/i],
      ['PDF', pdf(), /PDF/i],
      ['SVG', svg(), /SVG/i]
    ])('rejects %s and says so', (_label, buffer, pattern) => {
      const res = validateCustomerImage(dataUrl('image/png', buffer));
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(pattern);
    });

    it.each([
      ['a Windows executable', windowsExe()],
      ['an ELF binary', elfBinary()]
    ])('rejects %s', (_label, buffer) => {
      const res = validateCustomerImage(dataUrl('image/jpeg', buffer));
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/executable/i);
    });

    it('rejects an unknown format', () => {
      const res = validateCustomerImage(dataUrl('image/png', Buffer.alloc(64, 0x41)));
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/JPEG, PNG, or WEBP/);
    });
  });

  describe('does not trust the declared MIME type', () => {
    // The whole reason the signature check exists.
    it('rejects an SVG masquerading as a PNG', () => {
      const res = validateCustomerImage(dataUrl('image/png', svg()));
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/SVG/i);
    });

    it('rejects an SVG behind an XML declaration and a doctype', () => {
      const sneaky = svg(
        '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<svg onload="alert(1)"></svg>'
      );
      const res = validateCustomerImage(dataUrl('image/webp', sneaky));
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/SVG/i);
    });

    it('rejects real PNG bytes declared as JPEG, rather than silently correcting', () => {
      const res = validateCustomerImage(dataUrl('image/jpeg', png()));
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/declared image type/i);
    });

    it('rejects a RIFF container that is not WEBP', () => {
      const wav = Buffer.concat([
        Buffer.from('RIFF', 'ascii'),
        Buffer.from([0, 0, 0, 0]),
        Buffer.from('WAVE', 'ascii'),
        Buffer.alloc(32)
      ]);
      expect(validateCustomerImage(dataUrl('image/webp', wav)).ok).toBe(false);
    });
  });

  describe('size limits', () => {
    it('defaults to 10 MB', () => {
      expect(DEFAULT_MAX_BYTES).toBe(10 * 1024 * 1024);
    });

    it('rejects a payload over the limit and names the limit', () => {
      const res = validateCustomerImage(dataUrl('image/png', png(2048)), { maxBytes: 1024 });
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/smaller than/i);
    });

    it('accepts a payload just under the limit', () => {
      const buf = png(500);
      const res = validateCustomerImage(dataUrl('image/png', buf), { maxBytes: buf.length + 10 });
      expect(res.ok).toBe(true);
    });

    it('measures base64 length without decoding', () => {
      const buf = png(1000);
      expect(base64ByteLength(buf.toString('base64'))).toBe(buf.length);
    });
  });

  describe('malformed input', () => {
    it.each([
      ['a bare URL', 'https://example.test/photo.jpg'],
      ['an empty string', ''],
      ['a non-base64 data URL', 'data:image/png,notbase64'],
      ['null', null],
      ['a number', 12345]
    ])('rejects %s without throwing', (_label, value) => {
      const res = validateCustomerImage(value);
      expect(res.ok).toBe(false);
      expect(typeof res.message).toBe('string');
    });

    it('rejects an empty payload', () => {
      const res = validateCustomerImage('data:image/png;base64,');
      expect(res.ok).toBe(false);
    });

    it('tolerates whitespace inside the base64 payload', () => {
      const b64 = png().toString('base64');
      const wrapped = b64.replace(/(.{20})/g, '$1\n');
      expect(validateCustomerImage(`data:image/png;base64,${wrapped}`).ok).toBe(true);
    });
  });

  describe('error messages are safe to show a customer', () => {
    it('never leaks byte content, paths, or stack traces', () => {
      const secret = Buffer.from('SECRET-INTERNAL-MARKER-should-not-appear', 'utf8');
      const res = validateCustomerImage(dataUrl('image/png', secret));
      expect(res.ok).toBe(false);
      expect(res.message).not.toMatch(/SECRET-INTERNAL-MARKER/);
      expect(res.message).not.toMatch(/[/\\](Users|home|var)[/\\]/);
      expect(res.message).not.toMatch(/at .+:\d+:\d+/);
    });
  });

  describe('parseDataUrl', () => {
    it('lowercases the declared type and strips whitespace', () => {
      const parsed = parseDataUrl(`  data:IMAGE/PNG;base64,${png().toString('base64')}  `);
      expect(parsed.declaredMime).toBe('image/png');
    });

    it('returns null for anything that is not a base64 data URL', () => {
      expect(parseDataUrl('data:image/png,raw')).toBeNull();
      expect(parseDataUrl('nonsense')).toBeNull();
      expect(parseDataUrl(undefined)).toBeNull();
    });
  });
});
