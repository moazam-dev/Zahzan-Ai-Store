// Unit tests for lib/trimFields.js -- the shared normaliser closing the
// implicit-`trim: true` parity gap (see
// .superpowers/sdd/IMPLEMENTATION_PLAN/fix-implicit-trim-report.md).
//
// Route-level round-trip tests (submit padded whitespace, assert the STORED
// value is trimmed) live alongside each write path's own test file:
// test/api/products.test.js, test/api/admin.test.js, test/api/orders.test.js,
// test/api/cart.test.js.

import { describe, expect, it } from 'vitest';
import {
  trimIfString,
  trimStringArray,
  trimColorVariant,
  trimColorVariants,
  trimProductPayload,
  PRODUCT_TRIM_FIELDS,
  PRODUCT_TRIM_ARRAY_FIELDS
} from '../lib/trimFields.js';

describe('trimIfString', () => {
  it('trims leading and trailing whitespace off a string', () => {
    expect(trimIfString('  Ivory  ')).toBe('Ivory');
  });

  it('leaves non-string values (undefined, null, number, boolean, object) completely untouched', () => {
    expect(trimIfString(undefined)).toBe(undefined);
    expect(trimIfString(null)).toBe(null);
    expect(trimIfString(42)).toBe(42);
    expect(trimIfString(true)).toBe(true);
    const obj = { a: 1 };
    expect(trimIfString(obj)).toBe(obj);
  });
});

describe('trimStringArray', () => {
  it('trims every string element', () => {
    expect(trimStringArray(['  a  ', ' b', 'c '])).toEqual(['a', 'b', 'c']);
  });

  it('a non-array value passes through unchanged', () => {
    expect(trimStringArray('not an array')).toBe('not an array');
    expect(trimStringArray(undefined)).toBe(undefined);
  });
});

describe('trimColorVariant / trimColorVariants', () => {
  it('trims name, hex, and image on a colorVariant sub-document', () => {
    expect(trimColorVariant({ name: '  Ivory  ', hex: ' #FFFFFF ', image: ' https://x/y.jpg ' })).toEqual({
      name: 'Ivory',
      hex: '#FFFFFF',
      image: 'https://x/y.jpg'
    });
  });

  it('trims every element of a colors array', () => {
    expect(trimColorVariants([{ name: '  A  ' }, { name: ' B ' }])).toEqual([{ name: 'A' }, { name: 'B' }]);
  });

  it('non-object input passes through unchanged', () => {
    expect(trimColorVariants('not an array')).toBe('not an array');
  });
});

describe('trimProductPayload', () => {
  it('trims every scalar field server/models/Product.js declares trim:true on', () => {
    const padded = {};
    for (const field of PRODUCT_TRIM_FIELDS) {
      padded[field] = `  ${field}-value  `;
    }
    const trimmed = trimProductPayload(padded);
    for (const field of PRODUCT_TRIM_FIELDS) {
      expect(trimmed[field]).toBe(`${field}-value`);
    }
  });

  it('trims every array-of-string field', () => {
    const padded = {};
    for (const field of PRODUCT_TRIM_ARRAY_FIELDS) {
      padded[field] = ['  a  ', ' b '];
    }
    const trimmed = trimProductPayload(padded);
    for (const field of PRODUCT_TRIM_ARRAY_FIELDS) {
      expect(trimmed[field]).toEqual(['a', 'b']);
    }
  });

  it('trims colors[] sub-document fields and breakdown sub-document fields', () => {
    const trimmed = trimProductPayload({
      colors: [{ name: '  Ivory  ', hex: ' #FFF ', image: ' i.jpg ' }],
      breakdown: { shirt: '  Silk  ', trouser: ' Cotton ', dupatta: ' Chiffon ' }
    });
    expect(trimmed.colors).toEqual([{ name: 'Ivory', hex: '#FFF', image: 'i.jpg' }]);
    expect(trimmed.breakdown).toEqual({ shirt: 'Silk', trouser: 'Cotton', dupatta: 'Chiffon' });
  });

  it('only touches fields actually present on the input -- matches Mongoose cast-on-assignment semantics', () => {
    const result = trimProductPayload({ name: '  Padded  ' });
    expect(result.name).toBe('Padded');
    expect('description' in result).toBe(false);
    expect('category' in result).toBe(false);
  });

  it('negative: a field the schema does NOT declare trim:true on (price, a Number) is left completely untouched', () => {
    const result = trimProductPayload({ name: '  Padded  ', price: 4500, stock: 3, isActive: true });
    expect(result.price).toBe(4500);
    expect(result.stock).toBe(3);
    expect(result.isActive).toBe(true);
  });

  it('negative: slug and sku are intentionally excluded (already cast explicitly by every caller) -- trimProductPayload leaves them untouched', () => {
    const result = trimProductPayload({ slug: '  padded-slug  ', sku: '  zhz-1  ' });
    expect(result.slug).toBe('  padded-slug  ');
    expect(result.sku).toBe('  zhz-1  ');
  });
});
