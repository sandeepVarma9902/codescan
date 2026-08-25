import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { createBillingPortal, githubInstallUrl, requirePermission } from '../src/service/commercial.js';
import { JobStore } from '../src/service/job-store.js';
import { startService } from '../src/service/server.js';
import { RepoUpgraderClient } from '../sdk/index.js';

test('commercial roles enforce least privilege', () => {
  assert.doesNotThrow(() => requirePermission({ role: 'operator' }, 'submit'));
  assert.throws(() => requirePermission({ role: 'viewer' }, 'submit'), /cannot perform/);
  assert.doesNotThrow(() => requirePermission({ role: 'owner' }, 'billing'));
});

test('GitHub installation URL binds a signed account and expiry', () => {
  const url = new URL(githubInstallUrl({ slug: 'repo-upgrader', accountId: 'acme', secret: 'secret' }));
  const [state, signature] = url.searchParams.get('state').split('.');
  const payload = JSON.parse(Buffer.from(state, 'base64url'));
  assert.equal(url.pathname, '/apps/repo-upgrader/installations/new');
  assert.equal(payload.accountId, 'acme');
  assert.ok(payload.expiresAt > Date.now());
  assert.equal(signature, createHmac('sha256', 'secret').update(state).digest('base64url'));
});

test('billing portal uses Stripe customer and returns its session URL', async () => {
  let received;
  const result = await createBillingPortal({ secretKey: 'sk_test', customerId: 'cus_123', returnUrl: 'https://app.example/dashboard', transport: async (url, options) => {
    received = { url, options };
    return { ok: true, json: async () => ({ url: 'https://billing.example/session' }) };
  } });
  assert.equal(result.url, 'https://billing.example/session');
  assert.match(received.options.body.toString(), /customer=cus_123/);
});

test('OpenAPI is public and tenant admins remain account scoped', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-commercial-'));
  const store = await new JobStore(path.join(root, 'jobs.json')).load();
  await store.create({ accountId: 'other', repositoryPath: root, target: 'vite' });
  const auth = { authenticate: () => ({ accountId: 'acme', role: 'admin', plan: 'free', entitlements: {} }) };
  const worker = { enqueue() {}, status: () => ({ accepting: true }), shutdown: async () => true };
  const service = await startService({ port: 0, store, auth, worker, accountStoreFile: path.join(root, 'accounts.json'), credentialStoreFile: path.join(root, 'credentials.json'), auditFile: path.join(root, 'audit.jsonl') });
  const base = `http://127.0.0.1:${service.address.port}`;
  try {
    const spec = await (await fetch(`${base}/openapi.json`)).json();
    assert.equal(spec.info.version, '3.0.0');
    const jobs = await (await fetch(`${base}/v1/jobs`, { headers: { authorization: 'Bearer ignored' } })).json();
    assert.deepEqual(jobs.jobs, []);
  } finally { await service.close(); }
});

test('JavaScript SDK sends authentication and idempotency headers', async () => {
  let received;
  const client = new RepoUpgraderClient({ baseUrl: 'https://api.example/', apiKey: 'key', transport: async (url, options) => {
    received = { url, options };
    return { ok: true, json: async () => ({ id: 'job-1' }) };
  } });
  const result = await client.submit({ repository: { fullName: 'acme/web' }, target: 'vite' }, { idempotencyKey: 'request-123' });
  assert.equal(result.id, 'job-1');
  assert.equal(received.url, 'https://api.example/v1/jobs');
  assert.equal(received.options.headers.authorization, 'Bearer key');
  assert.equal(received.options.headers['idempotency-key'], 'request-123');
});
