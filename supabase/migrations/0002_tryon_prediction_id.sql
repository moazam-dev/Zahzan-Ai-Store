-- 0002_tryon_prediction_id.sql
--
-- Virtual Try-On moved from a blocking call to Replicate's asynchronous
-- prediction API (docs/PARITY_REPORT.md §12, ruling P4).
--
-- POST /api/try-on now returns immediately with a Replicate prediction id
-- instead of waiting 20-40s for IDM-VTON to finish, and GET /api/try-on/:id
-- polls it. That id is issued by Replicate, is NOT a uuid (it looks like
-- `s7x2k9dqwsrm40cksn8b1234ab`), and so cannot be stored in tryon_jobs.id --
-- which is `uuid primary key default gen_random_uuid()`. This column is the
-- join between our row and Replicate's job.
--
-- Additive and non-destructive: a defaulted, non-null text column plus one
-- index. Existing rows get ''. Safe to run on a live database, and safe to
-- run twice (both statements are guarded).

alter table tryon_jobs
  add column if not exists prediction_id text not null default '';

-- GET /api/try-on/:id looks a job up by the Replicate id the client polls
-- with, scoped to the requesting user. Partial index: rows that never
-- reached Replicate keep the '' default and are never looked up this way.
create index if not exists tryon_jobs_prediction_id_idx
  on tryon_jobs (prediction_id)
  where prediction_id <> '';
