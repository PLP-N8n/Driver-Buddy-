/**
 * Post-build verification — catches issues that only show up at runtime.
 * Fails fast with a clear error rather than deploying a broken bundle.
 */
import { readFileSync, statSync } from 'fs';

const BUNDLE = 'dist/assets/index.js';
let failed = false;

const fail = (msg) => { console.error(`\n  ✗ ${msg}`); failed = true; };
const pass = (msg) => console.log(`  ✓ ${msg}`);

// 1. Bundle exists and is a reasonable size
try {
  const { size } = statSync(BUNDLE);
  if (size < 100_000) fail(`Bundle too small (${size} bytes) — build may have failed silently`);
  else pass(`Bundle size OK (${(size / 1024).toFixed(0)} KB)`);
} catch {
  fail(`Bundle not found at ${BUNDLE}`);
  process.exit(1);
}

const bundle = readFileSync(BUNDLE, 'utf-8');

// 2. No unresolved import.meta.env references
if (bundle.includes('import.meta.env')) {
  fail('Bundle contains unresolved import.meta.env — env vars were not injected at build time');
} else {
  pass('No unresolved import.meta.env references');
}

// 3. Key env values are present
const REQUIRED_DEFINES = [
  ['VITE_SYNC_WORKER_URL', 'workers.dev'],
];
for (const [name, fragment] of REQUIRED_DEFINES) {
  if (!bundle.includes(fragment)) {
    fail(`Expected value for ${name} not found in bundle — check your .env file`);
  } else {
    pass(`${name} is baked in`);
  }
}

// 4. React mounted (root render call present)
if (!bundle.includes('createRoot')) {
  fail('createRoot not found — React may not be bundled correctly');
} else {
  pass('React createRoot present');
}

if (failed) {
  console.error('\nBuild verification FAILED — do not deploy this bundle.\n');
  process.exit(1);
}

console.log('\nBuild verification passed.\n');
