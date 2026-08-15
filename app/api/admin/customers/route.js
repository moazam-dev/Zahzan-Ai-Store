// GET /api/admin/customers
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAllUsers (Task 13, task-13-brief.md). Protected + admin-only.
//
// Pagination default 1/10, matching this endpoint's own controller default.
// role = 'customer' is unconditional (never a query param). Deliberately NO
// status filter -- the source builds `query = { role: 'customer' }` and
// only ever adds `$or` for search; a `status` query param is read nowhere
// in getAllUsers, so it's silently ignored (GC4: not a feature to add).
//
// Shape checked against tools/golden/063-admin.customers-list-paged.json,
// 064-admin.customers-list-search.json, 065-admin.customers-list-status.json
// (065 proves `status=active` has zero effect -- all 3 seeded customers
// still come back).

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, withErrorHandler } from '../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../lib/auth.js';
import { serializeUser } from '../../../../lib/serialize.js';

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get('limit'), 10) || 10);
  const skip = (page - 1) * limit;

  const search = searchParams.get('search');

  const conditions = [`role = 'customer'`];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(`(first_name ilike $${idx} or last_name ilike $${idx} or email ilike $${idx} or phone ilike $${idx})`);
  }

  const where = `where ${conditions.join(' and ')}`;

  const { rows: countRows } = await query(`select count(*)::int as count from users ${where}`, params);
  const total = countRows[0].count;

  const listParams = [...params, limit, skip];
  const { rows } = await query(
    `select * from users ${where} order by created_at desc limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );

  return ok({
    success: true,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    customers: rows.map((row) => serializeUser(row))
  });
});
