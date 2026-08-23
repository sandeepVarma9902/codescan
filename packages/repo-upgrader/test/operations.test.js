import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JobStore } from '../src/service/job-store.js';
import { JobWorker } from '../src/service/worker.js';
import { startService } from '../src/service/server.js';

test('health and readiness endpoints expose service and worker state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-health-'));
  const store = await new JobStore(path.join(root, 'jobs.json')).load();
  const worker = { enqueue() {}, status: () => ({ accepting: true, active: 1, queued: 2 }), shutdown: async () => true };
  const service = await startService({ token: 'test-token', port: 0, store, worker });
  const base = `http://127.0.0.1:${service.address.port}`;
  const health = await (await fetch(`${base}/healthz`)).json();
  assert.deepEqual(health, { status: 'ok', service: 'repo-upgrader', version: '1.7.0' });
  const readiness = await (await fetch(`${base}/readyz`)).json();
  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.worker.queued, 2);
  assert.equal((await service.close()).drained, true);
});

test('worker shutdown stops intake and waits for active work', async () => {
  let release;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const delivery = { deliver: () => new Promise((resolve) => { release = () => resolve({ pullRequestUrl: 'https://example.test/pr/1' }); markStarted(); }) };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-drain-'));
  const store = await new JobStore(path.join(root, 'jobs.json')).load();
  const job = await store.create({ repository: { fullName: 'acme/web' }, target: 'vite' });
  const worker = new JobWorker({ store, githubDelivery: delivery });
  worker.enqueue(job);
  await started;
  const draining = worker.shutdown({ timeoutMs: 1_000 });
  assert.throws(() => worker.enqueue(job), /shutting down/);
  release();
  assert.equal(await draining, true);
  assert.equal(store.get(job.id).status, 'succeeded');
});
