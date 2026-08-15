import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Hardcoded from src/App.jsx's original <Routes> table (that file is deleted by
// this same task, so deriving this list by parsing it would silently pass
// against nothing -- ruling C2). 14 routes -> 14 app/**/page.jsx files. `/admin`
// and `/admin/login` are two distinct routes that both render AdminLogin, so
// they still need two distinct page.jsx files under the App Router's
// file-per-URL convention.
const EXPECTED_PAGES = [
  'app/page.jsx',
  'app/shop/page.jsx',
  'app/product/[id]/page.jsx',
  'app/collections/page.jsx',
  'app/account/page.jsx',
  'app/admin/page.jsx',
  'app/admin/login/page.jsx',
  'app/admin/dashboard/page.jsx',
  'app/admin/orders/page.jsx',
  'app/admin/payments/page.jsx',
  'app/admin/products/page.jsx',
  'app/admin/customers/page.jsx',
  'app/admin/newsletter/page.jsx',
  'app/admin/audit-logs/page.jsx'
];

// Directories that hold client-side UI code moved verbatim from src/. `views/`
// holds the former src/pages/ tree (see task-7-report.md for why it isn't
// nested under components/ or named `pages/`).
const UI_DIRS = ['app', 'components', 'context', 'views'];

function walk(dir, exts = ['.js', '.jsx']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      results.push(...walk(full, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

const uiFiles = () => UI_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

describe('Next.js app shell (Task 7)', () => {
  it('has an app/**/page.jsx for every route in the original React Router table', () => {
    for (const rel of EXPECTED_PAGES) {
      expect(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`).toBe(true);
    }
  });

  it('has exactly the expected number of page.jsx files under app/, no more no less', () => {
    const pageFiles = walk(path.join(ROOT, 'app')).filter((f) => path.basename(f) === 'page.jsx');
    expect(pageFiles.length).toBe(EXPECTED_PAGES.length);
  });

  it('has no file under components/, context/, views/ or app/ importing from react-router-dom', () => {
    const offenders = uiFiles().filter((file) => /react-router-dom/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it("has no file importing from '../assets' or 'src/assets'", () => {
    const assetImportRe = /from\s+['"](\.\.\/)*(src\/)?assets\//;
    const offenders = uiFiles().filter((file) => assetImportRe.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it("every component/context/view file that uses a hook begins with 'use client'", () => {
    const hookCallRe = /\buse[A-Z0-9]\w*\s*\(/;
    const offenders = ['components', 'context', 'views']
      .flatMap((d) => walk(path.join(ROOT, d)))
      .filter((file) => {
        const content = fs.readFileSync(file, 'utf8');
        return hookCallRe.test(content) && !content.trimStart().startsWith("'use client'");
      });
    expect(offenders).toEqual([]);
  });

  it('package.json no longer depends on react-router-dom or the Vite toolchain', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(allDeps['react-router-dom']).toBeUndefined();
    expect(allDeps.vite).toBeUndefined();
    expect(allDeps['@vitejs/plugin-react']).toBeUndefined();
    expect(allDeps['@tailwindcss/vite']).toBeUndefined();
  });

  it('the old Vite entry points are gone', () => {
    for (const rel of ['vite.config.js', 'index.html', 'src/main.jsx', 'src/App.jsx', 'src']) {
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} should not exist`).toBe(false);
    }
  });
});
