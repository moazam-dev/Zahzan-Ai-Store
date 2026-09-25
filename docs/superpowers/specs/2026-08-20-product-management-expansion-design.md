# Product Management Expansion — Design

Date: 2026-08-20
Status: Approved

## Goal

Remove every product-specific static value from the customer-facing frontend and
make the whole Product Page database-driven, with an Admin Add/Edit Product form
that can enter and edit each of those values.

The Product Page's design is frozen: layout, sections, section order, typography,
spacing, colours, buttons and the image gallery must be byte-identical. Only the
DATA SOURCE changes.

## Approved exceptions to the frontend freeze

One, explicitly approved by the user during brainstorming:

- **A colour selector is added to the Product Page.** The page has no colour
  selector today (only a read-only `COLOR` text cell), so there is nothing to
  preserve. The new swatch row is styled off the existing size-selector buttons
  and sits beneath the COLOR cell. It sets the COLOR cell text and the colour
  value passed to Add to Bag / Buy Now. The image gallery is NOT touched.

Everything else stays frozen.

## Decisions taken (with the rejected alternative)

| Decision | Chosen | Rejected |
|---|---|---|
| Colours | Add a selector (approved exception) | Keep the read-only cell |
| Size stock | New `size_stock jsonb`, `stock` kept as the maintained total | Replace `stock` entirely |
| Empty field rendering | Render blank, always keep the label and its cell | Hide the row when empty |
| Migration execution | Claude writes migration + backfill, user runs them | Claude writes to live Supabase |
| Model/kurti details | Structured admin inputs, identical page rendering | Free text; or new kurti spec rows |
| Swatch click | Sets colour + COLOR cell text only | Also jump the gallery |
| Sold-out size | Disabled + struck, same position | Hidden |

## Existing schema (before)

`products` (supabase/migrations/0001_init.sql:79) already carries most of what
the spec asks for. These need no schema change, only exposure through the admin
form and removal of the page's fallbacks:

`name, slug, sku, description, quick_description, price, original_price,
category, badge, images[], image, hover_image, colors jsonb [{name,hex,image}],
color, sizes[], fabric, work, breakdown jsonb {shirt,trouser,dupatta},
model_info, care_instructions[], gallery[], stock, is_active`

## Schema after — four new columns

Migration: `supabase/migrations/0004_product_details.sql`

| Column | Type | Purpose |
|---|---|---|
| `size_stock` | `jsonb not null default '{}'::jsonb` | `{"S":10,"M":15}` — authoritative per size when non-empty |
| `model_height` | `text` | Admin "Model Height" |
| `model_size` | `text` | Admin "Model Wears Size" |
| `fit_note` | `text` | Replaces the page's hardcoded "Relaxed fluid fit..." sentence |

- `is_valid_size_stock(jsonb)` — an `immutable` helper used in a `CHECK` so the
  database itself rejects non-integer / negative / non-object size stock.
- `model_info` is retained and written as a DERIVED value
  (`Model Height: {h} | Model wears: {s}`) on every admin write, so the page's
  SIZE & FIT row and every existing API consumer stay byte-identical.
- `stock` is retained and maintained as `sum(size_stock)` whenever `size_stock`
  is non-empty, so cart validation, the admin dashboard low-stock statistics and
  the page's availability indicator keep working with no change.

## Stock mechanism

- **`create_order` RPC** — inside the existing `select ... for update` row lock:
  when `size_stock` has the requested size key, validate against that size and
  decrement both `size_stock->size` and `stock`. When `size_stock` is `{}`
  (not size-tracked), behaviour is exactly today's product-level check. Same
  lock, so the existing race protection is unchanged.
- **`cancel_order` RPC** — restocks the size and the total, mirroring the
  decrement.
- **Cart add** (`app/api/cart/items/route.js`) — validates against the selected
  size's stock when size-tracked, else product stock. Existing error string
  format is preserved.
- **Admin dashboard stats** — untouched; reads `stock`, which stays correct.

## API

`serializeProduct` gains `sizeStock`, `modelHeight`, `modelSize`, `fitNote`.
Every existing key keeps its exact name, type and present/absent semantics
(the `if (row.x != null)` pattern). Nothing is removed, so no existing consumer
breaks.

`POST /api/products`, `POST /api/admin/products` and
`PUT /api/admin/products/:id` accept the new fields, all admin-authorised as
today, with server-side validation: price >= 0, per-size stock integer >= 0,
colour entries need a non-empty name, required fields non-empty. Failures use
the existing `fail(message, 400)` shape.

## Admin Add/Edit form

`views/admin/AdminProducts.jsx` — same modal, same dark palette, same input
classes, regrouped into sections using the existing label/border styling:

Basic - Fabric & Work - Colours (repeatable name + hex + image) - Size & Stock
(repeatable size + stock; drives both `sizes[]` and `size_stock`) - Product
Details (shirt/trouser/dupatta) - Model Details (height, wears size, fit note) -
Care Instructions (repeatable) - Images (existing reorderable gallery).

Add and Edit share one form, so everything addable is editable. The hardcoded
`fabric: 'Pure Silk'` / `work: 'Hand Embroidery'` / `color: 'Ivory'` defaults and
the Unsplash placeholder URLs are removed — new products start empty.

## Product Page data mapping

| Page element | Source |
|---|---|
| FABRIC cell | `product.fabric` |
| COLOR cell | selected colour, else `product.color` |
| WORK cell | `product.work` |
| Colour swatches (new) | `product.colors[]` |
| Size buttons | `product.sizes[]`, disabled when `sizeStock[size] === 0` |
| Availability | selected size's stock, else `product.stock` |
| SHIRT / TROUSER / DUPATTA | `product.breakdown.*` |
| SIZE & FIT line | `product.modelInfo` |
| Fit sentence | `product.fitNote` |
| CARE INSTRUCTIONS | `product.careInstructions[]` |
| Gallery | `product.images[]` |

Fallbacks removed: `'Cotton Lawn'`, `'Ivory'`, `'Embroidered'`, all three
breakdown paragraphs, the `modelInfo` string, the care-instructions `<li>` block,
the "Relaxed fluid fit..." sentence, and both Unsplash gallery URLs.

## Migration of the existing 6 products

`tools/backfill-product-details.mjs` — additive only, no deletes, no re-inserts,
so the row count stays at exactly 6:

- `fit_note` from the sentence the page currently displays (an existing
  displayed value, not invented)
- `model_height` / `model_size` parsed from each product's existing `model_info`
- `colors` set to `[{name: <existing color>, hex: null}]` where `colors` is empty
- `size_stock` deliberately left `{}`. Splitting one `stock: 8` across S/M/L
  would be invented data; leaving it empty means those products behave exactly
  as they do today until real per-size numbers are entered in the admin panel.

`tools/seed-products.mjs` is updated for the new columns so a fresh seed still
lands exactly 6 rows.

## Testing

Against the PGlite database, which applies the real migrations:
size-stock decrement on order, rejection when a size is short, restock on
cancel, cart validation per size, admin create/update round-trip of every new
field, and validation rejections. `test/schema.test.js` and
`test/serialize.test.js` extended for the new columns and keys.

## Known consequence

The repo's byte-parity contract suite (`tools/golden/*.json`) records the product
API response of the old Express/Mongoose stack. Adding `sizeStock` /
`modelHeight` / `modelSize` / `fitNote` to `serializeProduct` diverges from those
captures — unavoidably, since new API fields are the requirement.

CORRECTION to this design's original plan, made during implementation: the
captures are NOT regenerated. They are recordings of the old stack's actual
request/response pairs, and this codebase cannot produce them — "regenerating"
them would only record the new behaviour against itself and destroy their value
as a historical reference. They are left untouched and every divergence is
listed in `docs/PARITY_REPORT.md` §12 P6 instead. Nothing fails as a result:
per Ruling C3 the test suite asserts shape and message strings, never whole-body
equality against a golden.

## Out of scope

Authentication, Google/Facebook login, payments, email, newsletter, virtual
try-on, storage, customer accounts, and the admin dashboard statistics are not
modified.
