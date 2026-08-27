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

test('converts common controls and router contracts to native equivalents', () => {
  const converted = convertSafeJsx(`import { Link, Routes, Route } from 'react-router-dom'; export default function App(){ return <Routes><Route path="/" element={<form><button onClick={() => {}}>Save</button><input placeholder="Name"/><a href="/help">Help</a></form>} /></Routes> }`);
  assert.match(converted, /Pressable onPress/);
  assert.match(converted, /TextInput placeholder/);
  assert.match(converted, /<Link href="\/help">/);
  assert.doesNotMatch(converted, /react-router-dom/);
});

test('preserves self-closing control expressions and converts semantic containers', () => {
  const converted = convertSafeJsx(`export default function App(){ return <aside><article><small>Energy</small><input value={3} onChange={event => setEnergy(event.target.value)} /></article></aside> }`);
  assert.ok(converted.includes('<Text>Energy</Text>'));
  assert.ok(converted.includes('onChange={event => setEnergy(event.target.value)} />'));
  assert.doesNotMatch(converted, new RegExp('<(?:aside|article|small)'));
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
  assert.equal(pkg.dependencies['react-dom'], '19.2.3');
  assert.equal(pkg.devDependencies['babel-preset-expo'], '~57.0.0');
  assert.equal(pkg.engines.node, '>=20.19.4');
  assert.match(await fs.readFile(path.join(root, 'native-src/App.tsx'), 'utf8'), /<View><Text>Hello native<\/Text><\/View>/);
  assert.match(await fs.readFile(path.join(root, 'app/_layout.tsx'), 'utf8'), /<Stack/);
  assert.match(await fs.readFile(path.join(root, '.env'), 'utf8'), /^EXPO_PUBLIC_API=/);
  await assert.rejects(fs.access(path.join(root, 'native-src/index.tsx')));
  assert.ok(changes.includes('app/index.tsx'));
  assert.ok(changes.includes('migration-decisions.json'));
  assert.ok(changes.includes('native-src/platform/index.ts'));
});
