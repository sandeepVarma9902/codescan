import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transformReactToNext } from '../src/nextjs-transform.js';

test('creates an App Router compatibility bridge and migrates package contracts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-next-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'public'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'legacy-spa', scripts: { start: 'react-scripts start', build: 'react-scripts build', eject: 'react-scripts eject' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'react-scripts': '5.0.1' } }));
  await fs.writeFile(path.join(root, 'src/App.jsx'), `export default function App(){ return <div>{process.env.REACT_APP_API}</div> }`);
  await fs.writeFile(path.join(root, 'src/index.jsx'), `import App from './App';`);
  await fs.writeFile(path.join(root, '.env'), 'REACT_APP_API=/api\nSECRET=keep-me\n');
  await fs.writeFile(path.join(root, 'public/index.html'), '<div id="root"></div>');
  const changes = await transformReactToNext(root);
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  assert.equal(pkg.scripts.build, 'next build');
  assert.equal(pkg.dependencies.next, '^16.0.0');
  assert.equal(pkg.engines.node, '>=20.9.0');
  assert.equal(pkg.dependencies['react-scripts'], undefined);
  assert.match(await fs.readFile(path.join(root, 'app/[[...slug]]/page.jsx'), 'utf8'), /LegacyAppModule/);
  assert.match(await fs.readFile(path.join(root, 'src/App.jsx'), 'utf8'), /NEXT_PUBLIC_API/);
  assert.match(await fs.readFile(path.join(root, '.env'), 'utf8'), /^NEXT_PUBLIC_API=/);
  await assert.rejects(fs.access(path.join(root, 'public/index.html')));
  assert.ok(changes.includes('next.config.mjs'));
});

test('refuses compatibility bridge without a conventional App component', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-next-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { react: '^19.2.0' } }));
  await assert.rejects(transformReactToNext(root), /src\/App/);
});
