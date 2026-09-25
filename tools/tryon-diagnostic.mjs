// Virtual Try-On end-to-end diagnostic.
//
//   node tools/tryon-diagnostic.mjs [--product <uuid>] [--photo <path>] [--keep]
//
// Walks the whole path with REAL services -- real Gemini, real Supabase, real
// Storage -- and reports each step. This is the script the backend spec asks
// for; it exists so a failure is diagnosed here rather than by a customer.
//
// It NEVER prints the API key, and never prints image bytes or base64.
//
// --keep leaves the generated image in the bucket and the job row in place;
// by default both are cleaned up so running this does not accumulate data.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// .env.local first: this is a plain node script, so Next.js's own env loading
// does not apply.
async function loadEnvLocal() {
  try {
    const raw = await readFile(path.resolve('.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, key, value] = m;
      if (!(key in process.env)) process.env[key] = value.trim();
    }
  } catch {
    /* absent is fine -- variables may come from the real environment */
  }
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const KEEP = args.includes('--keep');

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => console.log(`  ✗ ${m}`);
const step = (n, m) => console.log(`\n[${n}] ${m}`);

let failures = 0;
function check(condition, okMessage, failMessage) {
  if (condition) pass(okMessage);
  else {
    fail(failMessage);
    failures += 1;
  }
  return condition;
}

await loadEnvLocal();

console.log('ZAHZAN Virtual Try-On diagnostic');
console.log('='.repeat(60));

// ---------------------------------------------------------------------------
step(1, 'Gemini API key');
const key = (process.env.GEMINI_API_KEY || '').trim();
if (
  !check(
    key && !key.includes('your_') && !key.includes('xxxx'),
    `GEMINI_API_KEY present (${key ? `${key.length} chars, starts "${key.slice(0, 4)}…"` : 'absent'})`,
    'GEMINI_API_KEY is missing or still a placeholder. Get one at https://aistudio.google.com/apikey and put it in .env.local'
  )
) {
  console.log('\nCannot continue without a key.');
  process.exit(1);
}

const { listAvailableModels, generateTryOnImage, fetchImageBytes, getConfiguredModel } =
  await import('../lib/gemini.js');

// ---------------------------------------------------------------------------
step(2, 'Gemini reachability and model availability');
const wanted = getConfiguredModel();
console.log(`  configured model: ${wanted}`);

let models = [];
try {
  models = await listAvailableModels();
  pass(`API reachable -- ${models.length} models visible to this key`);
} catch (err) {
  fail(`Could not list models: ${err.message}`);
  console.log('\nThis usually means the key is invalid, or its project has no API access enabled.');
  process.exit(1);
}

const exact = models.find((m) => m.name === wanted);
if (!check(Boolean(exact), `model "${wanted}" exists`, `model "${wanted}" is NOT available to this key`)) {
  const imageish = models.filter((m) => /image|flash|nano|banana/i.test(m.name) && m.supportsGenerate);
  console.log('\n  Candidates this key CAN use:');
  for (const m of imageish.slice(0, 25)) console.log(`    - ${m.name}`);
  if (imageish.length === 0) {
    for (const m of models.slice(0, 25)) console.log(`    - ${m.name}`);
  }
  console.log('\n  Set GEMINI_IMAGE_MODEL in .env.local to one of the above and re-run.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
step(3, 'Database and product');
process.env.ZAHZAN_DB_DRIVER = process.env.ZAHZAN_DB_DRIVER || '';
const { query, close } = await import('../lib/db.js');

let product;
try {
  const wantedId = flag('product');
  const { rows } = wantedId
    ? await query('select * from products where id = $1', [wantedId])
    : await query('select * from products where is_active = true order by created_at limit 1');
  product = rows[0];
} catch (err) {
  fail(`Database unreachable: ${err.message}`);
  process.exit(1);
}

if (!check(Boolean(product), '', 'No active product found. Seed a product first.')) process.exit(1);
pass(`product "${product.name}" (${product.id})`);
check(product.is_active, 'product is active', 'product is INACTIVE');

// ---------------------------------------------------------------------------
step(4, 'Garment reference image');
const garmentUrl = product.ai_reference_image || product.images?.[0] || product.image || '';
if (!check(Boolean(garmentUrl), `resolved: ${garmentUrl}`, 'product has no usable image')) process.exit(1);
console.log(
  `  source: ${product.ai_reference_image ? 'ai_reference_image (admin-nominated)' : 'images[0] (fallback)'}`
);

let garment;
try {
  garment = await fetchImageBytes(garmentUrl);
  pass(`loaded ${garment.buffer.length.toLocaleString()} bytes, ${garment.mime}`);
} catch (err) {
  fail(`could not load garment image: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
step(5, 'Customer photograph');
const photoPath = flag('photo');
let person;
if (photoPath) {
  const buffer = await readFile(path.resolve(photoPath));
  const ext = path.extname(photoPath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const { validateCustomerImage } = await import('../lib/imageValidation.js');
  const v = validateCustomerImage(`data:${mime};base64,${buffer.toString('base64')}`);
  if (!check(v.ok, `accepted ${buffer.length.toLocaleString()} bytes, ${mime}`, `rejected: ${v.message}`)) {
    process.exit(1);
  }
  person = { buffer: v.buffer, mime: v.mime };
} else {
  console.log('  no --photo given; using the product image as a stand-in person.');
  console.log('  (pass --photo <file.jpg> with a real full-body photograph for a meaningful result)');
  person = garment;
}

// ---------------------------------------------------------------------------
step(6, 'Gemini generation');
console.log('  calling Gemini -- this can take 10-60s...');
const started = Date.now();
let generated;
try {
  generated = await generateTryOnImage({
    personImage: person,
    garmentImage: garment,
    garmentDescription: [product.name, product.fabric].filter(Boolean).join(' - ')
  });
  pass(
    `received ${generated.buffer.length.toLocaleString()} bytes, ${generated.mime}, in ${(
      (Date.now() - started) / 1000
    ).toFixed(1)}s`
  );
} catch (err) {
  fail(`${err.code || 'error'}: ${err.message}`);
  await close();
  process.exit(1);
}

// ---------------------------------------------------------------------------
step(7, 'Storage');
const { uploadTryOnImage, signTryOnUrl, deleteTryOnImage } = await import('../lib/storage.js');
let stored;
try {
  stored = await uploadTryOnImage(generated.buffer, generated.mime, 'output');
  pass(`uploaded to tryon-images: ${stored.path}`);
} catch (err) {
  fail(`upload failed: ${err.message}`);
  console.log("  Does the private 'tryon-images' bucket exist in Supabase Storage?");
  await close();
  process.exit(1);
}

let signed = '';
try {
  signed = await signTryOnUrl(stored.path);
  pass(`signed URL generated (${signed.slice(0, 60)}…)`);
} catch (err) {
  fail(`signing failed: ${err.message}`);
}

// Always write a local copy so the result can actually be LOOKED at -- the
// whole question is whether the person is wearing the garment.
const outFile = path.resolve(`tryon-result.${generated.mime === 'image/jpeg' ? 'jpg' : 'png'}`);
await writeFile(outFile, generated.buffer);
pass(`saved a local copy for inspection: ${outFile}`);

// ---------------------------------------------------------------------------
step(8, 'TryOnJob row');
let jobId = null;
try {
  const hours = Number.parseInt(process.env.TRY_ON_RETENTION_HOURS ?? '24', 10) || 24;
  const { rows } = await query(
    `insert into tryon_jobs (user_id, product_id, color, input_image, status, output_image, output_mime, completed_at, expires_at)
     select id, $1, $2, '[diagnostic]', 'completed', $3, $4, now(), now() + ($5 || ' hours')::interval
       from users order by created_at limit 1
     returning *`,
    [product.id, product.color || '', stored.path, generated.mime, String(hours)]
  );
  jobId = rows[0]?.id ?? null;
  check(Boolean(jobId), `job ${jobId} written, status=completed, expires in ${hours}h`, 'no user exists to own a job row');
} catch (err) {
  fail(`could not write job row: ${err.message}`);
}

// ---------------------------------------------------------------------------
step(9, 'Cleanup');
if (KEEP) {
  console.log('  --keep given; leaving the object and job row in place.');
} else {
  const removed = await deleteTryOnImage(stored.path);
  check(removed, 'stored object deleted', 'stored object could not be deleted');
  if (jobId) {
    await query('delete from tryon_jobs where id = $1', [jobId]);
    pass('job row deleted');
  }
}

await close();

console.log(`\n${'='.repeat(60)}`);
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
console.log(`Open ${outFile} and confirm the person is wearing the ZAHZAN garment.`);
process.exit(failures === 0 ? 0 : 1);
