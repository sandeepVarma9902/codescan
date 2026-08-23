import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists, readJson, relative, walk } from './utils.js';

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.html']);

export async function scanRepository(root) {
  const absoluteRoot = path.resolve(root);
  const packageFile = path.join(absoluteRoot, 'package.json');
  if (!(await exists(packageFile))) throw new Error(`No package.json found in ${absoluteRoot}`);
  const pkg = await readJson(packageFile);
  const files = await walk(absoluteRoot);
  const sourceFiles = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)));
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const craSignals = [];
  if (dependencies['react-scripts']) craSignals.push('react-scripts dependency');
  if (pkg.scripts?.start?.includes('react-scripts')) craSignals.push('react-scripts start script');
  if (await exists(path.join(absoluteRoot, 'public', 'index.html'))) craSignals.push('public/index.html');
  const entryCandidates = ['src/index.jsx', 'src/index.js', 'src/index.tsx', 'src/index.ts', 'src/main.jsx', 'src/main.tsx'];
  const entrypoints = [];
  for (const candidate of entryCandidates) if (await exists(path.join(absoluteRoot, candidate))) entrypoints.push(candidate);
  const envUsages = [];
  for (const file of sourceFiles) {
    const content = await fs.readFile(file, 'utf8');
    if (content.includes('process.env.REACT_APP_')) envUsages.push(relative(absoluteRoot, file));
  }
  return {
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    root: absoluteRoot,
    project: { name: pkg.name || path.basename(absoluteRoot), packageManager: detectPackageManager(files, absoluteRoot) },
    framework: craSignals.length >= 2 ? 'create-react-app' : dependencies.vite ? 'vite' : dependencies.next ? 'nextjs' : 'unknown-react',
    confidence: craSignals.length >= 2 ? 'high' : craSignals.length ? 'medium' : 'low',
    signals: craSignals,
    dependencies,
    scripts: pkg.scripts || {},
    entrypoints,
    envUsages,
    inventory: { files: files.length, sourceFiles: sourceFiles.length },
    capabilities: { craToVite: craSignals.length >= 2, reactToNext: 'planned' }
  };
}

function detectPackageManager(files, root) {
  const names = new Set(files.map((file) => relative(root, file)));
  if (names.has('pnpm-lock.yaml')) return 'pnpm';
  if (names.has('yarn.lock')) return 'yarn';
  if (names.has('bun.lockb') || names.has('bun.lock')) return 'bun';
  return 'npm';
}
