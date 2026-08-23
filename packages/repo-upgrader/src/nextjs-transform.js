import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists, readJson, walk, writeJson } from './utils.js';

export async function transformReactToNext(root) {
  const appSource = await findApp(root);
  const changes = [];
  const packageFile = path.join(root, 'package.json');
  const pkg = await readJson(packageFile);
  pkg.scripts = { ...(pkg.scripts || {}), dev: 'next dev', start: 'next start', build: 'next build' };
  if (pkg.scripts.eject) delete pkg.scripts.eject;
  for (const section of ['dependencies', 'devDependencies']) {
    for (const dependency of ['react-scripts', 'vite', '@vitejs/plugin-react']) if (pkg[section]?.[dependency]) delete pkg[section][dependency];
  }
  pkg.dependencies = { ...(pkg.dependencies || {}), next: '^16.0.0', react: '^19.2.0', 'react-dom': '^19.2.0' };
  pkg.engines = { ...(pkg.engines || {}), node: '>=20.9.0' };
  await writeJson(packageFile, pkg);
  changes.push('package.json');

  const routeDir = path.join(root, 'app', '[[...slug]]');
  await fs.mkdir(routeDir, { recursive: true });
  const extension = /\.tsx?$/.test(appSource) ? 'tsx' : 'jsx';
  const importPath = `../../${appSource.replace(/\.[^.]+$/, '')}`;
  await fs.writeFile(path.join(root, 'app', `layout.${extension}`), `export const metadata = { title: '${escapeTitle(pkg.name || 'Modernized application')}' };\n\nexport default function RootLayout({ children }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n`);
  await fs.writeFile(path.join(routeDir, `page.${extension}`), `'use client';\n\nimport * as LegacyAppModule from '${importPath}';\n\nconst LegacyApp = LegacyAppModule.default ?? LegacyAppModule.App;\n\nexport default function CompatibilityPage() {\n  return <LegacyApp />;\n}\n`);
  changes.push(`app/layout.${extension}`, `app/[[...slug]]/page.${extension}`);
  await fs.writeFile(path.join(root, 'next.config.mjs'), `/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true };\n\nexport default nextConfig;\n`);
  changes.push('next.config.mjs');

  for (const file of await walk(root)) {
    if (!/\.[jt]sx?$/.test(file) || file.includes(`${path.sep}app${path.sep}`)) continue;
    const before = await fs.readFile(file, 'utf8');
    const after = before
      .replace(/process\.env\.REACT_APP_([A-Z0-9_]+)/g, 'process.env.NEXT_PUBLIC_$1')
      .replace(/import\.meta\.env\.VITE_([A-Z0-9_]+)/g, 'process.env.NEXT_PUBLIC_$1');
    if (after !== before) { await fs.writeFile(file, after); changes.push(path.relative(root, file)); }
  }
  for (const name of ['.env', '.env.local', '.env.development', '.env.production', '.env.test']) {
    const file = path.join(root, name);
    if (!(await exists(file))) continue;
    const before = await fs.readFile(file, 'utf8');
    const after = before.replace(/(^|\n)(\s*)(?:REACT_APP_|VITE_)([A-Z0-9_]+)(\s*=)/g, '$1$2NEXT_PUBLIC_$3$4');
    if (after !== before) { await fs.writeFile(file, after); changes.push(name); }
  }
  for (const obsolete of ['index.html', 'vite.config.js', 'vite.config.ts', 'public/index.html']) {
    const file = path.join(root, obsolete);
    if (await exists(file)) { await fs.rm(file); changes.push(`${obsolete} (removed)`); }
  }
  return [...new Set(changes)].sort();
}

async function findApp(root) {
  for (const file of ['src/App.jsx', 'src/App.js', 'src/App.tsx', 'src/App.ts']) if (await exists(path.join(root, file))) return file;
  throw new Error('A conventional src/App component is required for the Next.js compatibility bridge.');
}
function escapeTitle(value) { return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'"); }
