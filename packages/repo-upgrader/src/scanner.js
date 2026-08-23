import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists, readJson, relative, walk } from './utils.js';
import { analyzeNextReadiness } from './nextjs-analyzer.js';
import { analyzeReactNativeReadiness } from './react-native-analyzer.js';

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
  const riskFindings = [];
  const sourceRecords = [];
  for (const file of sourceFiles) {
    const content = await fs.readFile(file, 'utf8');
    sourceRecords.push({ file: relative(absoluteRoot, file), content });
    if (content.includes('process.env.REACT_APP_')) envUsages.push(relative(absoluteRoot, file));
    if (/process\.env\s*\[/.test(content)) riskFindings.push(finding('dynamic-env-access', 'warning', relative(absoluteRoot, file), 'Dynamic process.env access cannot be safely renamed.'));
  }
  if (dependencies['react-app-rewired'] || dependencies['@craco/craco']) riskFindings.push(finding('custom-webpack-overrides', 'blocker', 'package.json', 'CRACO/react-app-rewired configuration requires a dedicated compatibility recipe.'));
  if (await exists(path.join(absoluteRoot, 'src', 'setupProxy.js'))) riskFindings.push(finding('development-proxy', 'warning', 'src/setupProxy.js', 'CRA proxy middleware must be translated to Vite server.proxy.'));
  if (await exists(path.join(absoluteRoot, 'src', 'serviceWorker.js')) || await exists(path.join(absoluteRoot, 'src', 'service-worker.js'))) riskFindings.push(finding('service-worker', 'warning', 'src/', 'Service-worker behavior requires manual verification after migration.'));
  const risk = summarizeRisk(riskFindings);
  const nextjs = analyzeNextReadiness(sourceRecords, dependencies);
  const reactNative = analyzeReactNativeReadiness(sourceRecords.filter(({ file }) => /^src\/.*\.[jt]sx?$/.test(file)), dependencies);
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
    risk,
    nextjs,
    reactNative,
    inventory: { files: files.length, sourceFiles: sourceFiles.length },
    capabilities: { craToVite: craSignals.length >= 2 && risk.blockers === 0, reactToNext: 'compatibility-bridge', reactToReactNative: 'analysis-ready' }
  };
}

function finding(code, severity, file, message) { return { code, severity, file, message }; }
function summarizeRisk(findings) {
  const blockers = findings.filter((item) => item.severity === 'blocker').length;
  const warnings = findings.filter((item) => item.severity === 'warning').length;
  return { level: blockers ? 'high' : warnings ? 'medium' : 'low', blockers, warnings, findings };
}

function detectPackageManager(files, root) {
  const names = new Set(files.map((file) => relative(root, file)));
  if (names.has('pnpm-lock.yaml')) return 'pnpm';
  if (names.has('yarn.lock')) return 'yarn';
  if (names.has('bun.lockb') || names.has('bun.lock')) return 'bun';
  return 'npm';
}
