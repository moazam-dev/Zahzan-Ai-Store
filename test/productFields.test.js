// Unit tests for lib/productFields.js -- the normalisation and validation
// shared by the three product write paths, plus the read helpers the frozen
// Product Page uses to decide what is in stock.
//
// These are pure-function tests: no database, no routes. The route-level
// behaviour they underpin is covered in test/api/product-details.test.js.

import { describe, expect, it } from 'vitest';
import {
  toStockInteger,
  normaliseSizeStock,
  sumSizeStock,
  isSizeTracked,
  sizesFromSizeStock,
  stockForSize,
  validateColors,
  stripBlankColors,
  composeModelInfo,
  parseModelInfo
} from '../lib/productFields.js';

describe('toStockInteger', () => {
  it('accepts whole numbers and numeric strings', () => {
    expect(toStockInteger(0)).toBe(0);
    expect(toStockInteger(12)).toBe(12);
    expect(toStockInteger('7')).toBe(7);
    expect(toStockInteger('  7  ')).toBe(7);
  });

  it('rejects anything that is not a non-negative whole number', () => {
    expect(toStockInteger(-1)).toBeNull();
    expect(toStockInteger(2.5)).toBeNull();
    expect(toStockInteger('abc')).toBeNull();
    expect(toStockInteger('')).toBeNull();
    expect(toStockInteger(null)).toBeNull();
    expect(toStockInteger(undefined)).toBeNull();
    expect(toStockInteger(Infinity)).toBeNull();
    expect(toStockInteger(NaN)).toBeNull();
    // `true` coerces to 1 through Number(); a boolean is not a stock count.
    expect(toStockInteger(true)).toBeNull();
  });
});

describe('normaliseSizeStock', () => {
  it('accepts a plain map, coercing numeric strings', () => {
    expect(normaliseSizeStock({ S: 10, M: '15' })).toEqual({ ok: true, value: { S: 10, M: 15 } });
  });

  it('accepts the admin form row list', () => {
    expect(
      normaliseSizeStock([
        { size: 'S', stock: '10' },
        { size: 'M', stock: 0 }
      ])
    ).toEqual({ ok: true, value: { S: 10, M: 0 } });
  });

  it('treats absent, null and empty input as "not size-tracked"', () => {
    expect(normaliseSizeStock(undefined).value).toEqual({});
    expect(normaliseSizeStock(null).value).toEqual({});
    expect(normaliseSizeStock('').value).toEqual({});
    expect(normaliseSizeStock({}).value).toEqual({});
    expect(normaliseSizeStock([]).value).toEqual({});
  });

  it('trims size labels', () => {
    expect(normaliseSizeStock([{ size: '  M  ', stock: 3 }]).value).toEqual({ M: 3 });
  });

  it('drops a wholly blank row but rejects a blank size with a real stock number', () => {
    expect(normaliseSizeStock([{ size: '', stock: '' }]).value).toEqual({});

    const rejected = normaliseSizeStock([{ size: '   ', stock: 4 }]);
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toBe('Size stock entries must have a size.');
  });

  it('rejects a duplicated size rather than silently keeping one of the counts', () => {
    const result = normaliseSizeStock([
      { size: 'M', stock: 1 },
      { size: 'M', stock: 9 }
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Size "M" is listed more than once in size stock.');
  });

  it('rejects negative, fractional and non-numeric counts', () => {
    expect(normaliseSizeStock({ M: -1 }).message).toBe(
      'Stock for size "M" must be a whole number of 0 or more.'
    );
    expect(normaliseSizeStock({ M: 1.5 }).ok).toBe(false);
    expect(normaliseSizeStock({ M: 'many' }).ok).toBe(false);
  });

  it('rejects a scalar', () => {
    expect(normaliseSizeStock(42).ok).toBe(false);
  });
});

describe('sumSizeStock / isSizeTracked / sizesFromSizeStock', () => {
  it('sums the counts', () => {
    expect(sumSizeStock({ S: 10, M: 15, L: 8 })).toBe(33);
    expect(sumSizeStock({})).toBe(0);
    expect(sumSizeStock(null)).toBe(0);
  });

  it('reports whether anything is tracked', () => {
    expect(isSizeTracked({ S: 0 })).toBe(true);
    expect(isSizeTracked({})).toBe(false);
    expect(isSizeTracked(null)).toBe(false);
    expect(isSizeTracked(undefined)).toBe(false);
  });

  it('lists sizes in insertion order', () => {
    expect(sizesFromSizeStock({ S: 1, M: 2, L: 3 })).toEqual(['S', 'M', 'L']);
    expect(sizesFromSizeStock({})).toEqual([]);
  });
});

describe('stockForSize', () => {
  it('reads the selected size when the product is size-tracked', () => {
    const product = { sizeStock: { S: 4, M: 0 }, stock: 4 };
    expect(stockForSize(product, 'S')).toBe(4);
    expect(stockForSize(product, 'M')).toBe(0);
    // A size the product does not stock is zero, not the product total.
    expect(stockForSize(product, 'XXL')).toBe(0);
  });

  it('falls back to the product total when it is not, so legacy products are unchanged', () => {
    expect(stockForSize({ sizeStock: {}, stock: 9 }, 'M')).toBe(9);
    expect(stockForSize({ stock: 9 }, 'M')).toBe(9);
  });

  it('reads a raw database row too, not just a serialized product', () => {
    expect(stockForSize({ size_stock: { M: 2 }, stock: 2 }, 'M')).toBe(2);
  });
});

describe('validateColors', () => {
  it('passes a well-formed list through untouched', () => {
    const colors = [{ name: 'Olive Green', hex: '#556B2F' }, { name: 'Sand' }, 'Ivory'];
    expect(validateColors(colors)).toEqual({ ok: true, value: colors });
  });

  it('allows an absent, null or empty hex -- the page renders a named chip', () => {
    expect(validateColors([{ name: 'Sand', hex: null }]).ok).toBe(true);
    expect(validateColors([{ name: 'Sand', hex: '' }]).ok).toBe(true);
    expect(validateColors([{ name: 'Sand' }]).ok).toBe(true);
  });

  it('accepts 3-, 6- and 8-digit hex values', () => {
    expect(validateColors([{ name: 'a', hex: '#FFF' }]).ok).toBe(true);
    expect(validateColors([{ name: 'b', hex: '#556B2F' }]).ok).toBe(true);
    expect(validateColors([{ name: 'c', hex: '#556B2F80' }]).ok).toBe(true);
  });

  it('rejects a nameless colour', () => {
    expect(validateColors([{ name: '  ' }]).message).toBe('Each color must have a name.');
    expect(validateColors(['   ']).message).toBe('Each color must have a name.');
  });

  it('rejects a malformed hex', () => {
    expect(validateColors([{ name: 'Sand', hex: 'beige' }]).message).toBe(
      'Color "Sand" has an invalid hex value. Use a form like #556B2F.'
    );
    // A bare value with no '#' is not a CSS colour, and this feeds one.
    expect(validateColors([{ name: 'Sand', hex: 'FFFFFF' }]).ok).toBe(false);
  });

  it('rejects a non-list', () => {
    expect(validateColors('Ivory').message).toBe('Colors must be a list.');
  });

  it('leaves undefined and null alone so "field not supplied" stays distinct', () => {
    expect(validateColors(undefined)).toEqual({ ok: true, value: undefined });
    expect(validateColors(null)).toEqual({ ok: true, value: null });
  });
});

describe('stripBlankColors', () => {
  it('drops wholly abandoned blank rows', () => {
    expect(
      stripBlankColors([{ name: 'Sand', hex: '#EEE' }, { name: '', hex: '', image: '' }, '', 'Ivory'])
    ).toEqual([{ name: 'Sand', hex: '#EEE' }, 'Ivory']);
  });

  it('keeps a half-filled row so validation can reject it instead of discarding the admin\'s work', () => {
    const halfFilled = [{ name: '', hex: '#FFF' }];
    expect(stripBlankColors(halfFilled)).toEqual(halfFilled);
    expect(validateColors(stripBlankColors(halfFilled)).ok).toBe(false);
  });

  it('passes a non-array through unchanged', () => {
    expect(stripBlankColors(undefined)).toBeUndefined();
  });
});

describe('composeModelInfo', () => {
  it('composes the exact line the product page renders', () => {
    expect(composeModelInfo(`5'8"`, 'S')).toBe(`Model Height: 5'8" | Model wears: S`);
  });

  it('drops the missing half rather than printing an empty label', () => {
    expect(composeModelInfo(`5'8"`, '')).toBe(`Model Height: 5'8"`);
    expect(composeModelInfo('', 'S')).toBe('Model wears: S');
  });

  it('returns null when there is nothing to say', () => {
    expect(composeModelInfo('', '')).toBeNull();
    expect(composeModelInfo(null, undefined)).toBeNull();
    expect(composeModelInfo('   ', '  ')).toBeNull();
  });
});

describe('parseModelInfo', () => {
  it('round-trips its own composed output', () => {
    const composed = composeModelInfo(`5'8"`, 'S');
    expect(parseModelInfo(composed)).toEqual({ height: `5'8"`, size: 'S' });
  });

  it('parses the legacy seed format, including its "Size" prefix', () => {
    expect(parseModelInfo(`Model Height: 5'8" | Model wears: Size S`)).toEqual({
      height: `5'8"`,
      size: 'S'
    });
  });

  it('returns empty strings for anything it cannot read, rather than guessing', () => {
    expect(parseModelInfo('She is quite tall')).toEqual({ height: '', size: '' });
    expect(parseModelInfo('')).toEqual({ height: '', size: '' });
    expect(parseModelInfo(null)).toEqual({ height: '', size: '' });
    expect(parseModelInfo(undefined)).toEqual({ height: '', size: '' });
  });

  it('reads a half-populated line', () => {
    expect(parseModelInfo(`Model Height: 5'2"`)).toEqual({ height: `5'2"`, size: '' });
    expect(parseModelInfo('Model wears: L')).toEqual({ height: '', size: 'L' });
  });
});
