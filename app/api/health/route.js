// GET /api/health
//
// Port of server/server.js's inline health-check handler (Task 8,
// task-8-brief.md). The old handler read `mongoose.connection.readyState`
// synchronously; there is no equivalent synchronous "connection state" for
// a pooled/serverless Postgres connection, so dbStatus is derived from
// whether a trivial ping query succeeds -- 'connected' on success,
// 'disconnected' on any failure. The full four-state vocabulary
// (`{0:'disconnected',1:'connected',2:'connecting',3:'disconnecting'}`) is
// kept verbatim per task-8-brief.md even though 'connecting'/'disconnecting'
// are unreachable from a single request/response ping, so the shape stays
// obviously traceable back to the source.

export const runtime = 'nodejs';

import { query } from '../../../lib/db.js';
import { ok, withErrorHandler } from '../../../lib/http.js';

const DB_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

async function pingDb() {
  try {
    await query('select 1');
    return 1;
  } catch (err) {
    return 0;
  }
}

export const GET = withErrorHandler(async () => {
  const dbState = await pingDb();

  return ok({
    success: true,
    message: 'Zahzan API is running',
    data: {
      dbStatus: DB_STATES[dbState] || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    }
  });
});
