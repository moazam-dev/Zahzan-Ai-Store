// GET /api/admin/newsletter
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminNewsletterSubscribers (Task 13, task-13-brief.md). Protected +
// admin-only. Default limit 20 (this endpoint's own controller default).
//
// status is a PLAIN lowercase equality check in the source (`query.status =
// status.toLowerCase()`), NOT a regex like orders/products/audit-logs --
// reproduced as `status = $n` (already-lowercase stored values), not `ilike`.
// search: unanchored substring match on email.
//
// `userId`, when populated, uses serializePopulatedUserSummary (source:
// `.populate('userId', 'firstName lastName email')`, no phone -- distinct
// from serializePaymentUserSummary's select string).
//
// Shape checked against tools/golden/069-admin.newsletter-list-paged.json,
// 070-admin.newsletter-list-search.json, 071-admin.newsletter-list-status.json.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, withErrorHandler } from '../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../lib/auth.js';
import { serializeNewsletterSubscriber } from '../../../../lib/serialize.js';

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get('limit'), 10) || 20);
  const skip = (page - 1) * limit;

  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status.toLowerCase());
    conditions.push(`status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`email ilike $${params.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const { rows: countRows } = await query(`select count(*)::int as count from newsletter_subscribers ${where}`, params);
  const total = countRows[0].count;

  const listParams = [...params, limit, skip];
  const { rows: subscriberRows } = await query(
    `select * from newsletter_subscribers ${where} order by created_at desc limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );

  const subscribers = await Promise.all(
    subscriberRows.map(async (row) => {
      let userRow = null;
      if (row.user_id != null) {
        const { rows: userRows } = await query('select * from users where id = $1', [row.user_id]);
        userRow = userRows[0] || null;
      }
      return serializeNewsletterSubscriber(row, userRow ? { user: userRow } : {});
    })
  );

  const { rows: totalRows } = await query('select count(*)::int as count from newsletter_subscribers');
  const { rows: activeRows } = await query(
    `select count(*)::int as count from newsletter_subscribers where status = 'subscribed'`
  );
  const { rows: unsubRows } = await query(
    `select count(*)::int as count from newsletter_subscribers where status = 'unsubscribed'`
  );

  return ok({
    success: true,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    stats: {
      totalSubscribers: totalRows[0].count,
      activeSubscribers: activeRows[0].count,
      unsubscribedSubscribers: unsubRows[0].count
    },
    subscribers
  });
});
