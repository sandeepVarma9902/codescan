import http from 'node:http';
import path from 'node:path';
import { JobStore } from './job-store.js';
import { JobWorker } from './worker.js';
import { jobFromGitHubDispatch, verifyGitHubSignature } from './github-webhook.js';
import { GitHubAppClient } from './github-app.js';
import { GitHubDelivery } from './github-delivery.js';

export async function startService(options = {}) {
  const token = options.token ?? process.env.MODERNIZER_API_TOKEN;
  if (!token) throw new Error('MODERNIZER_API_TOKEN is required.');
  const store = options.store || await new JobStore(options.storeFile || path.resolve('.modernizer-service/jobs.json')).load();
  const githubDelivery = options.githubDelivery || createGitHubDelivery(options);
  const worker = options.worker || new JobWorker({ store, githubDelivery, allowedRepositoryRoot: options.allowedRepositoryRoot ?? process.env.MODERNIZER_ALLOWED_REPO_ROOT, concurrency: options.concurrency ?? process.env.MODERNIZER_CONCURRENCY });
  if (!options.worker) worker.resumeQueued();
  const server = http.createServer((request, response) => route(request, response, { token, store, worker, webhookSecret: options.webhookSecret ?? process.env.MODERNIZER_WEBHOOK_SECRET }));
  const port = options.port ?? (Number(process.env.MODERNIZER_PORT) || 8787);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, options.host || '127.0.0.1', resolve); });
  return { server, store, worker, address: server.address() };
}

async function route(request, response, context) {
  try {
    if (request.method === 'GET' && request.url === '/healthz') return json(response, 200, { status: 'ok' });
    if (request.method === 'POST' && request.url === '/webhooks/github') return githubWebhook(request, response, context);
    if (!authorized(request, context.token)) return json(response, 401, { error: 'unauthorized' });
    if (request.method === 'POST' && request.url === '/v1/jobs') {
      const input = validateJob(await body(request));
      const idempotencyKey = request.headers['idempotency-key'];
      if (idempotencyKey && !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) throw new Error('Invalid Idempotency-Key.');
      const result = await context.store.createOrGet({ source: 'api', ...input }, idempotencyKey);
      if (result.created) context.worker.enqueue(result.job);
      return json(response, result.created ? 202 : 200, { ...result.job, deduplicated: !result.created });
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/jobs?')) {
      const url = new URL(request.url, 'http://service');
      return json(response, 200, { jobs: context.store.list({ status: url.searchParams.get('status') || undefined, limit: url.searchParams.get('limit') }) });
    }
    if (request.method === 'GET' && request.url === '/v1/jobs') return json(response, 200, { jobs: context.store.list() });
    if (request.method === 'GET' && request.url === '/v1/usage') return json(response, 200, context.store.usage());
    const cancel = request.method === 'DELETE' && request.url?.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i);
    if (cancel) { const job = await context.store.cancel(cancel[1]); return job ? json(response, 200, job) : json(response, 404, { error: 'not_found' }); }
    const match = request.method === 'GET' && request.url?.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i);
    if (match) { const job = context.store.get(match[1]); return job ? json(response, 200, job) : json(response, 404, { error: 'not_found' }); }
    return json(response, 404, { error: 'not_found' });
  } catch (error) { return json(response, 400, { error: error.message }); }
}

async function githubWebhook(request, response, context) {
  const raw = await rawBody(request);
  if (!verifyGitHubSignature(raw, request.headers['x-hub-signature-256'], context.webhookSecret)) return json(response, 401, { error: 'invalid_signature' });
  const input = jobFromGitHubDispatch(request.headers['x-github-event'], JSON.parse(raw));
  if (!input) return json(response, 202, { accepted: false });
  input.deliveryId = request.headers['x-github-delivery'];
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

function authorized(request, token) { return request.headers.authorization === `Bearer ${token}`; }
async function body(request) { return JSON.parse(await rawBody(request)); }
async function rawBody(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); const value = Buffer.concat(chunks); if (value.length > 1024 * 1024) throw new Error('Payload too large.'); return value; }
function json(response, status, value) { response.writeHead(status, { 'content-type': 'application/json' }); response.end(`${JSON.stringify(value)}\n`); }

function createGitHubDelivery(options) {
  const appId = options.githubAppId ?? process.env.GITHUB_APP_ID;
  const privateKey = options.githubPrivateKey ?? process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;
  return new GitHubDelivery({ client: new GitHubAppClient({ appId, privateKey, apiUrl: options.githubApiUrl }), workRoot: options.workRoot ?? process.env.MODERNIZER_WORK_ROOT });
}
