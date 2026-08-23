import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { WebhookDispatcher } from '../src/service/outbound-webhook.js';

test('outbound webhooks are tenant scoped, signed, and omit sensitive job fields', async () => {
  const calls = [];
  const dispatcher = new WebhookDispatcher({ endpoints: [{ accountId: 'acme', url: 'https://hooks.example.test/migrations', secret: 'a-long-webhook-secret', events: ['migration.succeeded'] }, { accountId: 'other', url: 'https://other.example.test/hook', secret: 'another-long-secret' }], transport: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; } });
  const result = await dispatcher.dispatch('migration.succeeded', { id: 'job-1', accountId: 'acme', status: 'succeeded', target: 'vite', repository: { fullName: 'acme/web', installationId: 123 }, token: 'never-send' });
  assert.equal(result[0].status, 'succeeded');
  assert.equal(calls.length, 1);
  const signature = calls[0].options.headers['x-repo-upgrader-signature'];
  const timestamp = signature.match(/^t=(\d+),v1=/)[1];
  const expected = createHmac('sha256', 'a-long-webhook-secret').update(`${timestamp}.${calls[0].options.body}`).digest('hex');
  assert.equal(signature, `t=${timestamp},v1=${expected}`);
  assert.equal(calls[0].options.body.includes('never-send'), false);
  assert.equal(calls[0].options.body.includes('installationId'), false);
});

test('failed webhook deliveries retry and create audit evidence', async () => {
  let calls = 0;
  const audit = [];
  const dispatcher = new WebhookDispatcher({ endpoints: [{ accountId: 'acme', url: 'https://hooks.example.test/migrations', secret: 'a-long-webhook-secret' }], attempts: 3, retryDelayMs: 0, transport: async () => { calls += 1; return { ok: false, status: 503 }; }, auditLog: { record(event) { audit.push(event); } } });
  const [result] = await dispatcher.dispatch('migration.failed', { id: 'job-1', accountId: 'acme', status: 'failed', target: 'vite' });
  assert.equal(calls, 3);
  assert.equal(result.status, 'failed');
  assert.equal(audit[0].action, 'webhook.failed');
  assert.equal(audit[0].metadata.attempts, 3);
});
