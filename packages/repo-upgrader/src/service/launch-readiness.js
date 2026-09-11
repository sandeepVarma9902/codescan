const CHECKS = [
  ['production-mode', 'Production mode', ({ demoMode }) => !demoMode, 'Disable MODERNIZER_DEMO_MODE.'],
  ['database', 'Durable database', ({ env }) => Boolean(env.DATABASE_URL), 'Configure DATABASE_URL.'],
  ['queue', 'Distributed job queue', ({ env }) => Boolean(env.REDIS_URL), 'Configure REDIS_URL.'],
  ['reports', 'Encrypted report storage', ({ env }) => Boolean(env.MODERNIZER_REPORT_BUCKET), 'Configure MODERNIZER_REPORT_BUCKET.'],
  ['github-app', 'GitHub App delivery', ({ env }) => Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.MODERNIZER_WEBHOOK_SECRET), 'Configure the GitHub App ID, private key, and webhook secret.'],
  ['stripe', 'Stripe checkout', ({ env }) => Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_SINGLE_PRICE_ID && env.STRIPE_TEAM_PRICE_ID && env.STRIPE_BUSINESS_PRICE_ID && env.MODERNIZER_BILLING_WEBHOOK_SECRET), 'Configure Stripe and all product price IDs.'],
  ['public-url', 'HTTPS dashboard URL', ({ env }) => /^https:\/\//.test(env.MODERNIZER_DASHBOARD_URL || ''), 'Configure an HTTPS MODERNIZER_DASHBOARD_URL.'],
  ['worker-isolation', 'Worker repository isolation', ({ env }) => Boolean(env.MODERNIZER_ALLOWED_REPO_ROOT && env.MODERNIZER_WORK_ROOT), 'Configure isolated repository and worker roots.'],
  ['support', 'Customer support contact', ({ env }) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.MODERNIZER_SUPPORT_EMAIL || ''), 'Configure MODERNIZER_SUPPORT_EMAIL.'],
  ['business', 'Legal business identity', ({ env }) => Boolean(env.MODERNIZER_BUSINESS_NAME && env.MODERNIZER_BUSINESS_COUNTRY), 'Configure the legal business name and country.']
];

export function launchReadiness({ env = process.env, demoMode = false } = {}) {
  const checks = CHECKS.map(([id, label, test, action]) => ({ id, label, ready: test({ env, demoMode }), action }));
  const passed = checks.filter((check) => check.ready).length;
  return { ready: passed === checks.length, passed, total: checks.length, percent: Math.round((passed / checks.length) * 100), checks };
}
