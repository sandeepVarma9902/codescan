import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AccountStore } from '../src/service/account-store.js';
import { ApiKeyRegistry, assertEntitled, PLANS } from '../src/service/auth.js';

test('plans enforce increasing SaaS resource envelopes', () => {
  assert.equal(PLANS.free.monthlyJobs, 3);
  assert.equal(PLANS.trial.trialDays, 14);
  assert.ok(PLANS.enterprise.maxUploadBytes > PLANS.pro.maxUploadBytes);
  assert.ok(PLANS.enterprise.maxProjectFiles > PLANS.trial.maxProjectFiles);
  assert.ok(PLANS.enterprise.maxConcurrentJobs > PLANS.starter.maxConcurrentJobs);
  assert.equal(PLANS.enterprise.maxUploadBytes, 500 * 1024 * 1024);
});

test('an account receives one durable time-limited trial', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-trial-'));
  const file = path.join(root, 'accounts.json');
  const store = await new AccountStore(file).load();
  const account = await store.startTrial('acme');
  assert.equal(account.plan, 'trial');
  assert.ok(new Date(account.trialEndsAt) > new Date(account.trialStartedAt));
  const restored = await new AccountStore(file).load();
  assert.equal(restored.getPlan('acme'), 'trial');
  await assert.rejects(() => restored.startTrial('acme'), /already been used/);
  await restored.apply({ eventId: 'paid', accountId: 'acme', plan: 'pro', status: 'active' });
  await restored.apply({ eventId: 'cancelled', accountId: 'acme', plan: 'free', status: 'cancelled' });
  await assert.rejects(() => restored.startTrial('acme'), /already been used/);
});

test('admission control enforces per-account concurrency', () => {
  const registry = new ApiKeyRegistry({ keys: [{ key: 'rk_free_concurrency_12345', accountId: 'acme', plan: 'free' }] });
  const principal = registry.authenticate('Bearer rk_free_concurrency_12345');
  assert.throws(() => assertEntitled(principal, 'vite', { periodJobs: 1, byStatus: { running: 1 } }), /Concurrent migration limit/);
  assert.doesNotThrow(() => assertEntitled(principal, 'vite', { periodJobs: 1, byStatus: { succeeded: 1 } }));
});
