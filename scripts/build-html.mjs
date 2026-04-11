import fs from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const sourcePath = path.join(cwd, 'index.html');
const outputPath = path.join(cwd, 'dist', 'index.html');

const sourceHtml = await fs.readFile(sourcePath, 'utf8');
const withStylesheet = sourceHtml.replace(
  '</head>',
  '    <link rel="stylesheet" href="/assets/index.css" />\n  </head>'
);
const outputHtml = withStylesheet.replace(
  /<script type="module" src="\/index\.tsx"><\/script>/,
  '    <script type="module" src="/assets/index.js"></script>'
);

await fs.writeFile(outputPath, outputHtml);
