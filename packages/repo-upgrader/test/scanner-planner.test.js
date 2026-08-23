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
