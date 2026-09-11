import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AccountStore } from '../src/service/account-store.js';
import { ApiKeyRegistry, assertEntitled, PLANS } from '../src/service/auth.js';

test('plans enforce increasing SaaS resource envelopes', () => {
  assert.equal(PLANS.unpaid.monthlyJobs, 0);
  assert.equal(PLANS.single.priceUsd, 10);
  assert.equal(PLANS.team.priceUsd, 50);
  assert.equal(PLANS.business.priceUsd, 80);
  assert.ok(PLANS.business.maxUploadBytes > PLANS.team.maxUploadBytes);
  assert.ok(PLANS.enterprise.maxProjectFiles >= PLANS.business.maxProjectFiles);
  assert.ok(PLANS.enterprise.maxConcurrentJobs > PLANS.team.maxConcurrentJobs);
  assert.equal(PLANS.enterprise.maxUploadBytes, 500 * 1024 * 1024);
});

test('single purchases create durable, exactly-once migration credits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-credits-'));
  const file = path.join(root, 'accounts.json');
  const store = await new AccountStore(file).load();
  const purchase = { eventId: 'checkout-1', accountId: 'acme', plan: 'single', status: 'paid', creditDelta: 1 };
  assert.equal((await store.apply(purchase)).account.migrationCredits, 1);
  assert.equal((await store.apply(purchase)).deduplicated, true);
  await store.consumeCredit('acme', 'job:one');
  await store.consumeCredit('acme', 'job:one');
  const restored = await new AccountStore(file).load();
  assert.equal(restored.get('acme').migrationCredits, 0);
  assert.equal(restored.hasConsumedCredit('acme', 'job:one'), true);
  await assert.rejects(() => restored.consumeCredit('acme', 'job:two'), /No prepaid/);
});

test('admission control enforces per-account concurrency', () => {
  const registry = new ApiKeyRegistry({ keys: [{ key: 'rk_team_concurrency_12345', accountId: 'acme', plan: 'team' }] });
  const principal = registry.authenticate('Bearer rk_team_concurrency_12345');
  assert.throws(() => assertEntitled(principal, 'vite', { periodJobs: 3, byStatus: { running: 3 } }), /Concurrent migration limit/);
  assert.doesNotThrow(() => assertEntitled(principal, 'vite', { periodJobs: 3, byStatus: { succeeded: 3 } }));
});
