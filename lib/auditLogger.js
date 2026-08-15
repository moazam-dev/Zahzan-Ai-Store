// lib/auditLogger.js
//
// Direct port of server/utils/auditLogger.js's recordAuditLog (Task 13,
// task-13-brief.md: "Audit logging via a ported lib/auditLogger.js fires on
// the same actions with the same action strings; it swallows its own errors
// exactly as today.") Same guard clause (`if (!adminId || !action ||
// !entity) return;`), same defaults, same try/catch-and-log-only failure
// mode -- a failed insert must never fail the caller's admin action, exactly
// like the source's own bare `console.error` (never re-thrown).
//
// getClientIp lives here (not lib/rateLimit.js, which is a finished
// interface out of this task's scope) because every admin route handler that
// calls recordAuditLog also needs to compute the `ipAddress` argument itself
// -- the source's controllers read `req.ip`, set by Express from the
// connection's remote address / X-Forwarded-For under a trusted proxy.
// Mirrors lib/rateLimit.js's own getClientIp exactly (same header
// precedence) for consistency, but is its own copy: extending that file is
// out of scope, and duplicating ~10 lines here is preferable to widening a
// finished interface's exports for a single new caller.

import { query } from './db.js';

export async function recordAuditLog({
  adminId,
  action,
  entity,
  entityId = '',
  ipAddress = '',
  metadata = {}
} = {}) {
  try {
    if (!adminId || !action || !entity) return;
    await query(
      `insert into audit_logs (admin_id, action, entity, entity_id, ip_address, metadata)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [adminId, action, entity, String(entityId), ipAddress, JSON.stringify(metadata ?? {})]
    );
  } catch (error) {
    console.error('Failed to create audit log:', error.message);
  }
}

/**
 * Client IP: `x-forwarded-for`'s first entry, falling back to `x-real-ip`,
 * then `''` (matches the source's own `req.ip || ''` fallback -- Express's
 * req.ip is never undefined in the source, so the OR only ever protects
 * against an empty string, which this reproduces with the same empty-string
 * fallback rather than rateLimit.js's `'unknown'`).
 */
export function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0].trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  return '';
}
