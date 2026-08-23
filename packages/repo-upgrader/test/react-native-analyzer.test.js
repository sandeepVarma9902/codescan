import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReactNativeReadiness, expoRoute } from '../src/react-native-analyzer.js';

test('maps web routes to Expo Router files', () => {
  assert.equal(expoRoute('/'), 'app/index.tsx');
  assert.equal(expoRoute('/users/:id'), 'app/users/[id].tsx');
  assert.equal(expoRoute('/docs/*'), 'app/docs/[...slug].tsx');
});

test('inventories DOM primitives and native replacements', () => {
  const analysis = analyzeReactNativeReadiness([{ file: 'src/Card.jsx', content: `export const Card = () => <div><h2>Title</h2><span>Details</span></div>;` }], { react: '^19.0.0', 'react-dom': '^19.0.0' });
  assert.equal(analysis.elementInventory.div, 1);
  assert.equal(analysis.primitiveMappings.find((item) => item.from === 'h2').to, 'Text');
  assert.equal(analysis.components[0].suggestedFile, 'components/Card.tsx');
  assert.equal(analysis.recommendedFramework, 'expo-router');
  assert.equal(analysis.readiness.level, 'high');
  assert.equal(analysis.automaticConversionEligible, true);
});

test('blocks browser APIs and unmapped DOM elements', () => {
  const analysis = analyzeReactNativeReadiness([{ file: 'src/Map.jsx', content: `export const Map = () => <canvas>{localStorage.getItem('x')}</canvas>;` }], {});
  assert.equal(analysis.readiness.level, 'blocked');
  assert.ok(analysis.findings.some((item) => item.code === 'browser-platform-api'));
  assert.ok(analysis.findings.some((item) => item.code === 'unmapped-dom-elements'));
});

test('gates interactive web semantics from automatic conversion', () => {
  const analysis = analyzeReactNativeReadiness([{ file: 'src/Button.jsx', content: `export const Button = () => <button onClick={() => {}}>Open</button>;` }], {});
  assert.equal(analysis.automaticConversionEligible, false);
  assert.ok(analysis.findings.some((item) => item.code === 'interactive-dom-semantics'));
});
