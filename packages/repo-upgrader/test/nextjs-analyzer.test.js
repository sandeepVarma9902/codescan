import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNextReadiness, appRouterDestination } from '../src/nextjs-analyzer.js';

test('maps React Router paths to Next.js App Router destinations', () => {
  assert.equal(appRouterDestination('/'), 'app/page');
  assert.equal(appRouterDestination('/users/:id'), 'app/users/[id]/page');
  assert.equal(appRouterDestination('/docs/*'), 'app/docs/[[...slug]]/page');
});

test('inventories routes, client boundaries, and data fetching', () => {
  const analysis = analyzeNextReadiness([
    { file: 'src/App.jsx', content: `import { BrowserRouter, Routes, Route } from 'react-router-dom';\nexport function App(){ return <BrowserRouter><Routes><Route path="/" element={<Home />} /><Route path="/users/:id" element={<User />} /></Routes></BrowserRouter> }` },
    { file: 'src/User.jsx', content: `import { useEffect, useState } from 'react';\nexport function User(){ const [user,setUser]=useState(); useEffect(() => { fetch('/api/user').then(r=>r.json()).then(setUser) }, []); return <div>{window.location.host}{user?.name}</div> }` }
  ], { 'react-router-dom': '^6.0.0' });
  assert.equal(analysis.routes.length, 2);
  assert.equal(analysis.routes[1].destination, 'app/users/[id]/page');
  assert.ok(analysis.clientBoundaries.some((item) => item.file === 'src/User.jsx'));
  assert.equal(analysis.dataFetching[0].pattern, 'effect-fetch');
  assert.equal(analysis.readiness.level, 'medium');
});

test('blocks HashRouter migrations pending URL strategy approval', () => {
  const analysis = analyzeNextReadiness([{ file: 'src/App.jsx', content: `import { HashRouter } from 'react-router-dom'; export const App = () => <HashRouter />;` }], { 'react-router-dom': '^6.0.0' });
  assert.equal(analysis.readiness.level, 'blocked');
  assert.equal(analysis.findings[0].code, 'hash-router');
});
