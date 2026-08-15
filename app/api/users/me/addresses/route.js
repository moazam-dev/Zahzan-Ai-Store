// GET /api/users/me/addresses, POST /api/users/me/addresses
//
// Statement-by-statement port of server/controllers/userController.js's
// getUserAddresses and addUserAddress (Task 9, task-9-brief.md). Both
// protected -- matches server/routes/userRoutes.js's
// `router.get('/me/addresses', protect, getUserAddresses)` and
// `router.post('/me/addresses', protect, addUserAddress)`.
//
// Shape checked against tools/golden/023-users.address-list.json and
// tools/golden/022-users.address-create.json. Addresses serialize with
// `_id` only, never `id` (GC2/Ruling C12 -- see lib/serialize.js's
// serializeAddress).

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../lib/http.js';
import { requireAuth } from '../../../../../lib/auth.js';
import { serializeAddress } from '../../../../../lib/serialize.js';

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { rows } = await query(
    'select * from addresses where user_id = $1 order by is_default desc, created_at desc',
    [user.id]
  );

  return ok({ success: true, addresses: rows.map(serializeAddress) });
});

export const POST = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const {
    fullName,
    phone,
    addressLine1,
    addressLine2,
    city,
    province,
    state,
    postalCode,
    country,
    label,
    isDefault
  } = body;

  if (!fullName || !phone || !addressLine1 || !city || !postalCode) {
    return fail('Please provide all required address fields.', 400);
  }

  const { rows: countRows } = await query('select count(*)::int as count from addresses where user_id = $1', [
    user.id
  ]);
  const existingAddressesCount = countRows[0].count;
  const shouldBeDefault = Boolean(isDefault) || existingAddressesCount === 0;

  if (shouldBeDefault) {
    await query('update addresses set is_default = false where user_id = $1', [user.id]);
  }

  const { rows } = await query(
    `insert into addresses (
       user_id, full_name, phone, address_line1, address_line2, city, province,
       postal_code, country, label, is_default
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [
      user.id,
      fullName.trim(),
      phone.trim(),
      addressLine1.trim(),
      addressLine2 ? addressLine2.trim() : '',
      city.trim(),
      (province || state || 'Punjab').trim(),
      postalCode.trim(),
      (country || 'Pakistan').trim(),
      label ? label.trim() : 'Home',
      shouldBeDefault
    ]
  );

  return ok(
    {
      success: true,
      message: 'Address added successfully.',
      address: serializeAddress(rows[0])
    },
    201
  );
});
