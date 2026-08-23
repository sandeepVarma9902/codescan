import http from 'node:http';
import path from 'node:path';
import { JobStore } from './job-store.js';
import { JobWorker } from './worker.js';
import { jobFromGitHubDispatch, verifyGitHubSignature } from './github-webhook.js';

export async function startService(options = {}) {
  const token = options.token ?? process.env.MODERNIZER_API_TOKEN;
  if (!token) throw new Error('MODERNIZER_API_TOKEN is required.');
  const store = options.store || await new JobStore(options.storeFile || path.resolve('.modernizer-service/jobs.json')).load();
  const worker = options.worker || new JobWorker({ store, allowedRepositoryRoot: options.allowedRepositoryRoot ?? process.env.MODERNIZER_ALLOWED_REPO_ROOT, concurrency: options.concurrency ?? process.env.MODERNIZER_CONCURRENCY });
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
      const job = await context.store.create({ source: 'api', ...input });
      context.worker.enqueue(job);
      return json(response, 202, job);
    }
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
  const job = await context.store.create(input);
  context.worker.enqueue(job);
  return json(response, 202, job);
}

function validateJob(input) {
  if (!input || typeof input !== 'object') throw new Error('A JSON job payload is required.');
  if (!input.repositoryPath && !input.repository?.fullName) throw new Error('repositoryPath or repository.fullName is required.');
  if (input.target && !['vite', 'nextjs'].includes(input.target)) throw new Error('target must be vite or nextjs.');
  return { repositoryPath: input.repositoryPath, repository: input.repository, target: input.target || 'vite', executor: input.executor || 'docker', maxRepairAttempts: Math.min(Number(input.maxRepairAttempts) || 1, 3) };
}

function authorized(request, token) { return request.headers.authorization === `Bearer ${token}`; }
async function body(request) { return JSON.parse(await rawBody(request)); }
async function rawBody(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); const value = Buffer.concat(chunks); if (value.length > 1024 * 1024) throw new Error('Payload too large.'); return value; }
function json(response, status, value) { response.writeHead(status, { 'content-type': 'application/json' }); response.end(`${JSON.stringify(value)}\n`); }
