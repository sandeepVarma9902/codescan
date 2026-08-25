import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { scanRepository } from '../src/scanner.js';
import { createPlan } from '../src/planner.js';
import { transformCraToVite } from '../src/transform.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-benchmark-'));
try {
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'public'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'benchmark-cra', scripts: { start: 'react-scripts start', build: 'react-scripts build' }, dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', 'react-scripts': '5.0.1' } }));
  await fs.writeFile(path.join(root, 'public', 'index.html'), '<div id="root"></div></body>');
  await fs.writeFile(path.join(root, 'src', 'index.jsx'), "import App from './App';\nconst endpoint = process.env.REACT_APP_API;\nvoid endpoint; void App;\n");
  await fs.writeFile(path.join(root, 'src', 'App.jsx'), 'export default function App(){ return <main>Benchmark</main>; }\n');
  for (let index = 0; index < 100; index++) await fs.writeFile(path.join(root, 'src', `Component${index}.jsx`), `export default function Component${index}(){ return <section>${index}</section>; }\n`);
  const started = performance.now();
  const scan = await scanRepository(root);
  const scanned = performance.now();
  const plan = createPlan(scan);
  const planned = performance.now();
  const changes = await transformCraToVite(root);
  const transformed = performance.now();
  const result = { fixtureFiles: 104, scanMs: round(scanned - started), planMs: round(planned - scanned), transformMs: round(transformed - planned), totalMs: round(transformed - started), changes: changes.length };
  console.log(JSON.stringify(result, null, 2));
  if (!plan.supported || result.totalMs > 5_000) throw new Error('Migration benchmark exceeded its correctness or five-second performance budget.');
} finally { await fs.rm(root, { recursive: true, force: true }); }

function round(value) { return Math.round(value * 100) / 100; }
