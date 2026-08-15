// tools/lib/normalise.mjs
//
// Replaces volatile values in captured HTTP interactions with stable
// placeholders so two captures of the same journey diff cleanly. This is
// what makes tools/golden/ usable as a regression oracle (Task 2 brief).
//
// Categories normalised (brief, verbatim):
//   - any 24-hex Mongo ObjectId or UUID          -> <ID>
//   - any ISO-8601 timestamp                     -> <TS>
//   - JWTs (three base64url segments, dot-joined) -> <JWT>
//   - orderNumber values matching ZHZ-\d{8}-\d{4} -> <ORDERNO>
//   - any absolute http(s):// URL                -> <URL>
//   - any tools/golden absolute path              -> <PATH>
//
// One extra category was added beyond the brief's literal list (see
// EPOCH_MS_RE below) because without it the double-run reproducibility
// check (the task's acceptance criterion) cannot pass. This is called out
// explicitly in tools/README-scope-note is not created; it is documented
// in docs/CONTRACT_CAPTURE.md and in the Task 2 report instead.
//
// Normalisation walks the JSON recursively and preserves key order and
// structure -- only string leaf values are rewritten (via regex
// substitution, so a volatile substring inside a longer string, such as a
// Cloudinary public_id, is replaced in place rather than requiring the
// whole leaf to match).

const URL_RE = /https?:\/\/[^\s"'<>]+/g;

// Absolute filesystem path that contains `tools/golden` (or `tools\golden`),
// Windows drive-letter or POSIX rooted. Matches `tools/golden-next` too,
// since `golden` is a prefix of `golden-next`.
const PATH_RE =
  /(?:[A-Za-z]:[\\/](?:[^\s"'<>]*[\\/])*|\/(?:[^\s"'<>]*\/)*)tools[\\/]golden[^\s"'<>]*/g;

// Three base64url segments separated by dots, each reasonably long, so we
// don't accidentally treat e.g. a version string as a JWT.
const JWT_RE = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

const ORDERNO_RE = /ZHZ-\d{8}-\d{4}/g;

const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

// Mongo ObjectId: exactly 24 hex chars, not part of a longer hex/word run.
// Lookaround (not \b) because `_` is a word character: a boundary-based
// match would miss an id immediately preceded by e.g. an underscore.
const OBJECTID_RE = /(?<![0-9a-fA-F_])[0-9a-fA-F]{24}(?![0-9a-fA-F_])/g;

const ISO_TS_RE =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?/g;

// NOT in the brief's literal list. Added because Cloudinary's
// `uploadPaymentProofToCloudinary()` (server/utils/cloudinary.js) builds
// its public_id as `payment_<orderNumber-or-literal>_${Date.now()}`, and
// that raw epoch-millisecond timestamp is returned to the client as
// `payment.proofPublicId`. It is not an ISO-8601 string and not a URL (the
// URL itself normalises fine via URL_RE), so without this rule the two
// capture runs would never diff clean -- the whole point of this file.
// 13 digits, leading digit 1, covers the entire practical Unix-epoch-ms
// range (approx. Sept 2001 through Nov 2286). Uses digit lookaround rather
// than \b: these values are typically embedded right after an underscore
// (e.g. `payment_<orderNumber>_1755218381234`), and \b does not see a
// boundary between two word characters like `_` and `1`.
const EPOCH_MS_RE = /(?<!\d)1\d{12}(?!\d)/g;

/**
 * Normalises a single string leaf value by replacing every volatile
 * substring with its placeholder. Order matters only in that URL/PATH are
 * applied first so a full URL (which may itself embed a Mongo id) collapses
 * to a single <URL> token instead of a partially-substituted string.
 */
export function normaliseString(input) {
  if (typeof input !== 'string') return input;

  let out = input;
  out = out.replace(URL_RE, '<URL>');
  out = out.replace(PATH_RE, '<PATH>');
  out = out.replace(JWT_RE, '<JWT>');
  out = out.replace(ORDERNO_RE, '<ORDERNO>');
  out = out.replace(UUID_RE, '<ID>');
  out = out.replace(OBJECTID_RE, '<ID>');
  out = out.replace(ISO_TS_RE, '<TS>');
  out = out.replace(EPOCH_MS_RE, '<TS>');
  return out;
}

/**
 * Recursively normalises a JSON-compatible value (object / array / string /
 * number / boolean / null). Preserves key order and structure; only string
 * leaves are ever rewritten.
 */
export function normalise(value) {
  if (typeof value === 'string') return normaliseString(value);

  if (Array.isArray(value)) return value.map((item) => normalise(item));

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = normalise(val);
    }
    return out;
  }

  // number, boolean, null, undefined
  return value;
}

/**
 * Normalises a raw (non-JSON) text body, e.g. the CSV newsletter export or
 * the HTML unsubscribe landing page, by applying the same substitutions
 * directly to the whole string.
 */
export function normaliseText(text) {
  return normaliseString(text);
}
