// GET    /api/try-on/:jobId  -- current status of a try-on job
// DELETE /api/try-on/:jobId  -- delete the job and its stored image
//
// `:jobId` is the tryon_jobs row id returned by POST /api/try-on.
// Ruling P5, docs/PARITY_REPORT.md §12.

export const runtime = 'nodejs';

import { query } from '../../../../lib/db.js';
import { ok, fail } from '../../../../lib/http.js';
import { withApiHandler } from '../../../../lib/rateLimit.js';
import { requireAuth } from '../../../../lib/auth.js';
import { serializeTryOnJob } from '../../../../lib/serialize.js';
import { signTryOnUrl, deleteTryOnImage } from '../../../../lib/storage.js';

// tryon_jobs.id is a uuid. Postgres raises 22P02 on a malformed uuid literal,
// which would surface as a 500; checking the shape first turns that into the
// 404 it actually is.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The status vocabulary the frozen frontend was written against, mapped from
// the four states tryon_jobs.status is constrained to.
const CLIENT_STATUS = {
  queued: 'processing',
  processing: 'processing',
  completed: 'succeeded',
  failed: 'failed'
};

/**
 * Loads a job, scoped to its owner.
 *
 * Ownership lives in the WHERE clause rather than in a check afterwards: these
 * rows reference photographs of the customer, and a job must be invisible to
 * everyone else. Returning 404 (not 403) for someone else's job also avoids
 * confirming that a given id exists.
 */
async function loadOwnedJob(id, userId) {
  if (!UUID.test(id)) return null;
  const { rows } = await query('select * from tryon_jobs where id = $1 and user_id = $2', [id, userId]);
  return rows[0] || null;
}

export const GET = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { id } = await context.params;
  if (!id) return fail('Job ID is required.', 400);

  const job = await loadOwnedJob(id, user.id);
  if (!job) return fail('Try-on job not found.', 404);

  const status = CLIENT_STATUS[job.status] || 'processing';
  const imageUrl = job.status === 'completed' ? await signTryOnUrl(job.output_image) : '';

  return ok({
    success: true,
    id: job.id,
    jobId: job.id,
    status,
    output: imageUrl || null,
    // job.error holds internal diagnostic text; the customer gets a fixed
    // message instead so Gemini wording and model ids never reach the browser.
    error: job.status === 'failed' ? 'Virtual try-on could not be completed. Please try again.' : '',
    data: { jobId: job.id, status: job.status, imageUrl: imageUrl || null },
    job: serializeTryOnJob(job)
  });
});

export const DELETE = withApiHandler(async (request, context) => {
  const { user, response } = await requireAuth(request);
  if (response) return response;

  const { id } = await context.params;
  if (!id) return fail('Job ID is required.', 400);

  const job = await loadOwnedJob(id, user.id);
  if (!job) return fail('Try-on job not found.', 404);

  // Object first, then row. The other order can orphan the object forever:
  // once the row is gone nothing records the path, and object storage is not
  // reachable from SQL. deleteTryOnImage never throws, so an object that is
  // already missing still lets the row go.
  await deleteTryOnImage(job.output_image);
  await query('delete from tryon_jobs where id = $1 and user_id = $2', [job.id, user.id]);

  return ok({ success: true, message: 'Virtual try-on result deleted.' });
});
