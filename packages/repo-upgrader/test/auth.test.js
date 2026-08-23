import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiKeyRegistry, assertEntitled } from '../src/service/auth.js';

test('API keys resolve account, role, and plan without retaining plaintext', () => {
  const registry = new ApiKeyRegistry({ keys: [{ key: 'rk_test_account_a_123456', accountId: 'account-a', plan: 'starter' }] });
  const principal = registry.authenticate('Bearer rk_test_account_a_123456');
  assert.equal(principal.accountId, 'account-a');
  assert.equal(principal.plan, 'starter');
  assert.equal(registry.authenticate('Bearer wrong-key-value-1234'), null);
  assert.equal(JSON.stringify(registry).includes('rk_test_account_a_123456'), false);
});

test('plan entitlements enforce targets and monthly quotas', () => {
  const registry = new ApiKeyRegistry({ keys: [{ key: 'rk_free_account_12345678', accountId: 'free-account', plan: 'free' }] });
  const principal = registry.authenticate('Bearer rk_free_account_12345678');
  assert.doesNotThrow(() => assertEntitled(principal, 'vite', { periodJobs: 2 }));
  assert.throws(() => assertEntitled(principal, 'nextjs', { periodJobs: 0 }), /does not include/);
  assert.throws(() => assertEntitled(principal, 'vite', { periodJobs: 3 }), /quota reached/);
});
