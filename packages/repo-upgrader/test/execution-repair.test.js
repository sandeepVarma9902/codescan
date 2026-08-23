import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dockerCommand, execute } from '../src/executor.js';
import { applyDeterministicRepairs } from '../src/repair.js';

test('local executor enforces a timeout', () => {
  const result = execute(process.cwd(), [process.execPath, ['-e', 'setTimeout(() => {}, 5000)']], { timeoutMs: 20 });
  assert.equal(result.status, 'timed-out');
});

test('docker command applies resource and network isolation', () => {
  const [command, args] = dockerCommand('/tmp/example', 'npm', ['run', 'build']);
  assert.equal(command, 'docker');
  assert.ok(args.includes('--memory'));
  assert.ok(args.includes('--pids-limit'));
  assert.equal(args[args.indexOf('--network') + 1], 'none');
});

test('bounded repair removes stale react-scripts commands', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-repair-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'react-scripts build', test: 'react-scripts test' } }));
  const repairs = await applyDeterministicRepairs(root, { checks: [{ status: 'failed', output: 'react-scripts: command not found' }] });
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  assert.equal(repairs[0].recipe, 'remove-stale-react-scripts');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.scripts.test, 'vitest run');
});
