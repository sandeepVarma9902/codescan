import test from 'node:test';
import assert from 'node:assert/strict';
import { launchReadiness } from '../src/service/launch-readiness.js';

test('launch gate identifies incomplete demo infrastructure', () => {
  const result = launchReadiness({ env: {}, demoMode: true });
  assert.equal(result.ready, false);
  assert.equal(result.passed, 0);
  assert.equal(result.total, 10);
});

test('launch gate passes only a complete production configuration', () => {
  const env = { DATABASE_URL: 'postgres://database', REDIS_URL: 'redis://queue', MODERNIZER_REPORT_BUCKET: 'reports', GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: 'private', MODERNIZER_WEBHOOK_SECRET: 'webhook', STRIPE_SECRET_KEY: 'stripe', STRIPE_SINGLE_PRICE_ID: 'single', STRIPE_TEAM_PRICE_ID: 'team', STRIPE_BUSINESS_PRICE_ID: 'business', MODERNIZER_BILLING_WEBHOOK_SECRET: 'billing', MODERNIZER_DASHBOARD_URL: 'https://upgrader.example', MODERNIZER_ALLOWED_REPO_ROOT: '/work', MODERNIZER_WORK_ROOT: '/work', MODERNIZER_SUPPORT_EMAIL: 'support@example.com', MODERNIZER_BUSINESS_NAME: 'Example Ltd', MODERNIZER_BUSINESS_COUNTRY: 'India' };
  const result = launchReadiness({ env, demoMode: false });
  assert.equal(result.ready, true);
  assert.equal(result.percent, 100);
});
