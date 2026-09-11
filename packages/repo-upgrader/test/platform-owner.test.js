import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PlatformConfig } from '../src/service/platform-config.js';
import { MarketingStore } from '../src/service/marketing-store.js';

test('owner can switch between paid, global free, and invited free access', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'platform-config-'));
  const config = await new PlatformConfig(path.join(directory, 'config.json')).load();
  assert.equal(config.resolvePlan('new-customer', 'unpaid'), 'unpaid');
  await config.update({ accessMode: 'free', complimentaryPlan: 'team' });
  assert.equal(config.resolvePlan('new-customer', 'unpaid'), 'team');
  assert.equal(config.resolvePlan('paying-customer', 'business'), 'business');
  await config.update({ accessMode: 'invite-only', complimentaryAccounts: ['friend'] });
  assert.equal(config.resolvePlan('friend', 'unpaid'), 'team');
  assert.equal(config.resolvePlan('stranger', 'unpaid'), 'unpaid');
});

test('marketing bot creates anonymous drafts and requires configured approval', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marketing-store-'));
  const config = new PlatformConfig(path.join(directory, 'config.json'));
  const store = await new MarketingStore(path.join(directory, 'marketing.json'), { platformConfig: config }).load();
  await store.onMigrationSucceeded({ id: 'job-secret', target: 'vite', repository: { fullName: 'private/customer' } });
  const drafts = store.list();
  assert.equal(drafts.length, 2);
  assert.ok(drafts.every((item) => item.status === 'draft'));
  assert.ok(drafts.every((item) => !item.text.includes('private/customer')));
  await assert.rejects(store.approve(drafts[0].id), /approval-required/);
  await config.update({ marketingMode: 'approval-required' });
  assert.equal((await store.approve(drafts[0].id)).status, 'approved');
});
