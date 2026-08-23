import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { JobStore } from '../src/service/job-store.js';
import { startService } from '../src/service/server.js';
import { verifyGitHubSignature } from '../src/service/github-webhook.js';

test('job store persists state transitions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-store-'));
  const file = path.join(root, 'jobs.json');
  const store = await new JobStore(file).load();
  const job = await store.create({ target: 'vite', repository: { fullName: 'owner/repo' } });
  await store.update(job.id, { status: 'running' });
  const reloaded = await new JobStore(file).load();
  assert.equal(reloaded.get(job.id).status, 'running');
  assert.equal(reloaded.get(job.id).events.length, 2);
});

test('GitHub webhook signatures are timing-safe and exact', () => {
  const body = Buffer.from('{"action":"modernize"}');
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(verifyGitHubSignature(body, signature, 'secret'), true);
  assert.equal(verifyGitHubSignature(body, signature, 'wrong'), false);
});

test('job API requires auth and accepts valid jobs', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-api-'));
  const store = await new JobStore(path.join(root, 'jobs.json')).load();
  const accepted = [];
  const service = await startService({ token: 'test-token', port: 0, store, worker: { enqueue(job) { accepted.push(job.id); } } });
  t.after(() => service.server.close());
  const base = `http://127.0.0.1:${service.address.port}`;
  const denied = await fetch(`${base}/v1/jobs`, { method: 'POST' });
  assert.equal(denied.status, 401);
  const response = await fetch(`${base}/v1/jobs`, { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ repository: { fullName: 'owner/repo' }, target: 'vite' }) });
  assert.equal(response.status, 202);
  const job = await response.json();
  assert.equal(job.status, 'queued');
  assert.deepEqual(accepted, [job.id]);
  const lookup = await fetch(`${base}/v1/jobs/${job.id}`, { headers: { authorization: 'Bearer test-token' } });
  assert.equal((await lookup.json()).id, job.id);
});
