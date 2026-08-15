// GET /api/admin/dashboard
//
// Statement-by-statement port of server/controllers/adminController.js's
// getAdminDashboardStats (Task 13, task-13-brief.md). Protected + admin-only.
//
// The source issues 13 sequential Mongoose queries plus 2 aggregations;
// admin_dashboard_stats() (supabase/migrations/0001_init.sql, this same
// task) replaces all of them with one round trip, returning a single jsonb
// blob this route reshapes into the exact nested `stats` envelope. The JS
// partition of lowStockProducts into lowStockCount (stock > 0) /
// outOfStockCount (stock === 0) deliberately stays HERE, in JS, not in SQL
// -- task-13-brief.md is explicit about that split -- with lowStockProducts
// itself carrying ALL rows at stock <= 3, not just the "low" subset.
//
// Shape checked against tools/golden/056-admin.dashboard.json.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { requireAuth, requireAdmin } from '../../../../lib/auth.js';
import {
  serializeOrder,
  serializeDashboardRecentCustomer,
  serializeDashboardLowStockProduct
} from '../../../../lib/serialize.js';

function toNumber(value) {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value);
}

export const GET = withApiHandler(async (request) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { rows } = await query('select admin_dashboard_stats() as stats');
  const stats = rows[0].stats;

  const lowStockRows = stats.lowStockProducts ?? [];
  const lowStockCount = lowStockRows.filter((p) => p.stock > 0).length;
  const outOfStockCount = lowStockRows.filter((p) => p.stock === 0).length;

  return ok({
    success: true,
    stats: {
      orders: stats.orders,
      revenue: toNumber(stats.revenue),
      customers: {
        total: stats.customersTotal,
        recent: (stats.recentCustomers ?? []).map(serializeDashboardRecentCustomer)
      },
      inventory: {
        totalProducts: stats.totalProducts,
        lowStockCount,
        outOfStockCount,
        lowStockProducts: lowStockRows.map(serializeDashboardLowStockProduct)
      },
      payments: {
        pending: stats.paymentsPending,
        verified: stats.paymentsVerified,
        rejected: stats.paymentsRejected,
        verifiedAmount: toNumber(stats.verifiedPaymentAmount)
      },
      newsletter: {
        totalSubscribers: stats.totalSubscribers
      },
      recentOrders: (stats.recentOrders ?? []).map((row) => serializeOrder(row))
    }
  });
});
