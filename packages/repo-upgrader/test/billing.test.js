import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AccountStore } from '../src/service/account-store.js';
import { ApiKeyRegistry } from '../src/service/auth.js';
import { billingUpdateFromEvent, verifyBillingSignature } from '../src/service/billing-webhook.js';

test('billing signatures are exact and expire', () => {
  const raw = '{"id":"evt_1"}';
  const secret = 'whsec_test_value';
  const timestamp = 1_800_000_000;
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const header = `t=${timestamp},v1=${signature}`;
  assert.equal(verifyBillingSignature(raw, header, secret, { now: timestamp }), true);
  assert.equal(verifyBillingSignature(`${raw} `, header, secret, { now: timestamp }), false);
  assert.equal(verifyBillingSignature(raw, header, secret, { now: timestamp + 301 }), false);
});

test('subscription lifecycle maps to plans and cancellation falls back to free', () => {
  const event = { id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { accountId: 'acme', plan: 'pro' } } } };
  assert.equal(billingUpdateFromEvent(event).plan, 'pro');
  event.type = 'customer.subscription.deleted';
  assert.equal(billingUpdateFromEvent(event).plan, 'free');
});

test('account plans persist, deduplicate events, and override configured key plans', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-billing-'));
  const file = path.join(directory, 'accounts.json');
  const store = await new AccountStore(file).load();
  const update = { eventId: 'evt_1', accountId: 'acme', plan: 'pro', customerId: 'cus_1', subscriptionId: 'sub_1', status: 'active' };
  assert.equal((await store.apply(update)).deduplicated, false);
  assert.equal((await store.apply(update)).deduplicated, true);
  const restored = await new AccountStore(file).load();
  const registry = new ApiKeyRegistry({ keys: [{ key: 'rk_acme_long_test_key', accountId: 'acme', plan: 'free' }], planResolver: (accountId, fallback) => restored.getPlan(accountId, fallback) });
  assert.equal(registry.authenticate('Bearer rk_acme_long_test_key').plan, 'pro');
});
