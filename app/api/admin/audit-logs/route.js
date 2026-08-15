// GET /api/admin/audit-logs
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminAuditLogs (Task 13, task-13-brief.md). Protected + admin-only.
// Default limit 20 (this endpoint's own controller default). action:
// anchored case-insensitive exact match (action strings are our own fixed
// set, e.g. 'PRODUCT_CREATED' -- no LIKE metacharacters).
//
// `adminId` is always populated (source: `.populate('adminId', 'firstName
// lastName email')`, unconditional, unlike newsletter's optional userId).
//
// Shape checked against tools/golden/082-admin.audit-logs.json.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../lib/auth.js';
import { serializeAuditLog } from '../../../../lib/serialize.js';

export const GET = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get('limit'), 10) || 20);
  const skip = (page - 1) * limit;

  const action = searchParams.get('action');

  const conditions = [];
  const params = [];

  if (action && action !== 'all') {
    params.push(action);
    conditions.push(`action ilike $${params.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const { rows: countRows } = await query(`select count(*)::int as count from audit_logs ${where}`, params);
  const total = countRows[0].count;

  const listParams = [...params, limit, skip];
  const { rows: logRows } = await query(
    `select * from audit_logs ${where} order by created_at desc limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );

  const logs = await Promise.all(
    logRows.map(async (row) => {
      const { rows: adminRows } = await query('select * from users where id = $1', [row.admin_id]);
      return serializeAuditLog(row, { admin: adminRows[0] || null });
    })
  );

  return ok({
    success: true,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    logs
  });
});
