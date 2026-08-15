#!/usr/bin/env node
// tools/run-pglite-server.mjs
//
// Task 15 (parity verification). Boots the built Next.js app against an
// in-process PGlite database, then triggers migration + Task 2 contract
// fixture seeding through the app's own route-handler code path (see
// app/api/test-bootstrap/route.js's header comment for exactly why
// that indirection is required, not optional): PGlite is an in-process WASM
// database with no network listener, and lib/db.js's "lazy module
// singleton" (lib/db.js:24-29) turned out empirically to NOT be shared
// between a plain top-level `node` script's own import of lib/db.js and the
// SEPARATELY-BUNDLED copy every Next.js route handler imports, even within
// one OS process -- calling the migration/seed logic through a real route
// handler is what actually lands it in the instance every other endpoint
// reads from.
//
// Requires `npm run build` to have already produced `.next/` (this uses
// Next's programmatic API with `dev: false`, i.e. the production server
// path -- the same code path `next start` uses, just embedded in-process
// instead of spawned as its own CLI process, which is what makes step 2
// below possible at all).
//
// Usage:
//   node tools/run-pglite-server.mjs [--port 3000]
//
// Deliberately sets ZAHZAN_DB_DRIVER=pglite and ZAHZAN_STORAGE_DRIVER=memory
// itself (not left to the caller's shell env) so this script's behaviour is
// self-contained and can't accidentally point at a real Postgres/Supabase
// project by a missing env var. JWT_SECRET / JWT_REFRESH_SECRET are
// deliberately left UNSET -- lib/jwt.js's hardcoded dev-fallback secrets
// are byte-identical to server/utils/jwt.js's (GC5), and the whole point of
// the JWT-continuity check this server exists to support is that a token
// minted by the old code validates here with NO shared secret configured
// out-of-band.

process.env.ZAHZAN_DB_DRIVER = 'pglite';
process.env.ZAHZAN_STORAGE_DRIVER = 'memory';
// Matches docs/CONTRACT_CAPTURE.md's old-stack capture recipe: force the
// email dispatcher into its "dev log" fallback so no real email is ever
// sent (and so no real EMAIL_HOST/RESEND credentials are required here).
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_HOST;
delete process.env.EMAIL_USER;

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { port: 3000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = Number(argv[++i]);
  }
  return args;
}

async function main() {
  const { port } = parseArgs(process.argv.slice(2));

  console.log('[run-pglite-server] Preparing Next.js (production build, dev: false)...');
  const { default: next } = await import('next');
  const app = next({ dev: false, dir: REPO_ROOT, hostname: 'localhost', port });
  const handler = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer((req, res) => handler(req, res));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, 'localhost', () => resolve());
  });

  console.log(`[run-pglite-server] Listening on http://localhost:${port}. Bootstrapping DB via the app's own route handler...`);

  const res = await fetch(`http://localhost:${port}/api/test-bootstrap`, { method: 'POST' });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(`Bootstrap failed: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  console.log('[run-pglite-server] Bootstrap OK:', JSON.stringify(body));

  console.log(`[run-pglite-server] READY http://localhost:${port}`);
}

main().catch((err) => {
  console.error('[run-pglite-server] FAILED:', err);
  process.exitCode = 1;
});
