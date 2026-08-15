#!/usr/bin/env node
// tools/run-pglite-server.mjs
//
// Task 15 (parity verification). Boots the built Next.js app against an
// in-process PGlite database. Migration + Task 2 contract fixture seeding is
// done by calling the root `instrumentation.js` module's `register()`
// function DIRECTLY (imported below) before the HTTP server starts
// listening -- not left to Next's own automatic invocation of that hook.
//
// Why explicit, not automatic: empirically (Task 15), under the programmatic
// custom-server API used below, Next does NOT reliably await `register()`
// during `app.prepare()` before serving the first request -- it fires the
// hook lazily, racing the first real request. Calling `register()` ourselves
// and awaiting it before `server.listen()` makes bootstrap deterministic
// regardless of Next's own internal timing; `register()`'s own globalThis-
// cached idempotency guard (see instrumentation.js) makes it safe even if
// Next's internal invocation also fires later on some request.
//
// This script used to trigger migration+seed via a dedicated
// `POST /api/test-bootstrap` route; that route has been deleted (Task 15
// Critical-2 fix) since instrumentation.js's register() now does the same
// job with zero HTTP surface. See instrumentation.js's header comment for
// the full story, including why a plain module-scope singleton in
// lib/db.js was not enough on its own (lib/db.js now stores the PGlite
// instance on `globalThis` instead, which is what makes register() calling
// from this separate script land in the same instance every route handler
// reads from).
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

  console.log('[run-pglite-server] Running instrumentation.js\'s DB bootstrap (migration + seed) explicitly...');
  const { register } = await import('../instrumentation.js');
  await register();
  console.log('[run-pglite-server] DB bootstrap complete.');

  const server = http.createServer((req, res) => handler(req, res));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, 'localhost', () => resolve());
  });

  console.log(`[run-pglite-server] READY http://localhost:${port}`);
}

main().catch((err) => {
  console.error('[run-pglite-server] FAILED:', err);
  process.exitCode = 1;
});
