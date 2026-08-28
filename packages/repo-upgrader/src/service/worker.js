import path from 'node:path';
import { migrate } from '../migrator.js';
import { detectDecisionBlockers } from './blocker-decisions.js';

export class JobWorker {
  constructor({ store, allowedRepositoryRoot, concurrency = 1, githubDelivery = null, webhooks = null, reportStore = null }) {
    this.store = store;
    this.allowedRoot = allowedRepositoryRoot ? path.resolve(allowedRepositoryRoot) : null;
    this.concurrency = Math.max(1, Math.min(Number(concurrency) || 1, 4));
    this.githubDelivery = githubDelivery;
    this.webhooks = webhooks;
    this.reportStore = reportStore;
    this.queue = [];
    this.active = 0;
    this.accepting = true;
    this.idleWaiters = [];
  }

  enqueue(job) {
    if (!this.accepting) throw new Error('Worker is shutting down.');
    this.queue.push(job.id);
    queueMicrotask(() => this.drain());
  }

  async resumeQueued() { for (const job of await this.store.list({ status: 'queued', limit: 100 })) await this.enqueue(job); }

  async drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const id = this.queue.shift();
      this.active += 1;
      this.run(id).finally(() => { this.active -= 1; this.drain(); this.resolveIdle(); });
    }
  }

  async run(id) {
    const job = await this.store.get(id);
    if (!job || job.status !== 'queued') return;
    try {
      if (!job.repositoryPath) {
        if (!this.githubDelivery) {
          await this.update(id, { status: 'awaiting-github-app', message: 'Configure GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY to enable delivery.' });
          return;
        }
        await this.update(id, { status: 'running' });
        const delivery = await this.githubDelivery.deliver(job);
        await this.update(id, { status: 'succeeded', delivery });
        return;
      }
      const repositoryPath = path.resolve(job.repositoryPath);
      if (!this.allowedRoot || !isWithin(this.allowedRoot, repositoryPath)) throw new Error('Repository path is outside MODERNIZER_ALLOWED_REPO_ROOT.');
      if (!job.decisionsApprovedAt) {
        const blockers = await detectDecisionBlockers(repositoryPath, job.target);
        if (blockers.length) {
          await this.update(id, { status: 'awaiting-decision', blockers, message: `${blockers.length} migration decision${blockers.length === 1 ? '' : 's'} require approval.` });
          return;
        }
      }
      await this.update(id, { status: 'running' });
      const report = await migrate(repositoryPath, { target: job.target, executor: job.executor || 'docker', rollbackOnFailure: true, maxRepairAttempts: job.maxRepairAttempts ?? 1, decisions: job.decisions || [] });
      report.decisions = job.decisions || [];
      report.blockers = job.blockers || [];
      const reportRef = this.reportStore ? await this.reportStore.put(job.accountId || 'default', id, report) : null;
      await this.update(id, { status: report.status === 'succeeded' ? 'succeeded' : 'failed', ...(reportRef ? { reportRef, reportSummary: { status: report.status, checks: report.verification?.length || report.checks?.length || 0 } } : { report }) });
    } catch (error) {
      await this.update(id, { status: 'failed', error: error.message });
    }
  }

  async update(id, patch) {
    const job = await this.store.update(id, patch);
    if (this.webhooks && ['awaiting-decision', 'running', 'succeeded', 'failed'].includes(job.status)) await this.webhooks.dispatch(`migration.${job.status}`, job);
    return job;
  }

  status() { return { accepting: this.accepting, active: this.active, queued: this.queue.length }; }

  async shutdown({ timeoutMs = 30_000 } = {}) {
    this.accepting = false;
    if (this.active === 0 && this.queue.length === 0) return true;
    let timeout;
    const idle = new Promise((resolve) => this.idleWaiters.push(resolve));
    const expired = new Promise((resolve) => { timeout = setTimeout(() => resolve(false), timeoutMs); timeout.unref?.(); });
    const result = await Promise.race([idle.then(() => true), expired]);
    clearTimeout(timeout);
    return result;
  }

  resolveIdle() {
    if (this.active || this.queue.length) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}

function isWithin(root, candidate) { const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
