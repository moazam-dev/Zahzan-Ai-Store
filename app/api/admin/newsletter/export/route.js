// GET /api/admin/newsletter/export
//
// Statement-by-statement port of server/controllers/adminController.js's
// exportAdminNewsletterSubscribers (Task 13, task-13-brief.md). Protected +
// admin-only. Same filter semantics as GET /api/admin/newsletter (plain
// lowercase status equality, unanchored email substring search), but no
// pagination -- every matching row is exported.
//
// CSV column order and content type are byte-identical to the source:
// `Email,Status,Source,Subscribed Date,Unsubscribed Date` header, one row
// per subscriber, `Content-Type: text/csv`.
//
// Shape checked against tools/golden/081-admin.newsletter-export.json.

export const runtime = 'nodejs';

import { query } from '../../../../../lib/db.js';
import { withErrorHandler } from '../../../../../lib/http.js';
import { requireAuth, requireAdmin } from '../../../../../lib/auth.js';
import { recordAuditLog, getClientIp } from '../../../../../lib/auditLogger.js';

export const GET = withErrorHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
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
  const { rows: subscribers } = await query(
    `select * from newsletter_subscribers ${where} order by subscribed_at desc`,
    params
  );

  let csvContent = 'Email,Status,Source,Subscribed Date,Unsubscribed Date\n';

  for (const sub of subscribers) {
    const email = `"${sub.email.replace(/"/g, '""')}"`;
    const subStatus = sub.status;
    const source = `"${(sub.source || 'footer').replace(/"/g, '""')}"`;
    const subDate = sub.subscribed_at ? `"${new Date(sub.subscribed_at).toISOString()}"` : '""';
    const unsubDate = sub.unsubscribed_at ? `"${new Date(sub.unsubscribed_at).toISOString()}"` : '""';

    csvContent += `${email},${subStatus},${source},${subDate},${unsubDate}\n`;
  }

  await recordAuditLog({
    adminId: user.id,
    action: 'NEWSLETTER_EXPORT',
    entity: 'NewsletterSubscriber',
    ipAddress: getClientIp(request),
    metadata: { recordCount: subscribers.length, filterStatus: status || 'all' }
  });

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="zahzan_newsletter_subscribers_${Date.now()}.csv"`
    }
  });
});
