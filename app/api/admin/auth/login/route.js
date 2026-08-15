// POST /api/admin/auth/login
//
// Statement-by-statement port of server/controllers/adminController.js's
// adminLogin (Task 13, task-13-brief.md). Public -- matches
// server/routes/adminRoutes.js's `router.post('/auth/login', adminLogin)`,
// declared BEFORE the router-wide `protect`/`requireAdmin` middleware.
//
// GC4 quirk, reproduced exactly, not fixed: generateToken(user.id) is called
// with NO role argument, so the minted token carries the DEFAULT role
// ('customer'), never 'admin' -- see lib/jwt.js's generateToken(userId, role
// = 'customer'). This works only because every other admin route re-checks
// req.user.role from the database (lib/auth.js's requireAdmin), not the
// token payload. Flagged in task-13-report.md.
//
// Shape checked against tools/golden/054-admin.login.json.

export const runtime = 'nodejs';

import bcrypt from 'bcryptjs';
import { query } from '../../../../../lib/db.js';
import { ok, fail, withErrorHandler } from '../../../../../lib/http.js';
import { serializeAdminAuthUser } from '../../../../../lib/serialize.js';
import { generateToken } from '../../../../../lib/jwt.js';
import { recordAuditLog, getClientIp } from '../../../../../lib/auditLogger.js';

export const POST = withErrorHandler(async (request) => {
  const body = await request.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return fail('Please provide email and password', 400);
  }

  const { rows } = await query('select * from users where email = $1', [email.toLowerCase()]);
  const user = rows[0];

  if (!user) {
    return fail('Invalid administrator credentials', 401);
  }

  if (user.role !== 'admin') {
    return fail('Access denied: Account does not have administrator privileges', 403);
  }

  if (!user.is_active) {
    return fail('Administrator account is deactivated', 403);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return fail('Invalid administrator credentials', 401);
  }

  // GC4 quirk -- see the header comment. No role argument, deliberately.
  const token = generateToken(user.id);

  await recordAuditLog({
    adminId: user.id,
    action: 'ADMIN_LOGIN',
    entity: 'User',
    entityId: String(user.id),
    ipAddress: getClientIp(request)
  });

  return ok({
    success: true,
    message: 'Admin login successful',
    token,
    user: serializeAdminAuthUser(user)
  });
});
