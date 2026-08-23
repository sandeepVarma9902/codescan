import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JobStore {
  constructor(file) { this.file = path.resolve(file); this.jobs = new Map(); this.writeChain = Promise.resolve(); }

  async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.jobs = new Map(data.jobs.map((job) => [job.id, job]));
      let recovered = false;
      const now = new Date().toISOString();
      for (const [id, job] of this.jobs) {
        if (job.status !== 'running') continue;
        this.jobs.set(id, { ...job, status: 'interrupted', updatedAt: now, events: [...job.events, { at: now, status: 'interrupted' }] });
        recovered = true;
      }
      if (recovered) await this.persist();
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return this;
  }

  async create(input) {
    const now = new Date().toISOString();
    const job = { id: randomUUID(), status: 'queued', createdAt: now, updatedAt: now, ...input, events: [{ at: now, status: 'queued' }] };
    this.jobs.set(job.id, job);
    await this.persist();
    return structuredClone(job);
  }

  async createOrGet(input, idempotencyKey) {
    if (idempotencyKey) {
      const existing = [...this.jobs.values()].find((job) => job.idempotencyKey === idempotencyKey && job.accountId === input.accountId);
      if (existing) return { job: structuredClone(existing), created: false };
    }
    return { job: await this.create({ ...input, ...(idempotencyKey ? { idempotencyKey } : {}) }), created: true };
  }

  get(id) { const job = this.jobs.get(id); return job ? structuredClone(job) : null; }

  list({ status, limit = 50, accountId } = {}) {
    return [...this.jobs.values()].filter((job) => (!status || job.status === status) && (!accountId || job.accountId === accountId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(1, Math.min(Number(limit) || 50, 100))).map((job) => structuredClone(job));
  }

  findByDeliveryId(deliveryId) { const job = [...this.jobs.values()].find((item) => item.deliveryId === deliveryId); return job ? structuredClone(job) : null; }
  findByIdempotencyKey(accountId, idempotencyKey) { const job = [...this.jobs.values()].find((item) => item.accountId === accountId && item.idempotencyKey === idempotencyKey); return job ? structuredClone(job) : null; }

  usage(accountId, now = new Date()) {
    const jobs = [...this.jobs.values()].filter((job) => !accountId || job.accountId === accountId);
    const period = now.toISOString().slice(0, 7);
    const periodJobs = jobs.filter((job) => job.createdAt.startsWith(period)).length;
    const byStatus = {};
    for (const job of jobs) byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    return { accountId: accountId || null, period, periodJobs, totalJobs: jobs.length, byStatus, successfulMigrations: byStatus.succeeded || 0, failedMigrations: byStatus.failed || 0 };
  }

  async cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (!['queued', 'awaiting-github-app'].includes(job.status)) throw new Error(`Job cannot be cancelled from status ${job.status}.`);
    return this.update(id, { status: 'cancelled' });
  }

  async update(id, patch) {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`Unknown job: ${id}`);
    if (patch.status && patch.status !== current.status && !allowedTransition(current.status, patch.status)) throw new Error(`Invalid job transition: ${current.status} -> ${patch.status}`);
    const now = new Date().toISOString();
    const next = { ...current, ...patch, id, updatedAt: now, events: [...current.events, { at: now, status: patch.status || current.status }] };
    this.jobs.set(id, next);
    await this.persist();
    return structuredClone(next);
  }

  async persist() {
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, jobs: [...this.jobs.values()] }, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temporary, this.file);
    });
    return this.writeChain;
  }
}

const TRANSITIONS = {
  queued: ['running', 'awaiting-github-app', 'cancelled', 'failed'],
  'awaiting-github-app': ['queued', 'cancelled', 'failed'],
  running: ['succeeded', 'failed', 'interrupted'],
  interrupted: ['queued', 'failed'],
  cancelled: [], succeeded: [], failed: []
};
function allowedTransition(from, to) { return (TRANSITIONS[from] || []).includes(to); }
