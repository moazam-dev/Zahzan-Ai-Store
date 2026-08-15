// PATCH /api/users/me/addresses/:id, DELETE /api/users/me/addresses/:id
//
// Statement-by-statement port of server/controllers/userController.js's
// updateUserAddress and deleteUserAddress (Task 9, task-9-brief.md). Both
// protected -- matches server/routes/userRoutes.js's
// `router.patch('/me/addresses/:id', protect, updateUserAddress)` and
// `router.delete('/me/addresses/:id', protect, deleteUserAddress)`.
//
// Both scope the lookup to `where id = $1 and user_id = $2` -- an address
// the authenticated user does not own is indistinguishable from a
// nonexistent one, reproducing the source's `Address.findOne({ _id, userId:
// req.user._id })` exactly (a 404 "Address not found or unauthorized.", not
// a 403). Shape checked against tools/golden/024-users.address-patch.json
// and tools/golden/026-users.address-delete.json.

export const runtime = 'nodejs';

import { query } from '../../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../../lib/http.js';
import { requireAuth } from '../../../../../../lib/auth.js';
import { serializeAddress } from '../../../../../../lib/serialize.js';

export const PATCH = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { id: addressId } = await context.params;

  const { rows } = await query('select * from addresses where id = $1 and user_id = $2', [addressId, user.id]);
  const address = rows[0];

  if (!address) {
    return fail('Address not found or unauthorized.', 404);
  }

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

  // The source's single-default invariant: clearing every OTHER address's
  // isDefault BEFORE saving this one as the new default, in the same
  // request.
  let newIsDefault = address.is_default;
  if (isDefault) {
    await query('update addresses set is_default = false where user_id = $1', [user.id]);
    newIsDefault = true;
  }

  const newFullName = fullName ? fullName.trim() : address.full_name;
  const newPhone = phone ? phone.trim() : address.phone;
  const newAddressLine1 = addressLine1 ? addressLine1.trim() : address.address_line1;
  const newAddressLine2 = addressLine2 !== undefined ? addressLine2.trim() : address.address_line2;
  const newCity = city ? city.trim() : address.city;
  const newProvince = province || state ? (province || state).trim() : address.province;
  const newPostalCode = postalCode ? postalCode.trim() : address.postal_code;
  const newCountry = country ? country.trim() : address.country;
  const newLabel = label ? label.trim() : address.label;

  const { rows: updatedRows } = await query(
    `update addresses set
       full_name = $1, phone = $2, address_line1 = $3, address_line2 = $4, city = $5,
       province = $6, postal_code = $7, country = $8, label = $9, is_default = $10
     where id = $11
     returning *`,
    [
      newFullName,
      newPhone,
      newAddressLine1,
      newAddressLine2,
      newCity,
      newProvince,
      newPostalCode,
      newCountry,
      newLabel,
      newIsDefault,
      addressId
    ]
  );

  return ok({
    success: true,
    message: 'Address updated successfully.',
    address: serializeAddress(updatedRows[0])
  });
});

export const DELETE = withErrorHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { id: addressId } = await context.params;

  const { rows } = await query('select * from addresses where id = $1 and user_id = $2', [addressId, user.id]);
  const address = rows[0];

  if (!address) {
    return fail('Address not found or unauthorized.', 404);
  }

  const wasDefault = address.is_default;
  await query('delete from addresses where id = $1', [addressId]);

  if (wasDefault) {
    const { rows: remainingRows } = await query(
      'select * from addresses where user_id = $1 order by created_at desc limit 1',
      [user.id]
    );
    const remainingAddress = remainingRows[0];
    if (remainingAddress) {
      await query('update addresses set is_default = true where id = $1', [remainingAddress.id]);
    }
  }

  return ok({ success: true, message: 'Address deleted successfully.' });
});
