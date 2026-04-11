import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const envVars = { MODE: 'production', PROD: true, DEV: false, SSR: false };
const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));

try {
  const envContent = readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim();
  }
} catch {
  // No .env file, use defaults only.
}

if (!envVars.VITE_ENV) {
  envVars.VITE_ENV = 'production';
}

if (!envVars.VITE_APP_VERSION) {
  envVars.VITE_APP_VERSION = packageJson.version;
}

const envJson = JSON.stringify(envVars);
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

for (const [key, value] of Object.entries(envVars)) {
  args.push(`--define:import.meta.env.${key}=${JSON.stringify(value)}`);
}

const esbuildPath = path.join(process.cwd(), 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');

execFileSync(esbuildPath, args, { stdio: 'inherit' });
