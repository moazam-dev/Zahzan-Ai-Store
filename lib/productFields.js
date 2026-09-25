// lib/productFields.js
//
// Normalisation and validation for the product fields introduced by the
// Product Management Expansion
// (docs/superpowers/specs/2026-08-20-product-management-expansion-design.md).
//
// Three write paths accept these fields -- POST /api/products,
// POST /api/admin/products and PUT /api/admin/products/:id -- and they must
// agree on what a valid `size_stock` / `colors` / model-detail payload is,
// because the customer Product Page, the cart and the order RPC all read the
// result. The helpers live here rather than being copied three times.
//
// SCOPE, deliberately narrow: this module handles ONLY the new fields. Each
// route keeps its own existing validation flow, error-message wording and
// status codes untouched -- those differ between the public and admin routes
// on purpose (they are ports of two different source controllers) and
// unifying them would be a behaviour change nobody asked for.
//
// Every function here is pure: it returns a new value and never mutates its
// argument, and it never trusts the caller. "Never trust stock values from the
// frontend" is the whole point of this file existing.

/**
 * Result shape used throughout: either `{ ok: true, value }` or
 * `{ ok: false, message }`. Callers turn `message` into their own route's
 * error response, so the wording here is the user-facing text.
 */
function ok(value) {
  return { ok: true, value };
}

function err(message) {
  return { ok: false, message };
}

/**
 * Coerces a stock-ish value to a non-negative integer.
 * Accepts numbers and numeric strings (the admin form posts strings from
 * `<input type="number">`). Rejects NaN, Infinity, negatives and fractions.
 *
 * @returns {number|null} the integer, or null when the value is not one
 */
export function toStockInteger(value) {
  if (typeof value === 'boolean') return null;
  if (value === null || value === undefined || value === '') return null;

  const num = typeof value === 'number' ? value : Number(String(value).trim());

  if (!Number.isFinite(num)) return null;
  if (!Number.isInteger(num)) return null;
  if (num < 0) return null;

  return num;
}

/**
 * Normalises a `sizeStock` payload into the `{ [size]: integer }` object the
 * `products.size_stock` jsonb column stores.
 *
 * Accepted inputs:
 *   - `{ S: 10, M: '15' }`                  -- plain map (API clients)
 *   - `[{ size: 'S', stock: 10 }, ...]`     -- row list (the admin form)
 *   - `{}` / `[]` / `null` / `''`           -- clears size tracking
 *
 * Duplicate sizes in the array form are rejected rather than silently
 * last-write-wins: an admin who typed 'M' twice made a mistake, and quietly
 * dropping one of their stock numbers is how inventory goes wrong.
 *
 * @param {unknown} input
 * @returns {{ok: true, value: Record<string, number>}|{ok: false, message: string}}
 */
export function normaliseSizeStock(input) {
  if (input === null || input === undefined || input === '') {
    return ok({});
  }

  const entries = [];

  if (Array.isArray(input)) {
    for (const row of input) {
      if (!row || typeof row !== 'object') {
        return err('Each size stock entry must be an object with a size and a stock value.');
      }
      entries.push([row.size, row.stock]);
    }
  } else if (typeof input === 'object') {
    for (const [size, stock] of Object.entries(input)) {
      entries.push([size, stock]);
    }
  } else {
    return err('Size stock must be an object mapping each size to its stock count.');
  }

  const value = {};

  for (const [rawSize, rawStock] of entries) {
    const size = typeof rawSize === 'string' ? rawSize.trim() : '';

    // A blank size row is the admin's "I added a row and changed my mind",
    // not data -- but only when its stock is blank too. A blank size with a
    // stock number is a genuine mistake and must not be swallowed.
    if (size === '') {
      if (rawStock === undefined || rawStock === null || rawStock === '') continue;
      return err('Size stock entries must have a size.');
    }

    if (Object.prototype.hasOwnProperty.call(value, size)) {
      return err(`Size "${size}" is listed more than once in size stock.`);
    }

    const stock = toStockInteger(rawStock);
    if (stock === null) {
      return err(`Stock for size "${size}" must be a whole number of 0 or more.`);
    }

    value[size] = stock;
  }

  return ok(value);
}

/**
 * Sum of a normalised size-stock map -- the value written to the maintained
 * `products.stock` total whenever size tracking is in use.
 *
 * @param {Record<string, number>} sizeStock
 * @returns {number}
 */
export function sumSizeStock(sizeStock) {
  if (!sizeStock || typeof sizeStock !== 'object') return 0;
  return Object.values(sizeStock).reduce((total, n) => total + (Number(n) || 0), 0);
}

/** True when a normalised size-stock map actually tracks anything. */
export function isSizeTracked(sizeStock) {
  return Boolean(sizeStock) && typeof sizeStock === 'object' && Object.keys(sizeStock).length > 0;
}

const SIZE_LADDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/**
 * The sizes a normalised size-stock map covers -- used to keep
 * `products.sizes` (what the size selector renders) consistent with
 * `products.size_stock` (what it is allowed to sell).
 *
 * Sorted smallest to largest rather than kept in insertion order: Postgres
 * jsonb does not preserve key order (it stores `{S, M, L, XL}` as
 * `{L, M, S, XL}`), so a map read back from the database would otherwise put
 * the size selector out of order. Sizes outside the standard ladder keep
 * their relative order after it.
 *
 * @param {Record<string, number>} sizeStock
 * @returns {string[]}
 */
export function sizesFromSizeStock(sizeStock) {
  if (!isSizeTracked(sizeStock)) return [];
  const rank = (size) => {
    const i = SIZE_LADDER.indexOf(size.toUpperCase());
    return i === -1 ? SIZE_LADDER.length : i;
  };
  return Object.keys(sizeStock).sort((a, b) => rank(a) - rank(b));
}

/**
 * Stock available for one size. Falls back to the product-level total for a
 * product that is not size-tracked, which is what makes every pre-migration
 * product keep behaving exactly as it did.
 *
 * @param {{sizeStock?: Record<string, number>, stock?: number}} product
 *        a serialized product, or any object with the same two keys
 * @param {string} size
 * @returns {number}
 */
export function stockForSize(product, size) {
  const sizeStock = product?.sizeStock ?? product?.size_stock;
  if (!isSizeTracked(sizeStock)) return Number(product?.stock ?? 0);
  return Number(sizeStock[size] ?? 0);
}

// ---------------------------------------------------------------------------
// colours
// ---------------------------------------------------------------------------

// #RGB, #RRGGBB, #RRGGBBAA. Case-insensitive. The leading '#' is required --
// the column feeds a CSS colour directly, and a bare 'FFF' is not one.
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Validates a `colors` payload. Does NOT reshape it: each route keeps its own
 * existing string -> object mapping (which deliberately differs between create
 * and update -- see the header comments on those routes), and this only
 * rejects entries that would put unusable data in front of a customer.
 *
 * A colour needs a name. A hex is optional -- the Product Page renders a named
 * chip instead of a filled swatch when there is none -- but a hex that IS
 * supplied has to be a real one.
 *
 * @param {unknown} input
 * @returns {{ok: true, value: unknown}|{ok: false, message: string}}
 */
export function validateColors(input) {
  if (input === undefined) return ok(undefined);
  if (input === null) return ok(null);

  if (!Array.isArray(input)) {
    return err('Colors must be a list.');
  }

  for (const entry of input) {
    if (typeof entry === 'string') {
      if (entry.trim() === '') return err('Each color must have a name.');
      continue;
    }

    if (!entry || typeof entry !== 'object') {
      return err('Each color must be a name, or an object with a name.');
    }

    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (name === '') return err('Each color must have a name.');

    const hex = entry.hex;
    if (hex !== undefined && hex !== null && String(hex).trim() !== '') {
      if (!HEX_RE.test(String(hex).trim())) {
        return err(`Color "${name}" has an invalid hex value. Use a form like #556B2F.`);
      }
    }
  }

  return ok(input);
}

/**
 * Drops the WHOLLY blank rows the admin form leaves behind -- a colour row
 * that was added and then abandoned -- so they never reach validateColors or
 * the database.
 *
 * A row with a hex or an image but no name is NOT dropped: that is a
 * half-filled row, i.e. a mistake, and it goes on to validateColors to be
 * rejected with "Each color must have a name." Silently discarding it would
 * throw away work the admin thought they had saved. Same rule as
 * normaliseSizeStock applies to a blank size with a real stock number.
 *
 * @param {unknown} input
 * @returns {unknown} the input unchanged when it is not an array
 */
export function stripBlankColors(input) {
  if (!Array.isArray(input)) return input;
  return input.filter((entry) => {
    if (typeof entry === 'string') return entry.trim() !== '';
    if (!entry || typeof entry !== 'object') return true; // let validation reject it
    const blank = (v) => v === undefined || v === null || String(v).trim() === '';
    return !(blank(entry.name) && blank(entry.hex) && blank(entry.image));
  });
}

// ---------------------------------------------------------------------------
// model details
// ---------------------------------------------------------------------------

/**
 * Composes the single line the Product Page's SIZE & FIT section renders from
 * the two structured admin inputs:
 *
 *   height + size -> `Model Height: 5'8" | Model wears: S`
 *   height only   -> `Model Height: 5'8"`
 *   size only     -> `Model wears: S`
 *   neither       -> null
 *
 * The label text ("Model Height:", "Model wears:") is interface wording, not
 * product data -- the same category as the page's own "FABRIC" / "COLOR"
 * headings -- so it stays in code. The values are entirely the admin's.
 *
 * @param {unknown} height
 * @param {unknown} size
 * @returns {string|null}
 */
export function composeModelInfo(height, size) {
  const h = typeof height === 'string' ? height.trim() : '';
  const s = typeof size === 'string' ? size.trim() : '';

  const parts = [];
  if (h) parts.push(`Model Height: ${h}`);
  if (s) parts.push(`Model wears: ${s}`);

  return parts.length > 0 ? parts.join(' | ') : null;
}

/**
 * Splits a stored `model_info` line back into its two parts, so the admin Edit
 * form can populate its structured inputs for a product created before those
 * inputs existed (including everything migrated from the old stack).
 *
 * Returns empty strings for anything it cannot parse -- a best-effort read of
 * legacy data, never a guess. The caller keeps the raw line as a fallback.
 *
 * @param {unknown} modelInfo
 * @returns {{height: string, size: string}}
 */
export function parseModelInfo(modelInfo) {
  if (typeof modelInfo !== 'string' || modelInfo.trim() === '') {
    return { height: '', size: '' };
  }

  const heightMatch = modelInfo.match(/model\s*height\s*:\s*([^|]+)/i);
  const sizeMatch = modelInfo.match(/model\s*wears\s*:\s*(?:size\s*)?([^|]+)/i);

  return {
    height: heightMatch ? heightMatch[1].trim() : '',
    size: sizeMatch ? sizeMatch[1].trim() : ''
  };
}
