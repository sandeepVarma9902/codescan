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
  assert.equal(reloaded.get(job.id).status, 'interrupted');
  assert.equal(reloaded.get(job.id).events.length, 3);
});

test('job store deduplicates, meters, cancels, and recovers interrupted work', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-control-'));
  const file = path.join(root, 'jobs.json');
  const store = await new JobStore(file).load();
  const first = await store.createOrGet({ target: 'vite', repository: { fullName: 'owner/repo' } }, 'customer-job-001');
  const repeated = await store.createOrGet({ target: 'vite', repository: { fullName: 'owner/repo' } }, 'customer-job-001');
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.job.id, first.job.id);
  assert.equal(store.usage().totalJobs, 1);
  await store.update(first.job.id, { status: 'running' });
  const recovered = await new JobStore(file).load();
  assert.equal(recovered.get(first.job.id).status, 'interrupted');
  const queued = await recovered.create({ target: 'vite', repository: { fullName: 'owner/other' } });
  assert.equal((await recovered.cancel(queued.id)).status, 'cancelled');
  await assert.rejects(recovered.cancel(first.job.id), /cannot be cancelled/);
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
  const repeated = await fetch(`${base}/v1/jobs`, { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', 'idempotency-key': 'customer-job-002' }, body: JSON.stringify({ repository: { fullName: 'owner/repo' }, target: 'vite' }) });
  const repeatedJob = await repeated.json();
  const duplicate = await fetch(`${base}/v1/jobs`, { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', 'idempotency-key': 'customer-job-002' }, body: JSON.stringify({ repository: { fullName: 'owner/repo' }, target: 'vite' }) });
  const duplicateJob = await duplicate.json();
  assert.equal(duplicate.status, 200);
  assert.equal(duplicateJob.id, repeatedJob.id);
  assert.equal(duplicateJob.deduplicated, true);
  const listed = await fetch(`${base}/v1/jobs?limit=10`, { headers: { authorization: 'Bearer test-token' } });
  assert.ok((await listed.json()).jobs.length >= 2);
  const usage = await fetch(`${base}/v1/usage`, { headers: { authorization: 'Bearer test-token' } });
  assert.ok((await usage.json()).totalJobs >= 2);
});
