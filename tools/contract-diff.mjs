#!/usr/bin/env node
// tools/contract-diff.mjs
//
// Compares two golden directories (each populated by tools/contract-capture.mjs)
// and prints a per-file structural diff. Exits non-zero when any file
// differs or is missing on either side (Task 2 brief).
//
// Usage:
//   node tools/contract-diff.mjs <dirA> <dirB>

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

function usage() {
  console.error('Usage: node tools/contract-diff.mjs <dirA> <dirB>');
  process.exit(2);
}

async function listJsonFiles(dir) {
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith('.json')).sort();
}

/**
 * Recursively diffs two JSON-compatible values, collecting human-readable
 * differences as { path, a, b } records. `path` is a JSON-pointer-ish
 * string like `$.responseBody.order.items[0].quantity`.
 */
function diffValue(a, b, pointer, out) {
  const aIsObj = a && typeof a === 'object';
  const bIsObj = b && typeof b === 'object';

  if (aIsObj !== bIsObj || Array.isArray(a) !== Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ path: pointer, a, b });
    }
    return;
  }

  if (Array.isArray(a)) {
    const len = Math.max(a.length, b.length);
    if (a.length !== b.length) {
      out.push({ path: `${pointer}.length`, a: a.length, b: b.length });
    }
    for (let i = 0; i < len; i++) {
      diffValue(a[i], b[i], `${pointer}[${i}]`, out);
    }
    return;
  }

  if (aIsObj) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const allKeys = new Set([...keysA, ...keysB]);
    for (const key of allKeys) {
      const inA = Object.prototype.hasOwnProperty.call(a, key);
      const inB = Object.prototype.hasOwnProperty.call(b, key);
      if (!inA) {
        out.push({ path: `${pointer}.${key}`, a: '<missing key>', b: b[key] });
      } else if (!inB) {
        out.push({ path: `${pointer}.${key}`, a: a[key], b: '<missing key>' });
      } else {
        diffValue(a[key], b[key], `${pointer}.${key}`, out);
      }
    }
    // key order check (structure preservation)
    if (keysA.join(',') !== keysB.join(',') && keysA.length === keysB.length) {
      out.push({ path: `${pointer}<key order>`, a: keysA.join(','), b: keysB.join(',') });
    }
    return;
  }

  if (a !== b) {
    out.push({ path: pointer, a, b });
  }
}

function diffText(a, b) {
  if (a === b) return [];
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const len = Math.max(linesA.length, linesB.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    if (linesA[i] !== linesB[i]) {
      out.push({ path: `line ${i + 1}`, a: linesA[i], b: linesB[i] });
    }
  }
  return out;
}

async function diffFile(fileA, fileB) {
  const rawA = await readFile(fileA, 'utf8');
  const rawB = await readFile(fileB, 'utf8');

  let jsonA, jsonB;
  try {
    jsonA = JSON.parse(rawA);
    jsonB = JSON.parse(rawB);
  } catch {
    return diffText(rawA, rawB);
  }

  const out = [];
  diffValue(jsonA, jsonB, '$', out);
  return out;
}

async function main() {
  const [dirA, dirB] = process.argv.slice(2);
  if (!dirA || !dirB) usage();

  const filesA = await listJsonFiles(dirA);
  const filesB = await listJsonFiles(dirB);
  const setA = new Set(filesA);
  const setB = new Set(filesB);

  let hasDiff = false;

  const onlyInA = filesA.filter((f) => !setB.has(f));
  const onlyInB = filesB.filter((f) => !setA.has(f));

  for (const f of onlyInA) {
    console.log(`MISSING in ${dirB}: ${f}`);
    hasDiff = true;
  }
  for (const f of onlyInB) {
    console.log(`MISSING in ${dirA}: ${f}`);
    hasDiff = true;
  }

  const common = filesA.filter((f) => setB.has(f)).sort();
  for (const f of common) {
    const diffs = await diffFile(path.join(dirA, f), path.join(dirB, f));
    if (diffs.length > 0) {
      hasDiff = true;
      console.log(`\nDIFF in ${f}:`);
      for (const d of diffs) {
        console.log(`  ${d.path}`);
        console.log(`    A: ${JSON.stringify(d.a)}`);
        console.log(`    B: ${JSON.stringify(d.b)}`);
      }
    }
  }

  if (!hasDiff) {
    console.log(`No differences. ${common.length} files compared (${dirA} vs ${dirB}).`);
    process.exit(0);
  } else {
    console.log(`\nDifferences found between ${dirA} and ${dirB}.`);
    process.exit(1);
  }
}

main();
