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

export async function startService(options = {}) {
  const accountStore = options.accountStore || await new AccountStore(options.accountStoreFile || path.resolve('.modernizer-service/accounts.json')).load();
  const policies = options.policyRegistry || PolicyRegistry.fromEnvironment(options);
  const planResolver = (accountId, fallback) => accountStore.getPlan(accountId, fallback);
  const credentialStore = options.credentialStore || await new CredentialStore(options.credentialStoreFile || path.resolve('.modernizer-service/credentials.json'), { planResolver }).load();
  const auditLog = options.auditLog || await new AuditLog(options.auditFile || path.resolve('.modernizer-service/audit.jsonl')).load();
  const webhooks = options.webhooks || WebhookDispatcher.fromEnvironment({ ...options, auditLog });
  const auth = options.auth || new CompositeAuth(ApiKeyRegistry.fromEnvironment({ ...options, planResolver }), credentialStore);
  const store = options.store || await new JobStore(options.storeFile || path.resolve('.modernizer-service/jobs.json')).load();
  const githubDelivery = options.githubDelivery || createGitHubDelivery(options);
  const worker = options.worker || new JobWorker({ store, githubDelivery, webhooks, allowedRepositoryRoot: options.allowedRepositoryRoot ?? process.env.MODERNIZER_ALLOWED_REPO_ROOT, concurrency: options.concurrency ?? process.env.MODERNIZER_CONCURRENCY });
  if (!options.worker) worker.resumeQueued();
  const server = http.createServer((request, response) => route(request, response, { auth, store, worker, accountStore, credentialStore, auditLog, webhooks, policies, webhookSecret: options.webhookSecret ?? process.env.MODERNIZER_WEBHOOK_SECRET, billingSecret: options.billingSecret ?? process.env.MODERNIZER_BILLING_WEBHOOK_SECRET }));
  const port = options.port ?? (Number(process.env.MODERNIZER_PORT) || 8787);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, options.host || '127.0.0.1', resolve); });
  return { server, store, worker, accountStore, credentialStore, auditLog, address: server.address() };
}

async function route(request, response, context) {
  try {
    if (request.method === 'GET' && request.url === '/healthz') return json(response, 200, { status: 'ok' });
    if (request.method === 'POST' && request.url === '/webhooks/github') return githubWebhook(request, response, context);
    if (request.method === 'POST' && request.url === '/webhooks/billing') return billingWebhook(request, response, context);
    const principal = context.auth.authenticate(request.headers.authorization);
    if (!principal) return json(response, 401, { error: 'unauthorized' });
    if (request.method === 'POST' && request.url === '/v1/api-keys') {
      requireAdmin(principal);
      const input = await body(request);
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
      const input = validateJob(await body(request));
      const idempotencyKey = request.headers['idempotency-key'];
      if (idempotencyKey && !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) throw new Error('Invalid Idempotency-Key.');
      const duplicate = idempotencyKey && context.store.findByIdempotencyKey(principal.accountId, idempotencyKey);
      if (duplicate) return json(response, 200, { ...duplicate, deduplicated: true });
      assertEntitled(principal, input.target, context.store.usage(principal.accountId));
      assertPolicy(context.policies.get(principal.accountId), input);
      const result = await context.store.createOrGet({ source: 'api', accountId: principal.accountId, plan: principal.plan, ...input }, idempotencyKey);
      if (result.created) {
        await audit(context, principal, 'migration.submitted', 'job', result.job.id, { target: result.job.target, repository: result.job.repository?.fullName || null });
        await context.webhooks.dispatch('migration.queued', result.job);
        context.worker.enqueue(result.job);
      }
      return json(response, result.created ? 202 : 200, { ...result.job, deduplicated: !result.created });
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/jobs?')) {
      const url = new URL(request.url, 'http://service');
      return json(response, 200, { jobs: context.store.list({ status: url.searchParams.get('status') || undefined, limit: url.searchParams.get('limit'), accountId: scope(principal) }) });
    }
    if (request.method === 'GET' && request.url === '/v1/jobs') return json(response, 200, { jobs: context.store.list({ accountId: scope(principal) }) });
    if (request.method === 'GET' && request.url === '/v1/usage') return json(response, 200, { plan: principal.plan, entitlements: principal.entitlements, ...context.store.usage(scope(principal)) });
    if (request.method === 'GET' && request.url === '/v1/analytics') return json(response, 200, context.store.analytics(scope(principal)));
    const cancel = request.method === 'DELETE' && request.url?.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i);
    if (cancel) { const existing = ownedJob(context.store, cancel[1], principal); if (!existing) return json(response, 404, { error: 'not_found' }); const cancelled = await context.store.cancel(cancel[1]); await audit(context, principal, 'migration.cancelled', 'job', cancelled.id, { target: cancelled.target }); await context.webhooks.dispatch('migration.cancelled', cancelled); return json(response, 200, cancelled); }
    const match = request.method === 'GET' && request.url?.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i);
    if (match) { const job = ownedJob(context.store, match[1], principal); return job ? json(response, 200, job) : json(response, 404, { error: 'not_found' }); }
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
  const duplicate = input.deliveryId && context.store.findByDeliveryId(input.deliveryId);
  if (duplicate) return json(response, 200, { ...duplicate, deduplicated: true });
  const job = await context.store.create(input);
  context.worker.enqueue(job);
  return json(response, 202, job);
}

function validateJob(input) {
  if (!input || typeof input !== 'object') throw new Error('A JSON job payload is required.');
  if (!input.repositoryPath && !input.repository?.fullName) throw new Error('repositoryPath or repository.fullName is required.');
  if (input.target && !['vite', 'nextjs', 'react-native'].includes(input.target)) throw new Error('target must be vite, nextjs, or react-native.');
  return { repositoryPath: input.repositoryPath, repository: input.repository, target: input.target || 'vite', executor: input.executor || 'docker', maxRepairAttempts: Math.min(Number(input.maxRepairAttempts) || 1, 3) };
}

function scope(principal) { return principal.role === 'admin' ? undefined : principal.accountId; }
function requireAdmin(principal) { if (principal.role !== 'admin') { const error = new Error('Administrator access is required.'); error.statusCode = 403; throw error; } }
function audit(context, principal, action, resourceType, resourceId, metadata) { return context.auditLog.record({ accountId: principal.accountId, actorId: principal.credentialId || principal.role, action, resourceType, resourceId, metadata }); }
function ownedJob(store, id, principal) { const job = store.get(id); return job && (principal.role === 'admin' || job.accountId === principal.accountId) ? job : null; }
async function body(request) { return JSON.parse(await rawBody(request)); }
async function rawBody(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); const value = Buffer.concat(chunks); if (value.length > 1024 * 1024) throw new Error('Payload too large.'); return value; }
function json(response, status, value) { response.writeHead(status, { 'content-type': 'application/json' }); response.end(`${JSON.stringify(value)}\n`); }

function createGitHubDelivery(options) {
  const appId = options.githubAppId ?? process.env.GITHUB_APP_ID;
  const privateKey = options.githubPrivateKey ?? process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;
  return new GitHubDelivery({ client: new GitHubAppClient({ appId, privateKey, apiUrl: options.githubApiUrl }), workRoot: options.workRoot ?? process.env.MODERNIZER_WORK_ROOT });
}
