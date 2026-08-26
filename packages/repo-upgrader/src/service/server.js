import http from 'node:http';
import path from 'node:path';
import { JobStore } from './job-store.js';
import { JobWorker } from './worker.js';
import { jobFromGitHubDispatch, verifyGitHubSignature } from './github-webhook.js';
import { GitHubAppClient } from './github-app.js';
import { GitHubDelivery } from './github-delivery.js';
import { ApiKeyRegistry, assertEntitled } from './auth.js';
import { AccountStore } from './account-store.js';
import { billingUpdateFromEvent, verifyBillingSignature } from './billing-webhook.js';
import { assertPolicy, PolicyRegistry } from './policy.js';
import { CompositeAuth, CredentialStore } from './credential-store.js';
import { AuditLog } from './audit-log.js';
import { WebhookDispatcher } from './outbound-webhook.js';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPostgresJobStore } from './postgres-job-store.js';
import { createRedisJobQueue } from './redis-job-queue.js';
import { DistributedWorker } from './distributed-worker.js';
import { prometheusMetrics } from './metrics.js';
import { createObjectReportStore } from './report-store.js';
import { createBillingPortal, githubInstallUrl, requirePermission } from './commercial.js';
import { migrateUploadedZip } from './upload-migration.js';

const DASHBOARD_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dashboard');
const OPENAPI_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../openapi.json');
const ACTION_WORKFLOW_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/repo-upgrader.yml');

export async function startService(options = {}) {
  const demoMode = options.demoMode ?? process.env.MODERNIZER_DEMO_MODE === 'true';
  const accountStore = options.accountStore || await new AccountStore(options.accountStoreFile || path.resolve('.modernizer-service/accounts.json')).load();
  const policies = options.policyRegistry || PolicyRegistry.fromEnvironment(options);
  const planResolver = (accountId, fallback) => accountStore.getPlan(accountId, fallback);
  const credentialStore = options.credentialStore || await new CredentialStore(options.credentialStoreFile || path.resolve('.modernizer-service/credentials.json'), { planResolver }).load();
  const auditLog = options.auditLog || await new AuditLog(options.auditFile || path.resolve('.modernizer-service/audit.jsonl')).load();
  const webhooks = options.webhooks || WebhookDispatcher.fromEnvironment({ ...options, auditLog });
  const auth = options.auth || (demoMode ? { authenticate: () => ({ accountId: 'public-demo', plan: 'pro', role: 'operator', entitlements: { monthlyJobs: 100, targets: ['vite', 'nextjs', 'react-native'] } }) } : new CompositeAuth(ApiKeyRegistry.fromEnvironment({ ...options, planResolver }), credentialStore));
  const database = !options.store && (options.databaseUrl || process.env.DATABASE_URL) ? await createPostgresJobStore(options.databaseUrl || process.env.DATABASE_URL) : null;
  const store = options.store || database?.store || await new JobStore(options.storeFile || path.resolve('.modernizer-service/jobs.json')).load();
  const githubDelivery = options.githubDelivery || createGitHubDelivery(options);
  const reportStore = options.reportStore || ((options.reportBucket || process.env.MODERNIZER_REPORT_BUCKET) ? await createObjectReportStore({ bucket: options.reportBucket, endpoint: options.s3Endpoint }) : null);
  const runner = new JobWorker({ store, githubDelivery, webhooks, reportStore, allowedRepositoryRoot: options.allowedRepositoryRoot ?? process.env.MODERNIZER_ALLOWED_REPO_ROOT, concurrency: options.concurrency ?? process.env.MODERNIZER_CONCURRENCY });
  const redis = !options.worker && (options.redisUrl || process.env.REDIS_URL) ? await createRedisJobQueue(options.redisUrl || process.env.REDIS_URL) : null;
  const worker = options.worker || (redis ? new DistributedWorker({ queue: redis.queue, runner, concurrency: options.concurrency ?? process.env.MODERNIZER_CONCURRENCY }).start() : runner);
  if (!options.worker && !redis) await worker.resumeQueued();
  const server = http.createServer((request, response) => route(request, response, { auth, demoMode, store, worker, accountStore, credentialStore, auditLog, webhooks, reportStore, policies, githubAppSlug: options.githubAppSlug ?? process.env.GITHUB_APP_SLUG, dashboardUrl: options.dashboardUrl ?? process.env.MODERNIZER_DASHBOARD_URL, stripeSecretKey: options.stripeSecretKey ?? process.env.STRIPE_SECRET_KEY, webhookSecret: options.webhookSecret ?? process.env.MODERNIZER_WEBHOOK_SECRET, billingSecret: options.billingSecret ?? process.env.MODERNIZER_BILLING_WEBHOOK_SECRET }));
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  const port = options.port ?? (Number(process.env.MODERNIZER_PORT) || 8787);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, options.host || '127.0.0.1', resolve); });
  const close = async (closeOptions) => {
    const drained = typeof worker.shutdown === 'function' ? await worker.shutdown(closeOptions) : true;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await redis?.close(); await database?.close();
    return { drained };
  };
  return { server, store, worker, accountStore, credentialStore, auditLog, address: server.address(), close };
}

async function route(request, response, context) {
  try {
    if (request.method === 'GET' && request.url === '/healthz') return json(response, 200, { status: 'ok', service: 'repo-upgrader', version: '3.0.0' });
    if (request.method === 'GET' && ['/dashboard', '/dashboard/'].includes(request.url)) return asset(response, 'index.html', 'text/html; charset=utf-8');
    if (request.method === 'GET' && request.url === '/dashboard/app.js') return asset(response, 'app.js', 'text/javascript; charset=utf-8');
    if (request.method === 'GET' && request.url === '/dashboard/styles.css') return asset(response, 'styles.css', 'text/css; charset=utf-8');
    if (request.method === 'GET' && request.url === '/openapi.json') { const value=await fs.readFile(OPENAPI_FILE);response.writeHead(200,{'content-type':'application/json','cache-control':'public, max-age=300'});return response.end(value); }
    if (request.method === 'GET' && request.url === '/github-actions.yml') { const value = await fs.readFile(ACTION_WORKFLOW_FILE); response.writeHead(200, { 'content-type': 'text/yaml; charset=utf-8', 'content-disposition': 'attachment; filename="repo-upgrader.yml"', 'x-content-type-options': 'nosniff' }); return response.end(value); }
    if (request.method === 'GET' && request.url === '/v1/demo-config') return json(response, 200, { enabled: context.demoMode, notice: context.demoMode ? 'Public preview: remote repositories are not cloned or executed.' : null });
    if (request.method === 'GET' && request.url === '/readyz') {
      const worker = typeof context.worker.status === 'function' ? context.worker.status() : { accepting: true };
      const ready = worker.accepting !== false;
      return json(response, ready ? 200 : 503, { status: ready ? 'ready' : 'draining', worker });
    }
    if (request.method === 'GET' && request.url === '/metrics') { const value = await prometheusMetrics(context.store, context.worker); response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }); return response.end(value); }
    if (request.method === 'POST' && request.url === '/webhooks/github') return githubWebhook(request, response, context);
    if (request.method === 'POST' && request.url === '/webhooks/billing') return billingWebhook(request, response, context);
    const principal = context.auth.authenticate(request.headers.authorization);
    if (!principal) return json(response, 401, { error: 'unauthorized' });
    if (request.method === 'POST' && request.url?.startsWith('/v1/upload-migrations')) {
      requirePermission(principal, 'submit');
      if (request.headers['content-type'] !== 'application/zip') throw Object.assign(new Error('Content-Type must be application/zip.'), { statusCode: 415 });
      const url = new URL(request.url, 'http://service');
      const result = await migrateUploadedZip(await rawBody(request, 10 * 1024 * 1024), url.searchParams.get('target') || 'vite');
      response.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${result.filename}"`, 'content-length': result.buffer.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-repo-upgrader-status': result.report.status });
      return response.end(result.buffer);
    }
    if (request.method === 'GET' && request.url === '/v1/integrations/github') { requirePermission(principal,'integrations'); const installUrl=githubInstallUrl({slug:context.githubAppSlug,accountId:principal.accountId,secret:context.webhookSecret}); return installUrl?json(response,200,{installUrl}):json(response,503,{error:'github_app_not_configured'}); }
    if (request.method === 'POST' && request.url === '/v1/billing/portal') { requirePermission(principal,'billing'); const account=context.accountStore.get(principal.accountId); const result=await createBillingPortal({secretKey:context.stripeSecretKey,customerId:account?.customerId,returnUrl:context.dashboardUrl||'http://127.0.0.1:8787/dashboard'}); return json(response,200,result); }
    if (request.method === 'POST' && request.url === '/v1/api-keys') {
      requirePermission(principal, 'credentials');
      const input = await body(request);
      if (principal.role !== 'platform-admin' && input.accountId !== principal.accountId) { const error=new Error('Credentials can only be created for your own account.');error.statusCode=403;throw error; }
      const result = await context.credentialStore.create({ accountId: input.accountId, plan: input.plan, role: input.role, name: input.name });
      await audit(context, principal, 'credential.created', 'credential', result.credential.id, { targetAccountId: input.accountId, role: result.credential.role });
      return json(response, 201, result);
    }
    if (request.method === 'GET' && request.url === '/v1/api-keys') {
      return json(response, 200, { credentials: context.credentialStore.list(scope(principal)) });
    }
    const revokeKey = request.method === 'DELETE' && request.url?.match(/^\/v1\/api-keys\/([a-f0-9-]+)$/i);
    if (revokeKey) {
      const credential = await context.credentialStore.revoke(revokeKey[1], scope(principal));
      if (credential) await audit(context, principal, 'credential.revoked', 'credential', credential.id, { targetAccountId: credential.accountId });
      return credential ? json(response, 200, credential) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/audit-events')) {
      const url = new URL(request.url, 'http://service');
      return json(response, 200, { events: context.auditLog.list({ accountId: scope(principal), action: url.searchParams.get('action') || undefined, limit: url.searchParams.get('limit') }) });
    }
    if (request.method === 'POST' && request.url === '/v1/jobs') {
      requirePermission(principal, 'submit');
      const input = validateJob(await body(request));
      if (context.demoMode && input.repositoryPath) { const error = new Error('Local repository execution is disabled in public demo mode.'); error.statusCode = 403; throw error; }
      const idempotencyKey = request.headers['idempotency-key'];
      if (idempotencyKey && !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) throw new Error('Invalid Idempotency-Key.');
      const duplicate = idempotencyKey && await context.store.findByIdempotencyKey(principal.accountId, idempotencyKey);
      if (duplicate) return json(response, 200, { ...duplicate, deduplicated: true });
      assertEntitled(principal, input.target, await context.store.usage(principal.accountId));
      assertPolicy(context.policies.get(principal.accountId), input);
      const result = await context.store.createOrGet({ source: 'api', accountId: principal.accountId, plan: principal.plan, ...input }, idempotencyKey);
      if (result.created) {
        await audit(context, principal, 'migration.submitted', 'job', result.job.id, { target: result.job.target, repository: result.job.repository?.fullName || null });
        await context.webhooks.dispatch('migration.queued', result.job);
        await context.worker.enqueue(result.job);
      }
      return json(response, result.created ? 202 : 200, { ...result.job, deduplicated: !result.created });
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/jobs?')) {
      const url = new URL(request.url, 'http://service');
      return json(response, 200, { jobs: await context.store.list({ status: url.searchParams.get('status') || undefined, limit: url.searchParams.get('limit'), accountId: scope(principal) }) });
    }
    if (request.method === 'GET' && request.url === '/v1/jobs') return json(response, 200, { jobs: await context.store.list({ accountId: scope(principal) }) });
    if (request.method === 'GET' && request.url === '/v1/usage') return json(response, 200, { plan: principal.plan, entitlements: principal.entitlements, ...await context.store.usage(scope(principal)) });
    if (request.method === 'GET' && request.url === '/v1/analytics') return json(response, 200, await context.store.analytics(scope(principal)));
    const cancel = request.method === 'DELETE' && request.url?.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i);
    if (cancel) { requirePermission(principal, 'cancel'); const existing = await ownedJob(context.store, cancel[1], principal); if (!existing) return json(response, 404, { error: 'not_found' }); const cancelled = await context.store.cancel(cancel[1]); await audit(context, principal, 'migration.cancelled', 'job', cancelled.id, { target: cancelled.target }); await context.webhooks.dispatch('migration.cancelled', cancelled); return json(response, 200, cancelled); }
    const match = request.method === 'GET' && request.url?.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i);
    if (match) { const job = await ownedJob(context.store, match[1], principal); return job ? json(response, 200, job) : json(response, 404, { error: 'not_found' }); }
    const report = request.method === 'GET' && request.url?.match(/^\/v1\/jobs\/([a-f0-9-]+)\/report$/i);
    if (report) { const job = await ownedJob(context.store, report[1], principal); if (!job) return json(response, 404, { error: 'not_found' }); const value = job.report || (job.reportRef && context.reportStore ? await context.reportStore.get(job.reportRef) : null); return value ? json(response, 200, value) : json(response, 409, { error: 'report_not_available' }); }
    return json(response, 404, { error: 'not_found' });
  } catch (error) { return json(response, error.statusCode || 400, { error: error.message }); }
}

async function billingWebhook(request, response, context) {
  const raw = await rawBody(request);
  if (!verifyBillingSignature(raw, request.headers['billing-signature'], context.billingSecret)) return json(response, 401, { error: 'invalid_signature' });
  const update = billingUpdateFromEvent(JSON.parse(raw));
  if (!update) return json(response, 202, { accepted: false });
  const result = await context.accountStore.apply(update);
  if (!result.deduplicated) await context.auditLog.record({ accountId: update.accountId, actorId: 'billing-webhook', action: 'subscription.updated', resourceType: 'account', resourceId: update.accountId, metadata: { plan: update.plan, status: update.status } });
  return json(response, 200, { accepted: true, accountId: update.accountId, plan: update.plan, deduplicated: result.deduplicated });
}

async function githubWebhook(request, response, context) {
  const raw = await rawBody(request);
  if (!verifyGitHubSignature(raw, request.headers['x-hub-signature-256'], context.webhookSecret)) return json(response, 401, { error: 'invalid_signature' });
  const input = jobFromGitHubDispatch(request.headers['x-github-event'], JSON.parse(raw));
  if (!input) return json(response, 202, { accepted: false });
  input.deliveryId = request.headers['x-github-delivery'];
  input.accountId = `github:${input.repository.installationId || 'uninstalled'}`;
  input.plan = 'trial';
  const duplicate = input.deliveryId && await context.store.findByDeliveryId(input.deliveryId);
  if (duplicate) return json(response, 200, { ...duplicate, deduplicated: true });
  const job = await context.store.create(input);
  await context.worker.enqueue(job);
  return json(response, 202, job);
}

function validateJob(input) {
  if (!input || typeof input !== 'object') throw new Error('A JSON job payload is required.');
  if (!input.repositoryPath && !input.repository?.fullName) throw new Error('repositoryPath or repository.fullName is required.');
  if (input.target && !['vite', 'nextjs', 'react-native'].includes(input.target)) throw new Error('target must be vite, nextjs, or react-native.');
  return { repositoryPath: input.repositoryPath, repository: input.repository, target: input.target || 'vite', executor: input.executor || 'docker', maxRepairAttempts: Math.min(Number(input.maxRepairAttempts) || 1, 3) };
}

function scope(principal) { return principal.role === 'platform-admin' ? undefined : principal.accountId; }
function audit(context, principal, action, resourceType, resourceId, metadata) { return context.auditLog.record({ accountId: principal.accountId, actorId: principal.credentialId || principal.role, action, resourceType, resourceId, metadata }); }
async function ownedJob(store, id, principal) { const job = await store.get(id); return job && (principal.role === 'platform-admin' || job.accountId === principal.accountId) ? job : null; }
async function body(request) { return JSON.parse(await rawBody(request)); }
async function rawBody(request, limit = 1024 * 1024) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > limit) { const error = new Error('Payload too large.'); error.statusCode = 413; throw error; } chunks.push(chunk); } return Buffer.concat(chunks); }
function json(response, status, value) { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(`${JSON.stringify(value)}\n`); }
async function asset(response, file, contentType) { const value = await fs.readFile(path.join(DASHBOARD_ROOT, file)); response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(value); }

function createGitHubDelivery(options) {
  const appId = options.githubAppId ?? process.env.GITHUB_APP_ID;
  const privateKey = options.githubPrivateKey ?? process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;
  return new GitHubDelivery({ client: new GitHubAppClient({ appId, privateKey, apiUrl: options.githubApiUrl }), workRoot: options.workRoot ?? process.env.MODERNIZER_WORK_ROOT });
}
