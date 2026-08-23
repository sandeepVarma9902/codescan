import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JobStore } from '../src/service/job-store.js';
import { assertPolicy, PolicyRegistry } from '../src/service/policy.js';

test('organization policies restrict repositories, targets, executors, and repairs', () => {
  const registry = new PolicyRegistry([{ accountId: 'acme', allowedRepositories: ['acme/*'], allowedTargets: ['vite'], allowedExecutors: ['docker'], maxRepairAttempts: 1 }]);
  const policy = registry.get('acme');
  assert.doesNotThrow(() => assertPolicy(policy, { repository: { fullName: 'acme/web' }, target: 'vite', executor: 'docker', maxRepairAttempts: 1 }));
  assert.throws(() => assertPolicy(policy, { repository: { fullName: 'other/web' }, target: 'vite', executor: 'docker', maxRepairAttempts: 1 }), /Repository is not permitted/);
  assert.throws(() => assertPolicy(policy, { repository: { fullName: 'acme/web' }, target: 'nextjs', executor: 'docker', maxRepairAttempts: 1 }), /target is not permitted/);
  assert.throws(() => assertPolicy(policy, { repository: { fullName: 'acme/web' }, target: 'vite', executor: 'local', maxRepairAttempts: 1 }), /executor is not permitted/);
  assert.throws(() => assertPolicy(policy, { repository: { fullName: 'acme/web' }, target: 'vite', executor: 'docker', maxRepairAttempts: 2 }), /Repair attempts exceed/);
});

test('analytics summarize outcomes by target and migration duration', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-analytics-'));
  const store = await new JobStore(path.join(root, 'jobs.json')).load();
  const first = await store.create({ accountId: 'acme', target: 'vite' });
  await store.update(first.id, { status: 'running' });
  await store.update(first.id, { status: 'succeeded' });
  const second = await store.create({ accountId: 'acme', target: 'nextjs' });
  await store.update(second.id, { status: 'running' });
  await store.update(second.id, { status: 'failed' });
  await store.create({ accountId: 'other', target: 'vite' });
  const analytics = store.analytics('acme');
  assert.equal(analytics.totalMigrations, 2);
  assert.equal(analytics.completedMigrations, 2);
  assert.equal(analytics.successRate, 0.5);
  assert.equal(analytics.byTarget.vite.succeeded, 1);
  assert.equal(analytics.byTarget.nextjs.failed, 1);
  assert.ok(analytics.averageDurationMs >= 0);
});
