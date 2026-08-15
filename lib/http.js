// lib/http.js
//
// The Next.js Route Handler equivalent of the response half of Express's
// middleware stack: `res.json(...)` with a status (`ok`), the
// `{ success: false, message }` envelope (`fail`), errorMiddleware.js's
// `notFound` + `errorHandler` (`notFound`, `withErrorHandler`).
//
// Task 5 brief.

import { NextResponse } from 'next/server';

/**
 * `res.status(status).json(data)` equivalent. `data` is whatever envelope
 * the caller already built (e.g. `{ success: true, product }`) -- this
 * does not add or assume a `success` key, since some success responses
 * (server/controllers/newsletterController.js's `isAlreadySubscribed`
 * branch, for one) sit at a non-201 status alongside other fields this
 * function has no business inventing.
 */
export function ok(data, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * The `{ success: false, message }` envelope every failure branch across
 * the 67 endpoints uses.
 */
export function fail(message, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

/**
 * server/middleware/errorMiddleware.js's `notFound`: `new Error(\`Not
 * Found - ${req.originalUrl}\`)`, status 404. In Express this sets
 * res.statusCode and hands off to errorHandler; here it's the direct
 * terminal response a route handler (or the App Router's catch-all) can
 * return immediately.
 */
export function notFound(path) {
  return fail(`Not Found - ${path}`, 404);
}

/**
 * Reproduces errorMiddleware.js's `errorHandler`: catches whatever a
 * wrapped handler throws and turns it into `{ success: false, message }`,
 * plus a `stack` field only when `NODE_ENV === 'development'` -- exactly
 * the condition the original checks, and exactly why Task 2's capture
 * harness deliberately left NODE_ENV unset when capturing the old stack
 * (a stack trace is not a byte-stable value).
 *
 * A thrown error's `.statusCode` is honoured if present (mirrors
 * errorHandler's `res.statusCode === 200 ? 500 : res.statusCode`, i.e.
 * "use whatever status was already implied, default to 500"); otherwise
 * defaults to 500, matching `res.statusCode === 200` case.
 */
export function withErrorHandler(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      const message = err?.message || 'Internal Server Error';
      const status = err?.statusCode || 500;
      const body = { success: false, message };
      if (process.env.NODE_ENV === 'development') {
        body.stack = err?.stack;
      }
      return NextResponse.json(body, { status });
    }
  };
}
