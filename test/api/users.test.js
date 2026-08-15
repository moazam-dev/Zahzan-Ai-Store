// Task 9 (task-9-brief.md): route-level tests for the twelve app/api/users/*
// route handlers, exercised as real functions against a PGlite-backed
// lib/db.js -- the same pattern test/api/auth.test.js established for
// Task 8.
//
// Per Ruling C3 (binding): response SHAPE and exact MESSAGE STRINGS are
// asserted against the golden files named in comments below. Whole-body
// equality against a golden is deliberately NOT done -- ids/timestamps
// legitimately differ between the Mongo-seeded goldens and this PGlite
// fixture data.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationViaQuery } from '../helpers/applyMigration.js';

process.env.ZAHZAN_DB_DRIVER = 'pglite';

const { query, close } = await import('../../lib/db.js');
const { generateToken } = await import('../../lib/jwt.js');

import { GET as meGetRoute, PATCH as mePatchRoute } from '../../app/api/users/me/route.js';
import { POST as emailChangeRequestRoute } from '../../app/api/users/me/email-change-request/route.js';
import { GET as confirmEmailChangeRoute } from '../../app/api/users/me/confirm-email-change/route.js';
import {
  GET as addressesGetRoute,
  POST as addressesPostRoute
} from '../../app/api/users/me/addresses/route.js';
import {
  PATCH as addressPatchRoute,
  DELETE as addressDeleteRoute
} from '../../app/api/users/me/addresses/[id]/route.js';
import { PATCH as addressSetDefaultRoute } from '../../app/api/users/me/addresses/[id]/default/route.js';
import { GET as wishlistGetRoute, POST as wishlistPostRoute } from '../../app/api/users/me/wishlist/route.js';
import { DELETE as wishlistDeleteRoute } from '../../app/api/users/me/wishlist/[productId]/route.js';

function getRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

function postRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function patchRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function deleteRequest(path, headers = {}) {
  return new Request(`http://localhost${path}`, { method: 'DELETE', headers });
}

function paramsContext(params) {
  return { params: Promise.resolve(params) };
}

let userCounter = 0;
async function insertUser(overrides = {}) {
  userCounter += 1;
  const { rows } = await query(
    `insert into users (first_name, last_name, email, role, is_active, is_email_verified)
     values ($1, $2, $3, $4, true, true)
     returning *`,
    [
      overrides.firstName || 'Sara',
      overrides.lastName || 'Malik',
      overrides.email || `users-fixture-${userCounter}@zahzancontract.test`,
      overrides.role || 'customer'
    ]
  );
  return rows[0];
}

function tokenFor(user) {
  return generateToken(user.id, user.role);
}

function authHeader(user) {
  return { authorization: `Bearer ${tokenFor(user)}` };
}

async function insertProduct(overrides = {}) {
  const sku = overrides.sku || `ZHZ-WL-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await query(
    `insert into products (name, slug, sku, category, price, stock)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [
      overrides.name || 'Wishlist Product',
      overrides.slug || `wishlist-product-${sku.toLowerCase()}`,
      sku,
      overrides.category || 'WishlistCat',
      overrides.price ?? 2000,
      overrides.stock ?? 5
    ]
  );
  return rows[0];
}

describe('app/api/users/* route handlers (Task 9)', () => {
  beforeAll(async () => {
    await applyMigrationViaQuery(query);
  });

  afterAll(async () => {
    await close();
  });

  describe('GET /api/users/me and PATCH /api/users/me', () => {
    it('returns the profile and addresses -- shape matches tools/golden/020-users.me.json', async () => {
      const user = await insertUser({ firstName: 'Sara', lastName: 'Malik' });
      const res = await meGetRoute(getRequest('/api/users/me', authHeader(user)));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.user).toEqual({
        id: user.id,
        firstName: 'Sara',
        lastName: 'Malik',
        name: 'Sara Malik',
        email: user.email,
        phone: '',
        role: 'customer',
        isEmailVerified: true,
        createdAt: expect.any(String)
      });
      // No authProvider key on this narrower profile shape (golden 020).
      expect('authProvider' in body.user).toBe(false);
      expect(body.addresses).toEqual([]);
    });

    it('no token -> 401', async () => {
      const res = await meGetRoute(getRequest('/api/users/me'));
      expect(res.status).toBe(401);
    });

    it('updates firstName/lastName/phone -- shape matches tools/golden/021-users.patch-me.json', async () => {
      const user = await insertUser({ firstName: 'Sara', lastName: 'Malik' });
      const res = await mePatchRoute(
        patchRequest(
          '/api/users/me',
          { firstName: 'Sara', lastName: 'Malik-Updated', phone: '03007654321' },
          authHeader(user)
        )
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        message: 'Profile updated successfully.',
        user: {
          id: user.id,
          firstName: 'Sara',
          lastName: 'Malik-Updated',
          name: 'Sara Malik-Updated',
          email: user.email,
          phone: '03007654321',
          role: 'customer',
          isEmailVerified: true
        }
      });
    });

    it('derives firstName/lastName from a combined "name" field when neither is given directly', async () => {
      const user = await insertUser({ firstName: 'Old', lastName: 'Name' });
      const res = await mePatchRoute(patchRequest('/api/users/me', { name: 'Brand New Name' }, authHeader(user)));
      const body = await res.json();
      expect(body.user.firstName).toBe('Brand');
      expect(body.user.lastName).toBe('New Name');
    });
  });

  describe('POST /api/users/me/email-change-request', () => {
    it('same as current email -> 400 exact message -- matches tools/golden/093-extra2.users-email-change-request-same-as-current.json', async () => {
      const user = await insertUser({ email: 'same-current@zahzancontract.test' });
      const res = await emailChangeRequestRoute(
        postRequest('/api/users/me/email-change-request', { newEmail: 'same-current@zahzancontract.test' }, authHeader(user))
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'New email address cannot be the same as your current email.'
      });
    });

    it('duplicate email -> 400 exact message -- matches tools/golden/094-extra2.users-email-change-request-duplicate.json', async () => {
      const user = await insertUser();
      const other = await insertUser({ email: 'taken-email@zahzancontract.test' });
      const res = await emailChangeRequestRoute(
        postRequest('/api/users/me/email-change-request', { newEmail: other.email }, authHeader(user))
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'An account with this email address already exists.'
      });
    });

    it('success -- shape matches tools/golden/095-extra2.users-email-change-request-success.json and creates a token', async () => {
      const user = await insertUser();
      const newEmail = 'sara.newemail@zahzancontract.test';
      const res = await emailChangeRequestRoute(
        postRequest('/api/users/me/email-change-request', { newEmail }, authHeader(user))
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: `A confirmation link has been sent to ${newEmail}. Please check your inbox to complete the update.`
      });

      const { rows } = await query('select new_email from email_change_tokens where user_id = $1', [user.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].new_email).toBe(newEmail);
    });
  });

  describe('GET /api/users/me/confirm-email-change', () => {
    it('invalid token -> 400 exact message -- matches tools/golden/096-extra2.users-confirm-email-change-invalid-token.json', async () => {
      const res = await confirmEmailChangeRoute(
        getRequest('/api/users/me/confirm-email-change?token=deadbeefdeadbeef')
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Invalid or expired email change token.'
      });
    });

    it('success -- shape matches tools/golden/097-extra2.users-confirm-email-change-success.json and updates the account', async () => {
      const user = await insertUser({ email: 'before-confirm@zahzancontract.test' });
      const newEmail = 'after-confirm@zahzancontract.test';
      await emailChangeRequestRoute(
        postRequest('/api/users/me/email-change-request', { newEmail }, authHeader(user))
      );
      const { rows } = await query('select token from email_change_tokens where user_id = $1', [user.id]);
      const token = rows[0].token;

      const res = await confirmEmailChangeRoute(
        getRequest(`/api/users/me/confirm-email-change?token=${token}`)
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'Email address updated successfully.'
      });

      const { rows: userRows } = await query('select email, is_email_verified from users where id = $1', [user.id]);
      expect(userRows[0].email).toBe(newEmail);
      expect(userRows[0].is_email_verified).toBe(true);

      const { rows: tokenRows } = await query('select id from email_change_tokens where token = $1', [token]);
      expect(tokenRows).toHaveLength(0);
    });
  });

  describe('Address endpoints', () => {
    it('rejects a create with missing required fields', async () => {
      const user = await insertUser();
      const res = await addressesPostRoute(
        postRequest('/api/users/me/addresses', { fullName: 'No Rest' }, authHeader(user))
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Please provide all required address fields.'
      });
    });

    it('the first address is automatically default -- shape matches tools/golden/022-users.address-create.json', async () => {
      const user = await insertUser();
      const res = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          {
            fullName: 'Sara Malik',
            phone: '03007654321',
            addressLine1: '123 Gulberg Boulevard',
            addressLine2: 'Near DHA Phase 5',
            city: 'Lahore',
            province: 'Punjab',
            postalCode: '54000',
            country: 'Pakistan',
            label: 'Home'
          },
          authHeader(user)
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Address added successfully.');
      expect(body.address.isDefault).toBe(true);
      expect(body.address._id).toEqual(expect.any(String));
      expect('id' in body.address).toBe(false);
    });

    it('setting a new address as default clears the previous default; list sorts default-first', async () => {
      const user = await insertUser();
      const first = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          {
            fullName: 'First Addr',
            phone: '0300',
            addressLine1: 'Line 1',
            city: 'Lahore',
            postalCode: '54000'
          },
          authHeader(user)
        )
      ).then((r) => r.json());
      expect(first.address.isDefault).toBe(true);

      const second = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          {
            fullName: 'Second Addr',
            phone: '0300',
            addressLine1: 'Line 2',
            city: 'Lahore',
            postalCode: '54000',
            isDefault: true
          },
          authHeader(user)
        )
      ).then((r) => r.json());
      expect(second.address.isDefault).toBe(true);

      const listRes = await addressesGetRoute(getRequest('/api/users/me/addresses', authHeader(user)));
      const listBody = await listRes.json();
      expect(listBody.addresses).toHaveLength(2);
      expect(listBody.addresses[0]._id).toBe(second.address._id);
      expect(listBody.addresses[0].isDefault).toBe(true);
      const firstFromList = listBody.addresses.find((a) => a._id === first.address._id);
      expect(firstFromList.isDefault).toBe(false);
    });

    it('PATCH updates fields -- shape matches tools/golden/024-users.address-patch.json', async () => {
      const user = await insertUser();
      const created = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          { fullName: 'Patch Me', phone: '0300', addressLine1: 'Line 1', city: 'Lahore', postalCode: '54000' },
          authHeader(user)
        )
      ).then((r) => r.json());

      const res = await addressPatchRoute(
        patchRequest(
          `/api/users/me/addresses/${created.address._id}`,
          { addressLine2: 'Near DHA Phase 5, Block C', label: 'Home Address' },
          authHeader(user)
        ),
        paramsContext({ id: created.address._id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Address updated successfully.');
      expect(body.address.addressLine2).toBe('Near DHA Phase 5, Block C');
      expect(body.address.label).toBe('Home Address');
    });

    it('PATCH .../default sets the given address default and clears the others -- shape matches tools/golden/025-users.address-set-default.json', async () => {
      const user = await insertUser();
      const first = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          { fullName: 'A', phone: '0300', addressLine1: 'L1', city: 'Lahore', postalCode: '54000' },
          authHeader(user)
        )
      ).then((r) => r.json());
      const second = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          { fullName: 'B', phone: '0300', addressLine1: 'L2', city: 'Lahore', postalCode: '54000' },
          authHeader(user)
        )
      ).then((r) => r.json());
      expect(first.address.isDefault).toBe(true);
      expect(second.address.isDefault).toBe(false);

      const res = await addressSetDefaultRoute(
        patchRequest(`/api/users/me/addresses/${second.address._id}/default`, {}, authHeader(user)),
        paramsContext({ id: second.address._id })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Default address updated successfully.');
      expect(body.address.isDefault).toBe(true);

      const { rows } = await query('select id, is_default from addresses where id = $1', [first.address._id]);
      expect(rows[0].is_default).toBe(false);
    });

    it('deleting an address the user does not own is rejected with 404', async () => {
      const owner = await insertUser();
      const other = await insertUser();
      const created = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          { fullName: 'Owned', phone: '0300', addressLine1: 'L1', city: 'Lahore', postalCode: '54000' },
          authHeader(owner)
        )
      ).then((r) => r.json());

      const res = await addressDeleteRoute(
        deleteRequest(`/api/users/me/addresses/${created.address._id}`, authHeader(other)),
        paramsContext({ id: created.address._id })
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Address not found or unauthorized.'
      });
    });

    it('deleting the default address promotes the most recently created remaining address -- shape matches tools/golden/026-users.address-delete.json', async () => {
      const user = await insertUser();
      const first = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          { fullName: 'First', phone: '0300', addressLine1: 'L1', city: 'Lahore', postalCode: '54000' },
          authHeader(user)
        )
      ).then((r) => r.json());
      const second = await addressesPostRoute(
        postRequest(
          '/api/users/me/addresses',
          { fullName: 'Second', phone: '0300', addressLine1: 'L2', city: 'Lahore', postalCode: '54000' },
          authHeader(user)
        )
      ).then((r) => r.json());
      expect(first.address.isDefault).toBe(true);

      const res = await addressDeleteRoute(
        deleteRequest(`/api/users/me/addresses/${first.address._id}`, authHeader(user)),
        paramsContext({ id: first.address._id })
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        message: 'Address deleted successfully.'
      });

      const { rows } = await query('select id, is_default from addresses where id = $1', [second.address._id]);
      expect(rows[0].is_default).toBe(true);
    });
  });

  describe('Wishlist endpoints', () => {
    it('GET returns empty wishlist and products -- shape matches tools/golden/027-users.wishlist-get.json', async () => {
      const user = await insertUser();
      const res = await wishlistGetRoute(getRequest('/api/users/me/wishlist', authHeader(user)));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true, wishlist: [], products: [] });
    });

    it('POST toggle is idempotent in both directions -- matches tools/golden/028 and 029', async () => {
      const user = await insertUser();
      const product = await insertProduct();

      const onRes = await wishlistPostRoute(
        postRequest('/api/users/me/wishlist', { productId: product.id }, authHeader(user))
      );
      expect(onRes.status).toBe(200);
      await expect(onRes.json()).resolves.toEqual({ success: true, wishlist: [product.id] });

      const offRes = await wishlistPostRoute(
        postRequest('/api/users/me/wishlist', { productId: product.id }, authHeader(user))
      );
      expect(offRes.status).toBe(200);
      await expect(offRes.json()).resolves.toEqual({ success: true, wishlist: [] });

      // Toggle on again to confirm it flips back on cleanly (idempotent both ways).
      const onAgainRes = await wishlistPostRoute(
        postRequest('/api/users/me/wishlist', { productId: product.id }, authHeader(user))
      );
      await expect(onAgainRes.json()).resolves.toEqual({ success: true, wishlist: [product.id] });
    });

    it('missing productId -> 400 with the exact (period-less) message', async () => {
      const user = await insertUser();
      const res = await wishlistPostRoute(postRequest('/api/users/me/wishlist', {}, authHeader(user)));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        message: 'Product ID is required'
      });
    });

    it('GET returns ids and products consistently, in insertion order', async () => {
      const user = await insertUser();
      const productA = await insertProduct({ name: 'Wishlist A' });
      const productB = await insertProduct({ name: 'Wishlist B' });

      await wishlistPostRoute(postRequest('/api/users/me/wishlist', { productId: productA.id }, authHeader(user)));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await wishlistPostRoute(postRequest('/api/users/me/wishlist', { productId: productB.id }, authHeader(user)));

      const res = await wishlistGetRoute(getRequest('/api/users/me/wishlist', authHeader(user)));
      const body = await res.json();
      expect(body.wishlist).toEqual([productA.id, productB.id]);
      expect(body.products.map((p) => p._id)).toEqual([productA.id, productB.id]);
      expect(body.products.every((p) => typeof p.name === 'string')).toBe(true);
    });

    it('DELETE /wishlist/:productId removes the entry -- matches tools/golden/030-users.wishlist-delete.json', async () => {
      const user = await insertUser();
      const product = await insertProduct();
      await wishlistPostRoute(postRequest('/api/users/me/wishlist', { productId: product.id }, authHeader(user)));

      const res = await wishlistDeleteRoute(
        deleteRequest(`/api/users/me/wishlist/${product.id}`, authHeader(user)),
        paramsContext({ productId: product.id })
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true, wishlist: [] });
    });
  });
});
