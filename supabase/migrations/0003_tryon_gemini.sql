-- 0003_tryon_gemini.sql
--
-- Virtual Try-On moved from Replicate/IDM-VTON to Google Gemini
-- (docs/PARITY_REPORT.md §12, ruling P5). Three changes:
--
--   1. products.ai_reference_image -- the admin-controlled garment image the
--      backend sends to Gemini.
--   2. tryon_jobs.output_mime      -- so a stored result can be served back
--      with the content type Gemini actually returned.
--   3. purge_expired() extended to delete expired try-on jobs.
--
-- Additive and idempotent; safe on a live database and safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The garment reference the AI actually sees
-- ---------------------------------------------------------------------------
--
-- The frontend is NOT permitted to choose the garment image. It sends a
-- productId and the backend resolves the image here, so a customer cannot
-- point the model at an arbitrary URL. This column lets an admin nominate a
-- photograph chosen for AI fidelity -- garment flat, fully visible,
-- unobstructed -- which is rarely the same shot that works best as a
-- storefront hero image. When it is empty the backend falls back to
-- images[0], so every existing product keeps working with no admin action.
alter table products
  add column if not exists ai_reference_image text not null default '';

-- ---------------------------------------------------------------------------
-- 2. Content type of the stored result
-- ---------------------------------------------------------------------------
alter table tryon_jobs
  add column if not exists output_mime text not null default '';

-- ---------------------------------------------------------------------------
-- 3. Retention
-- ---------------------------------------------------------------------------
--
-- tryon_jobs.expires_at existed from 0001 but was documented there as
-- deliberately NOT one of purge_expired()'s targets, because nothing set it.
-- The Gemini implementation sets it (TRY_ON_RETENTION_HOURS, default 24), so
-- it becomes a purge target now.
--
-- IMPORTANT: this deletes ROWS only. The generated images live in the private
-- `tryon-images` Storage bucket, and SQL cannot reach object storage. Deleting
-- a row without its object would orphan the object forever, so the row is the
-- second half of the operation, not the first: run
-- `node tools/purge-tryon.mjs`, which deletes each expired job's stored
-- objects and only then calls this function. Calling purge_expired() alone is
-- still safe and correct for the four token tables; it simply leaves try-on
-- objects behind.
create or replace function purge_expired()
returns integer
language plpgsql
as $$
declare
  total integer := 0;
  affected integer := 0;
begin
  delete from refresh_tokens where expires_at < now();
  get diagnostics affected = row_count; total := total + affected;

  delete from password_reset_tokens where expires_at < now();
  get diagnostics affected = row_count; total := total + affected;

  delete from email_change_tokens where expires_at < now();
  get diagnostics affected = row_count; total := total + affected;

  delete from verification_tokens where expires_at < now();
  get diagnostics affected = row_count; total := total + affected;

  delete from rate_limits where window_start < now() - interval '2 hours';
  get diagnostics affected = row_count; total := total + affected;

  delete from tryon_jobs where expires_at is not null and expires_at < now();
  get diagnostics affected = row_count; total := total + affected;

  return total;
end;
$$;

-- Purge and the per-user concurrency check both filter on (user_id, status).
create index if not exists tryon_jobs_user_status_idx on tryon_jobs (user_id, status);
create index if not exists tryon_jobs_expires_at_idx on tryon_jobs (expires_at)
  where expires_at is not null;
