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
    const after = before.replace(/process\.env\.REACT_APP_([A-Z0-9_]+)/g, 'import.meta.env.VITE_$1');
    if (after !== before) { await fs.writeFile(file, after); changes.push(path.relative(root, file)); }
  }
  const config = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n`;
  await fs.writeFile(path.join(root, 'vite.config.js'), config);
  changes.push('vite.config.js');
  return [...new Set(changes)].sort();
}

async function findEntry(root) {
  for (const entry of ['src/main.jsx', 'src/main.tsx', 'src/index.jsx', 'src/index.js', 'src/index.tsx', 'src/index.ts']) if (await exists(path.join(root, entry))) return entry;
  throw new Error('No supported React entrypoint found under src/');
}
