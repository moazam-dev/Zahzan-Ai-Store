/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Task 15 (parity verification) addition. @electric-sql/pglite is the
  // WASM-loading test/local-verification Postgres driver lib/db.js selects
  // via ZAHZAN_DB_DRIVER=pglite (AR3/AR4) -- it is never imported at all on
  // the real production path (SUPABASE_DB_URL + the `pg` driver). Without
  // this, Next's server bundler (Turbopack) rewrites the dynamic
  // `import('@electric-sql/pglite')` inside lib/db.js's getPglite() enough
  // to break its WASM instantiation at request time ("h.instantiateWasm is
  // not a function") -- confirmed empirically the app's route handlers are
  // otherwise unreachable against PGlite when served via a built
  // (`next build`) app, as opposed to a raw `node` script directly
  // importing lib/db.js, which never goes through this bundling at all.
  // Marking the package "external" tells the server bundle to `require()`/
  // `import()` it at runtime unchanged instead of bundling it, which is
  // exactly what an emscripten/WASM-loading package needs. Build-time
  // bundling configuration only -- zero effect on any HTTP response, byte
  // for byte, on either driver.
  serverExternalPackages: ['@electric-sql/pglite'],
  async headers() {
    // Reproduces the headers the old Express server sent via `helmet()` with
    // `crossOriginResourcePolicy: { policy: 'cross-origin' }` (see server/server.js).
    // CORS and `/uploads` static-serving are dropped intentionally — same-origin now,
    // and there is no more `/uploads` filesystem to serve (MIGRATION_PLAN.md §8.5).
    //
    // Scoped to /api/:path* only (not /:path*): in the original app, helmet() was
    // mounted on the Express server, which never served the frontend HTML — no
    // express.static for the SPA, no catch-all route (verified in server/server.js).
    // The frontend was served by Vite/static hosting, which sent no CSP. Applying
    // this header block to the HTML document would (a) be a scope expansion beyond
    // the original's actual behaviour, and (b) block the inline <script> tags the
    // App Router uses for hydration, since script-src 'self' has no 'unsafe-inline',
    // nonce, or hash. Restricting to /api/:path* reproduces the original faithfully.
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests"
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Origin-Agent-Cluster', value: '?1' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'X-Download-Options', value: 'noopen' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'X-XSS-Protection', value: '0' }
        ]
      }
    ]
  }
}

export default nextConfig
