import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanRepository } from '../src/scanner.js';
import { createPlan } from '../src/planner.js';
import { transformCraToVite } from '../src/transform.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'public'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'legacy-app', scripts: { start: 'react-scripts start', build: 'react-scripts build' }, dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', 'react-scripts': '5.0.1' } }));
  await fs.writeFile(path.join(root, 'public/index.html'), '<div id="root"></div></body>');
  await fs.writeFile(path.join(root, 'src/index.js'), 'const api = process.env.REACT_APP_API;\n');
  return root;
}

test('scans CRA and creates a supported plan', async () => {
  const root = await fixture();
  const scan = await scanRepository(root);
  assert.equal(scan.framework, 'create-react-app');
  assert.equal(createPlan(scan).supported, true);
});

test('CRA transform is deterministic and produces Vite inputs', async () => {
  const root = await fixture();
  await transformCraToVite(root);
  const once = await fs.readFile(path.join(root, 'package.json'), 'utf8');
  await transformCraToVite(root);
  assert.equal(await fs.readFile(path.join(root, 'package.json'), 'utf8'), once);
  assert.match(await fs.readFile(path.join(root, 'src/index.js'), 'utf8'), /import\.meta\.env\.VITE_API/);
  assert.equal((await fs.readFile(path.join(root, 'index.html'), 'utf8')).includes('type="module"'), true);
});

test('scanner blocks custom webpack overrides', async () => {
  const root = await fixture();
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  pkg.dependencies['@craco/craco'] = '^7.0.0';
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg));
  const scan = await scanRepository(root);
  assert.equal(scan.risk.level, 'high');
  assert.equal(scan.capabilities.craToVite, false);
  assert.match(createPlan(scan).preconditions[0], /CRACO/);
});

test('transform migrates CRA tests and env contracts', async () => {
  const root = await fixture();
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  pkg.scripts.test = 'react-scripts test';
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg));
  await fs.writeFile(path.join(root, '.env'), 'REACT_APP_API=https://example.test\nSECRET=unchanged\n');
  await fs.writeFile(path.join(root, 'src/setupTests.js'), "import '@testing-library/jest-dom';\n");
  await transformCraToVite(root);
  const migrated = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  assert.equal(migrated.scripts.test, 'vitest run');
  assert.ok(migrated.devDependencies.vitest);
  assert.match(await fs.readFile(path.join(root, '.env'), 'utf8'), /^VITE_API=/);
  assert.match(await fs.readFile(path.join(root, 'vite.config.js'), 'utf8'), /environment: 'jsdom'/);
});

test('scanner and transform preserve aliases and CRA SVG components', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'jsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: 'src', paths: { '@/*': ['*'] } } }));
  await fs.writeFile(path.join(root, 'src/App.jsx'), `import { ReactComponent as Logo } from './logo.svg'; export default () => <Logo />;`);
  const scan = await scanRepository(root);
  assert.equal(scan.craCompatibility.pathAliases, true);
  assert.deepEqual(scan.craCompatibility.svgComponentImports, ['src/App.jsx']);
  const plan = createPlan(scan);
  assert.ok(plan.changes.some((change) => change.id === 'path-aliases'));
  assert.ok(plan.changes.some((change) => change.id === 'svg-components'));
  await transformCraToVite(root);
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  assert.ok(pkg.devDependencies['vite-tsconfig-paths']);
  assert.ok(pkg.devDependencies['vite-plugin-svgr']);
  assert.match(await fs.readFile(path.join(root, 'src/App.jsx'), 'utf8'), /Logo from '\.\/logo\.svg\?react'/);
  assert.match(await fs.readFile(path.join(root, 'vite.config.js'), 'utf8'), /tsconfigPaths\(\).*svgr\(\)/);
});

test('conventional CRA proxy middleware becomes Vite server proxy', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'src/setupProxy.js'), `const { createProxyMiddleware } = require('http-proxy-middleware'); module.exports = app => { app.use(createProxyMiddleware('/api', { target: 'https://api.example.test', changeOrigin: true })); };`);
  const scan = await scanRepository(root);
  assert.deepEqual(scan.craCompatibility.proxyRoutes, [{ path: '/api', target: 'https://api.example.test' }]);
  assert.ok(createPlan(scan).changes.some((change) => change.id === 'development-proxy'));
  await transformCraToVite(root);
  const config = await fs.readFile(path.join(root, 'vite.config.js'), 'utf8');
  assert.match(config, /"\/api".*https:\/\/api\.example\.test/);
  await transformCraToVite(root);
  assert.equal(await fs.readFile(path.join(root, 'vite.config.js'), 'utf8'), config);
  await fs.access(path.join(root, 'src/setupProxy.js'));
});

test('Next.js plan exposes readiness analysis while keeping transforms gated', async () => {
  const root = await fixture();
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  pkg.dependencies['react-router-dom'] = '^6.0.0';
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg));
  await fs.writeFile(path.join(root, 'src/App.jsx'), `import { Routes, Route } from 'react-router-dom'; export const App = () => <Routes><Route path="/settings/:tab" element={<Settings />} /></Routes>;`);
  const scan = await scanRepository(root);
  const plan = createPlan(scan, 'nextjs');
  assert.equal(plan.status, 'analysis-ready');
  assert.equal(plan.supported, true);
  assert.equal(plan.strategy, 'spa-compatibility-bridge');
  assert.equal(plan.routeMappings[0].destination, 'app/settings/[tab]/page');
  assert.ok(plan.gates.includes('behavioral tests available'));
});

test('React Native plan exposes Expo conversion mappings while mutation stays gated', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'src/App.jsx'), `export default function App(){ return <div><p>Hello</p><button>Open</button></div> }`);
  const plan = createPlan(await scanRepository(root), 'react-native');
  assert.equal(plan.status, 'analysis-ready');
  assert.equal(plan.supported, false);
  assert.equal(plan.framework, 'expo-router');
  assert.ok(plan.primitiveMappings.some((item) => item.from === 'div' && item.to === 'View'));
  assert.ok(plan.gates.includes('iOS and Android behavioral tests available'));
});

test('React Native plan enables conversion only for safe structural components', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'src/App.jsx'), `export default function App(){ return <main><h1>Hello</h1><p>Details</p></main> }`);
  const plan = createPlan(await scanRepository(root), 'react-native');
  assert.equal(plan.supported, true);
  assert.equal(plan.strategy, 'expo-router-incremental-conversion');
});
