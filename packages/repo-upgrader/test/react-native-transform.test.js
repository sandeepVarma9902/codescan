import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertSafeJsx, transformReactToNative } from '../src/react-native-transform.js';

test('converts safe structural JSX to React Native primitives', () => {
  const converted = convertSafeJsx(`export default function Card(){ return <section><h2>Title</h2><p>{process.env.REACT_APP_COPY}</p></section> }`);
  assert.match(converted, /import \{ Text, View \} from 'react-native'/);
  assert.match(converted, /<View><Text>Title<\/Text>/);
  assert.match(converted, /EXPO_PUBLIC_COPY/);
});

test('creates an Expo Router workspace and preserves converted source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-expo-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'Simple Web App', scripts: { start: 'react-scripts start' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'react-scripts': '5.0.1' } }));
  await fs.writeFile(path.join(root, 'src/App.jsx'), `export default function App(){ return <main><h1>Hello native</h1></main> }`);
  await fs.writeFile(path.join(root, 'src/index.jsx'), `import { createRoot } from 'react-dom/client';`);
  await fs.writeFile(path.join(root, '.env'), 'REACT_APP_API=/api\nSECRET=keep\n');
  const changes = await transformReactToNative(root);
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  assert.equal(pkg.main, 'expo-router/entry');
  assert.equal(pkg.dependencies.expo, '~57.0.0');
  assert.equal(pkg.dependencies['react-native'], '0.86.0');
  assert.equal(pkg.dependencies['react-dom'], undefined);
  assert.equal(pkg.engines.node, '>=22.13.0');
  assert.match(await fs.readFile(path.join(root, 'native-src/App.tsx'), 'utf8'), /<View><Text>Hello native<\/Text><\/View>/);
  assert.match(await fs.readFile(path.join(root, 'app/_layout.tsx'), 'utf8'), /<Stack/);
  assert.match(await fs.readFile(path.join(root, '.env'), 'utf8'), /^EXPO_PUBLIC_API=/);
  await assert.rejects(fs.access(path.join(root, 'native-src/index.tsx')));
  assert.ok(changes.includes('app/index.tsx'));
});
