import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { transform } from 'lightningcss';
import fs from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const inputPath = path.join(cwd, 'index.css');
const outputPath = path.join(cwd, 'dist', 'assets', 'index.css');

const css = await fs.readFile(inputPath, 'utf8');
const compiler = await compile(css, {
  base: cwd,
  from: inputPath,
  onDependency() {},
});

const scanner = new Scanner({
  sources: [
    { base: cwd, pattern: '**/*.{html,js,jsx,ts,tsx}', negated: false },
    { base: cwd, pattern: 'dist/**', negated: true },
    { base: cwd, pattern: 'node_modules/**', negated: true },
    { base: cwd, pattern: 'public/**', negated: true },
    { base: cwd, pattern: 'scripts/**', negated: true },
  ],
});

const compiledCss = compiler.build(scanner.scan());
const { code } = transform({
  filename: inputPath,
  code: Buffer.from(compiledCss),
  minify: true,
});

await fs.writeFile(outputPath, code);
