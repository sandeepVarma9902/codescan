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

test('recommends approved recipes for browser APIs and unmapped DOM elements', () => {
  const analysis = analyzeReactNativeReadiness([{ file: 'src/Map.jsx', content: `export const Map = () => <canvas>{localStorage.getItem('x')}</canvas>;` }], {});
  assert.equal(analysis.readiness.level, 'approval-required');
  assert.equal(analysis.readiness.blockers, 0);
  assert.equal(analysis.convertible, true);
  assert.ok(analysis.findings.some((item) => item.code === 'browser-storage'));
  assert.ok(analysis.findings.some((item) => item.code === 'custom-native-components'));
});

test('maps interactive web semantics to an approval recipe', () => {
  const analysis = analyzeReactNativeReadiness([{ file: 'src/Button.jsx', content: `export const Button = () => <button onClick={() => {}}>Open</button>;` }], {});
  assert.equal(analysis.automaticConversionEligible, true);
  assert.ok(analysis.findings.some((item) => item.code === 'interactive-native-controls'));
  assert.ok(analysis.recommendations.some((item) => item.id === 'native-primitives'));
});

test('selects recipes for storage, files, location, auth, notifications, maps, charts, and styling', () => {
  const content = `import './app.css'; const value=localStorage.getItem('x'); document.cookie; navigator.geolocation; new Notification('x'); const file=<input type="file"/>; const map=<GoogleMap/>; const chart=<canvas/>;`;
  const analysis = analyzeReactNativeReadiness([{ file: 'src/App.jsx', content }], { '@mui/material': '^6.0.0', 'react-router-dom': '^7.0.0' });
  const recipes = new Set(analysis.recommendations.map((item) => item.id));
  for (const expected of ['nativewind-styling', 'async-storage', 'expo-document-picker', 'expo-location', 'expo-notifications', 'expo-auth-session', 'native-maps', 'native-charts', 'native-paper', 'expo-router']) assert.ok(recipes.has(expected), expected);
});
