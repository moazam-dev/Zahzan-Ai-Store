# Contract capture harness

This is the safety net for the whole Vite/Express/MongoDB -> Next.js/Supabase
migration (Task 2). It records the exact behaviour of the **current**
Express + MongoDB stack into golden snapshot files under `tools/golden/`, so
every later task that ports a route can be proven behaviour-identical by
running the same journey against the new stack and diffing the result
against this baseline.

## Pieces

- `tools/lib/normalise.mjs` — replaces volatile values (Mongo ObjectIds/UUIDs,
  ISO timestamps, JWTs, order numbers, absolute URLs, `tools/golden` absolute
  paths, and a key-scoped epoch-millisecond rule for one specific field) with
  stable placeholders, so two captures of the same journey diff cleanly even
  though every id, token and timestamp is different each time it runs.
- `tools/seed-contract-db.mjs` — drops and re-seeds the `zahzan_contract_test`
  Mongo database with a fixed admin, two customers, four products and one
  newsletter subscriber. Every seeded value is a literal constant (no
  `Date.now()`, no randomness), and the script refuses to run against any
  database other than `zahzan_contract_test`.
- `tools/contract-capture.mjs` — drives a ~104-step scripted journey over
  HTTP against `--base`, covering all 67 endpoints, and writes one
  normalised JSON file per interaction into `--out`. It can optionally boot
  the target server itself (`--start-cmd`, `--cwd`, `--env ...`) and wait
  for `--health-path` before running, then shuts it down afterwards.
- `tools/contract-diff.mjs` — compares two golden directories file-by-file,
  printing a structural diff and exiting non-zero on any difference or any
  file missing from either side.

## Running capture against the current (old) Express stack

The old server listens on whatever `PORT` it's given, and this repo's real
dev server may already be running on the default port 5000. Capture always
targets an **isolated** port (5099 here) and the **contract-test** database,
never the port or database a human might already be using:

```bash
npm install --prefix server   # first time only in a fresh checkout/worktree

node tools/seed-contract-db.mjs

node tools/contract-capture.mjs \
  --base http://localhost:5099 \
  --out tools/golden \
  --cwd server \
  --start-cmd "node server.js" \
  --env PORT=5099 \
  --env MONGODB_URI=mongodb://localhost:27017/zahzan_contract_test \
  --env RESEND_API_KEY= \
  --env EMAIL_HOST= \
  --env EMAIL_USER=
```

The three empty `--env` overrides (`RESEND_API_KEY`, `EMAIL_HOST`,
`EMAIL_USER`) are required: they force the email dispatcher
(`server/services/emailService.js`) into its "dev log" fallback path so no
real email is ever sent during capture. `CLOUDINARY_*` is deliberately
**not** overridden -- it stays pointed at whatever real Cloudinary account is
configured in `server/.env`, so payment-proof uploads really happen and the
resulting absolute URL is captured and then normalised to `<URL>` (this is
exactly the case the brief's "proof URLs move from Cloudinary to signed
Supabase Storage URLs" note describes). `NODE_ENV` is deliberately left
unset: `server/middleware/errorMiddleware.js` only includes an `err.stack`
field on 500 responses when `NODE_ENV === 'development'` literally, and a
stack trace is exactly the kind of volatile value that would break
reproducibility.

`tools/golden/` is committed to the branch -- it is the regression oracle
every later task's own capture gets diffed against.

## Running capture against the new (ported) stack

Once a later task exposes the equivalent endpoints (Next.js route handlers
against Postgres/Supabase), point the same script at that server instead,
writing to a different output directory so the old baseline is untouched:

```bash
node tools/contract-capture.mjs \
  --base http://localhost:3000 \
  --out tools/golden-next
```

Here `--start-cmd` is simply omitted: whatever starts the new stack (e.g.
`next dev`, or a fixture-backed test server) is expected to already be
running at `--base`. `tools/golden-next/` is gitignored -- it is a
regenerated artifact, not part of the checked-in baseline.

## Diffing old vs new (or verifying reproducibility)

```bash
node tools/contract-diff.mjs tools/golden tools/golden-next
```

Exit code `0` and "No differences" means behaviour-identical. Any other
result prints every differing JSON path with both sides' values, plus any
file present on only one side.

## Verifying the harness is itself reproducible

This is the task's acceptance criterion: run the whole capture twice into
two different directories and diff them. The diff must be empty, because
that's what proves the normaliser is doing its job and this harness can be
trusted as a regression oracle at all.

```bash
node tools/seed-contract-db.mjs
node tools/contract-capture.mjs --base http://localhost:5099 --out tools/golden \
  --cwd server --start-cmd "node server.js" \
  --env PORT=5099 --env MONGODB_URI=mongodb://localhost:27017/zahzan_contract_test \
  --env RESEND_API_KEY= --env EMAIL_HOST= --env EMAIL_USER=

node tools/seed-contract-db.mjs   # reseed -- a fresh journey re-registers the
                                  # same fixed emails, creates orders, etc.,
                                  # so the DB must be reset between runs
node tools/contract-capture.mjs --base http://localhost:5099 --out tools/golden-run2 \
  --cwd server --start-cmd "node server.js" \
  --env PORT=5099 --env MONGODB_URI=mongodb://localhost:27017/zahzan_contract_test \
  --env RESEND_API_KEY= --env EMAIL_HOST= --env EMAIL_USER=

node tools/contract-diff.mjs tools/golden tools/golden-run2
rm -rf tools/golden-run2   # scratch only; gitignored, never committed
```

## A normalisation rule beyond the brief's literal list

`tools/lib/normalise.mjs` also strips a raw 13-digit epoch-millisecond
timestamp (`EPOCH_MS_RE`), in addition to the six categories the brief
lists verbatim. This exists because `server/utils/cloudinary.js` builds its
Cloudinary `public_id` as `` `payment_${orderId}_${Date.now()}` ``, and that
raw value -- not an ISO-8601 string, not a URL -- comes back to the client
as `payment.proofPublicId`. Without normalising it, the double-run
reproducibility check could never pass.

**This rule is key-scoped, not global** (fixed in fix round 1, Finding 2):
it only fires when `normalise()` is walking the `proofPublicId` field
specifically (see `EPOCH_SCOPED_KEYS` in `tools/lib/normalise.mjs`), not for
every 13-digit string leaf anywhere in a captured body. A global version
would have been unsafe to reuse in Task 15 against the ported stack: a
serialized Postgres bigint id, or a bank `transactionReference`, can easily
be 13 digits starting with `1`, and silently collapsing that to `<TS>` would
mask a genuine parity break instead of catching one.
`normaliseString()` (used directly for the recorded `path` field and for
`normaliseText`'s raw CSV/HTML bodies) never applies this rule at all, since
neither of those has a JSON key to scope by and neither ever carries a
`proofPublicId`-shaped value.

The capture harness also normalises the recorded **`path`** field itself
(not just request/response bodies), because a handful of journey steps
route through a resource id minted during that run (e.g.
`PATCH /api/orders/<id>/cancel`) -- left raw, that id would differ between
the two runs the acceptance check diffs against each other, and would also
make cross-stack (`tools/golden` vs `tools/golden-next`) comparison noisy
once ids are shaped completely differently (Postgres UUIDs instead of Mongo
ObjectIds).

## One-off random values that don't fit any normaliser category: `redact`

`GET /api/users/me/confirm-email-change`'s success path needs the real
`crypto.randomBytes(32)` email-change token as a query parameter -- the API
never returns this token to any client (by design, it only ever reaches the
user by email), so the capture script reads it directly out of Mongo
(`fetchEmailChangeToken` in `tools/contract-capture.mjs`) the same way
`tools/seed-contract-db.mjs` already does for the newsletter unsubscribe
token, except this one is genuinely random per run rather than seeded.
Rather than broadening `tools/lib/normalise.mjs` again right after
narrowing it (Finding 2), `Recorder.call()` takes an optional `redact: [...]`
array of raw strings to blank out of the recorded path/body as `<TOKEN>`,
applied as a plain string replace after normalisation. This keeps the
shared normaliser's scope exactly as fixed, while still keeping this one
capture reproducible.

## Endpoint coverage: 67/67

The Task 2 brief's journey list, followed literally, reached 56 of the 67
endpoints -- it names a specific, ordered sequence of steps and several
endpoints (Google/Facebook social auth, the email-change flow, the plain
`productController.createProduct`, three admin get-by-id routes, the `POST`
newsletter-unsubscribe variant, and two more 501 stubs beyond the two the
brief names) simply weren't in that list. The controller ruling on this
(fix round 1, Finding 1): the *binding spec*, `MIGRATION_PLAN.md` §3.1, says
the journey must cover these steps "at minimum" -- the brief's list is a
floor, not a ceiling, so extending it to full coverage is spec-compliant,
not scope creep. That extension is now done: all 11 previously-missing
endpoints are captured (interactions `091`-`104`, appended after the
original 90 so that baseline stayed untouched and stable while this was
being fixed). See `tools/contract-capture.mjs`'s "Coverage extension" block
for the calls themselves.

One of the eleven, `GET /api/users/me/confirm-email-change`'s success
branch, needs a token the API never returns to any client; it's read back
live from Mongo (see `fetchEmailChangeToken` / the `redact` note above). If
capture ever runs without `--env MONGODB_URI=...` set, that one branch is
skipped with a clear console warning and only the 400 branch is captured --
the endpoint itself is still exercised, just not both of its branches.

## A deliberate interpretation: "unsubscribe by token"

`POST /api/newsletter/subscribe`'s success response never returns the
subscriber's `unsubscribeToken` (`server/controllers/newsletterController.js`
only ever includes `id`, `email`, `status`, `subscribedAt` in the JSON, and
the `unsubscribeToken` a fresh subscription generates is `crypto.
randomBytes(32)` -- by design, it only ever reaches the subscriber by email,
and email sending is disabled during capture). So the journey's "subscribe
-> subscribe again -> unsubscribe by token" step cannot unsubscribe the
address it just subscribed; instead it calls
`GET /api/newsletter/unsubscribe/:token` against the **seeded** subscriber,
whose token `tools/seed-contract-db.mjs` fixes at a known constant
(`SEED_NEWSLETTER_TOKEN`, 64 literal hex characters). This is captured as
interaction `053-newsletter.unsubscribe-by-token.json`.

## Other things worth knowing when re-running this

- The apparently-live Express dev server example URLs mentioned elsewhere in
  the migration docs run on port 5000. Never point `--base` (or
  `--start-cmd`'s `PORT` env override) at 5000 for capture -- that is a real
  developer's server pointed at the real `zahzan_db`, and binding it again
  fails with `EADDRINUSE` in any case. Capture always uses port 5099 and
  `zahzan_contract_test`.
- Rate limiting (`server/middleware/rateLimiter.js`,
  `server/server.js`'s `apiLimiter`) is in-memory per Express process. Since
  `contract-capture.mjs --start-cmd` starts a brand new process for every
  invocation, the limiter's counters reset every run; the ~104-step journey
  is nowhere close to any of the configured limits (200 general / 10 login /
  10 register / 5 password-reset / 15 newsletter, all per 15-60 minutes)
  regardless.
