import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists, readJson, walk, writeJson } from './utils.js';

export async function transformCraToVite(root) {
  const changes = [];
  const packageFile = path.join(root, 'package.json');
  const pkg = await readJson(packageFile);
  pkg.scripts = { ...(pkg.scripts || {}), dev: 'vite', start: 'vite', build: 'vite build', preview: 'vite preview' };
  if (pkg.scripts.eject) delete pkg.scripts.eject;
  for (const section of ['dependencies', 'devDependencies']) if (pkg[section]?.['react-scripts']) delete pkg[section]['react-scripts'];
  pkg.devDependencies = { ...(pkg.devDependencies || {}), vite: pkg.devDependencies?.vite || '^5.4.0', '@vitejs/plugin-react': pkg.devDependencies?.['@vitejs/plugin-react'] || '^4.3.0' };
  const migratesTests = pkg.scripts?.test?.includes('react-scripts');
  if (migratesTests) {
    pkg.scripts.test = 'vitest run';
    pkg.devDependencies.vitest = pkg.devDependencies.vitest || '^2.1.0';
    pkg.devDependencies.jsdom = pkg.devDependencies.jsdom || '^25.0.0';
  }
  await writeJson(packageFile, pkg);
  changes.push('package.json');

  const publicHtml = path.join(root, 'public', 'index.html');
  let html = await exists(publicHtml) ? await fs.readFile(publicHtml, 'utf8') : '<!doctype html><html><head><meta charset="UTF-8" /></head><body><div id="root"></div></body></html>';
  html = html.replaceAll('%PUBLIC_URL%/', '/').replaceAll('%PUBLIC_URL%', '');
  if (!/type=["']module["']/.test(html)) html = html.replace('</body>', '  <script type="module" src="/__ENTRY__"></script>\n</body>');
  const entry = await findEntry(root);
  html = html.replace('/__ENTRY__', `/${entry}`);
  await fs.writeFile(path.join(root, 'index.html'), html);
  changes.push('index.html');
  if (await exists(publicHtml)) { await fs.rm(publicHtml); changes.push('public/index.html (removed)'); }

  for (const file of await walk(root)) {
    if (!/\.[jt]sx?$/.test(file)) continue;
    const before = await fs.readFile(file, 'utf8');
    const after = before
      .replace(/process\.env\.REACT_APP_([A-Z0-9_]+)/g, 'import.meta.env.VITE_$1')
      .replace(/process\.env\.PUBLIC_URL/g, 'import.meta.env.BASE_URL')
      .replace(/process\.env\.NODE_ENV/g, 'import.meta.env.MODE');
    if (after !== before) { await fs.writeFile(file, after); changes.push(path.relative(root, file)); }
  }
  for (const name of ['.env', '.env.local', '.env.development', '.env.production', '.env.test']) {
    const file = path.join(root, name);
    if (!(await exists(file))) continue;
    const before = await fs.readFile(file, 'utf8');
    const after = before.replace(/(^|\n)(\s*)REACT_APP_([A-Z0-9_]+)(\s*=)/g, '$1$2VITE_$3$4');
    if (after !== before) { await fs.writeFile(file, after); changes.push(name); }
  }
  const setupFile = await exists(path.join(root, 'src', 'setupTests.js')) ? "'./src/setupTests.js'" : await exists(path.join(root, 'src', 'setupTests.ts')) ? "'./src/setupTests.ts'" : null;
  const testConfig = migratesTests ? `,\n  test: { environment: 'jsdom', globals: true${setupFile ? `, setupFiles: [${setupFile}]` : ''} }` : '';
  const config = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()]${testConfig} });\n`;
  await fs.writeFile(path.join(root, 'vite.config.js'), config);
  changes.push('vite.config.js');
  return [...new Set(changes)].sort();
}

async function findEntry(root) {
  for (const entry of ['src/main.jsx', 'src/main.tsx', 'src/index.jsx', 'src/index.js', 'src/index.tsx', 'src/index.ts']) if (await exists(path.join(root, entry))) return entry;
  throw new Error('No supported React entrypoint found under src/');
}
