// POST /api/stories, GET /api/stories
//
// Statement-by-statement port of server/controllers/storyController.js's
// submitStory and getApprovedStories (Task 12, task-12-brief.md) -- both
// are, and must remain, PERMANENT 501 stubs. GC4 / MIGRATION_PLAN.md sec6.2
// item 11: "Do not implement them." An endpoint that returns 501 today must
// return 501 after the migration, verbatim body included.
//
// The AUTH GATE, however, is real, observable behaviour that sits in front
// of the stub, not part of "the endpoint" being left unimplemented:
// server/routes/storyRoutes.js wires `router.post('/', protect,
// upload.single('image'), submitStory)` -- `protect` genuinely runs first
// and genuinely rejects an unauthenticated POST with 401 before submitStory
// (the always-501 body) is ever reached. `router.get('/', getApprovedStories)`
// has no `protect` at all -- GET is public, always 501, no auth check.
// Reproducing 501 unconditionally on POST (ignoring auth) would be a GC1
// parity violation for the unauthenticated case, not "not implementing" it.
// Confirmed against tools/contract-capture.mjs: every stories-post /
// try-on capture (line 989, 848, 983) supplies `token: ctx.customerToken`
// -- no golden exercises the missing-token 401 path, but the route wiring
// itself is unambiguous.
//
// Shape checked against tools/golden/088-stubs.stories-get.json and
// tools/golden/104-extra2.stories-post.json.

export const runtime = 'nodejs';

import { fail, withErrorHandler } from '../../../lib/http.js';
import { requireAuth } from '../../../lib/auth.js';

function notImplemented() {
  return fail('Endpoint not implemented yet', 501);
}

export const POST = withErrorHandler(async (request) => {
  const { response } = await requireAuth(request);
  if (response) return response;
  return notImplemented();
});

export const GET = withErrorHandler(async () => notImplemented());
