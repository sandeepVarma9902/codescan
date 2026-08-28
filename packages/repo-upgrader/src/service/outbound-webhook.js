import { createHmac, randomUUID } from 'node:crypto';

const EVENTS = new Set(['migration.queued', 'migration.awaiting-decision', 'migration.resumed', 'migration.running', 'migration.succeeded', 'migration.failed', 'migration.cancelled']);

export class WebhookDispatcher {
  constructor({ endpoints = [], transport = fetch, auditLog, attempts = 3, retryDelayMs = 250 } = {}) {
    this.endpoints = endpoints.map(validateEndpoint);
    this.transport = transport;
    this.auditLog = auditLog;
    this.attempts = Math.max(1, Math.min(Number(attempts) || 3, 5));
    this.retryDelayMs = Math.max(0, Number(retryDelayMs) || 0);
  }

  async dispatch(event, job) {
    if (!EVENTS.has(event)) throw new Error(`Unsupported webhook event: ${event}`);
    const endpoints = this.endpoints.filter((endpoint) => endpoint.accountId === job.accountId && (!endpoint.events || endpoint.events.includes(event)));
    return Promise.all(endpoints.map((endpoint) => this.deliver(endpoint, event, job)));
  }

  async deliver(endpoint, event, job) {
    const deliveryId = randomUUID();
    const payload = JSON.stringify({ id: deliveryId, type: event, createdAt: new Date().toISOString(), data: { job: publicJob(job) } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', endpoint.secret).update(`${timestamp}.${payload}`).digest('hex');
    let lastError;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        timeout.unref?.();
        let response;
        try {
          response = await this.transport(endpoint.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'repo-upgrader-webhooks/1.0', 'x-repo-upgrader-delivery': deliveryId, 'x-repo-upgrader-signature': `t=${timestamp},v1=${signature}` }, body: payload, signal: controller.signal });
        } finally { clearTimeout(timeout); }
        if (response.ok) {
          await this.record(job.accountId, deliveryId, event, endpoint.url, 'succeeded', attempt);
          return { deliveryId, status: 'succeeded', attempts: attempt };
        }
        lastError = new Error(`Webhook returned HTTP ${response.status}.`);
      } catch (error) { lastError = error; }
      if (attempt < this.attempts && this.retryDelayMs) await delay(this.retryDelayMs * (2 ** (attempt - 1)));
    }
    await this.record(job.accountId, deliveryId, event, endpoint.url, 'failed', this.attempts, lastError?.message);
    return { deliveryId, status: 'failed', attempts: this.attempts, error: lastError?.message };
  }

  record(accountId, deliveryId, event, url, status, attempts, error) {
    return this.auditLog?.record({ accountId, actorId: 'webhook-dispatcher', action: `webhook.${status}`, resourceType: 'webhook-delivery', resourceId: deliveryId, metadata: { event, origin: new URL(url).origin, attempts, error: error || null } });
  }

  static fromEnvironment(options = {}) {
    let endpoints = options.webhookEndpoints;
    if (!endpoints && process.env.MODERNIZER_OUTBOUND_WEBHOOKS_JSON) {
      try { endpoints = JSON.parse(process.env.MODERNIZER_OUTBOUND_WEBHOOKS_JSON); } catch { throw new Error('MODERNIZER_OUTBOUND_WEBHOOKS_JSON must be valid JSON.'); }
    }
    return new WebhookDispatcher({ endpoints: endpoints || [], transport: options.webhookTransport, auditLog: options.auditLog, attempts: options.webhookAttempts, retryDelayMs: options.webhookRetryDelayMs });
  }
}

function validateEndpoint(endpoint) {
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(endpoint?.accountId || '')) throw new Error('Webhook endpoints require a valid accountId.');
  const url = new URL(endpoint.url);
  if (url.protocol !== 'https:') throw new Error('Webhook endpoint URLs must use HTTPS.');
  if (!endpoint.secret || endpoint.secret.length < 16) throw new Error('Webhook secrets must contain at least 16 characters.');
  if (endpoint.events && (!Array.isArray(endpoint.events) || endpoint.events.some((event) => !EVENTS.has(event)))) throw new Error('Webhook endpoint contains an unsupported event.');
  return structuredClone(endpoint);
}

function publicJob(job) {
  return { id: job.id, status: job.status, target: job.target, repository: job.repository?.fullName || null, createdAt: job.createdAt, updatedAt: job.updatedAt, delivery: job.delivery || null };
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
