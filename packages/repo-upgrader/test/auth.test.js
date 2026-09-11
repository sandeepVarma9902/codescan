import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiKeyRegistry, assertEntitled } from '../src/service/auth.js';

test('API keys resolve account, role, and plan without retaining plaintext', () => {
  const registry = new ApiKeyRegistry({ keys: [{ key: 'rk_test_account_a_123456', accountId: 'account-a', plan: 'team' }] });
  const principal = registry.authenticate('Bearer rk_test_account_a_123456');
  assert.equal(principal.accountId, 'account-a');
  assert.equal(principal.plan, 'team');
  assert.equal(registry.authenticate('Bearer wrong-key-value-1234'), null);
  assert.equal(JSON.stringify(registry).includes('rk_test_account_a_123456'), false);
});

test('paid plan entitlements enforce payment and monthly quotas', () => {
  const unpaid = new ApiKeyRegistry({ keys: [{ key: 'rk_unpaid_account_123456', accountId: 'unpaid-account', plan: 'unpaid' }] }).authenticate('Bearer rk_unpaid_account_123456');
  assert.throws(() => assertEntitled(unpaid, 'vite', { periodJobs: 0 }), /Payment is required/);
  const team = new ApiKeyRegistry({ keys: [{ key: 'rk_team_account_12345678', accountId: 'team-account', plan: 'team' }] }).authenticate('Bearer rk_team_account_12345678');
  assert.doesNotThrow(() => assertEntitled(team, 'react-native', { periodJobs: 49 }));
  assert.throws(() => assertEntitled(team, 'vite', { periodJobs: 50 }), /quota reached/);
});
