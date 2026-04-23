import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const envVars = { MODE: 'production', PROD: true, DEV: false, SSR: false };
const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));

for (const envFile of ['.env', '.env.local']) {
  try {
    const envContent = readFileSync(envFile, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) envVars[match[1].trim()] = match[2].trim();
    }
  } catch {
    // File not present, skip.
  }
}

if (!envVars.VITE_ENV) {
  envVars.VITE_ENV = 'production';
}

if (!envVars.VITE_APP_VERSION) {
  envVars.VITE_APP_VERSION = packageJson.version;
}

// These are build-time secrets — never embed in frontend bundle
const frontendEnv = Object.fromEntries(
  Object.entries(envVars).filter(([k]) => k === 'MODE' || k === 'PROD' || k === 'DEV' || k === 'SSR' || k.startsWith('VITE_'))
);

const envJson = JSON.stringify(frontendEnv);
const args = [
  'index.tsx',
  '--bundle',
  '--format=esm',
  '--platform=browser',
  '--target=es2020',
  '--minify',
  '--splitting',
  '--outdir=dist/assets',
  '--entry-names=[name]',
  '--chunk-names=chunks/[name]-[hash]',
  '--metafile=dist/assets/meta.json',
  '--loader:.tsx=tsx',
  '--loader:.ts=ts',
  '--loader:.css=empty',
  '--define:import.meta.env=globalThis.__env__',
  `--banner:js=globalThis.__env__=${envJson};`,
];

for (const [key, value] of Object.entries(frontendEnv)) {
  args.push(`--define:import.meta.env.${key}=${JSON.stringify(value)}`);
}

const sentryAuthToken = envVars.SENTRY_AUTH_TOKEN;
if (sentryAuthToken) {
  args.push('--sourcemap=external');
}

const esbuildPath = path.join(process.cwd(), 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');

execFileSync(esbuildPath, args, { stdio: 'inherit' });

// Upload source maps to Sentry then delete them from dist so they aren't deployed
if (sentryAuthToken) {
  const sentryCliPath = path.join(process.cwd(), 'node_modules', '@sentry', 'cli-win32-x64', 'bin', 'sentry-cli.exe');
  const version = envVars.VITE_APP_VERSION || packageJson.version;
  const org = envVars.SENTRY_ORG || 'rudra-digital';
  const project = envVars.SENTRY_PROJECT || 'drivertax';

  console.log(`Uploading source maps to Sentry (release ${version})...`);
  try {
    execFileSync(sentryCliPath, [
      'releases', 'files', version, 'upload-sourcemaps',
      'dist/assets',
      '--rewrite',
      '--url-prefix', '~/assets',
    ], {
      stdio: 'inherit',
      env: { ...process.env, SENTRY_AUTH_TOKEN: sentryAuthToken, SENTRY_ORG: org, SENTRY_PROJECT: project },
    });
    console.log('Source maps uploaded to Sentry.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Sentry source map upload failed; continuing build. ${message}`);
  } finally {
    // Delete .map files so they don't ship to CF Pages.
    for (const dir of ['dist/assets', 'dist/assets/chunks']) {
      try {
        for (const f of readdirSync(dir)) {
          if (f.endsWith('.map')) unlinkSync(path.join(dir, f));
        }
      } catch {
        // Directory may not exist.
      }
    }
  }
}
