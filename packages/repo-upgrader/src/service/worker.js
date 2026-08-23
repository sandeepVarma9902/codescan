import path from 'node:path';
import { migrate } from '../migrator.js';

export class JobWorker {
  constructor({ store, allowedRepositoryRoot, concurrency = 1, githubDelivery = null, webhooks = null }) {
    this.store = store;
    this.allowedRoot = allowedRepositoryRoot ? path.resolve(allowedRepositoryRoot) : null;
    this.concurrency = Math.max(1, Math.min(Number(concurrency) || 1, 4));
    this.githubDelivery = githubDelivery;
    this.webhooks = webhooks;
    this.queue = [];
    this.active = 0;
  }

  enqueue(job) { this.queue.push(job.id); queueMicrotask(() => this.drain()); }

  resumeQueued() { for (const job of this.store.list({ status: 'queued', limit: 100 })) this.enqueue(job); }

  async drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const id = this.queue.shift();
      this.active += 1;
      this.run(id).finally(() => { this.active -= 1; this.drain(); });
    }
  }

  async run(id) {
    const job = this.store.get(id);
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
      await this.update(id, { status: 'running' });
      const report = await migrate(repositoryPath, { target: job.target, executor: job.executor || 'docker', rollbackOnFailure: true, maxRepairAttempts: job.maxRepairAttempts ?? 1 });
      await this.update(id, { status: report.status === 'succeeded' ? 'succeeded' : 'failed', report });
    } catch (error) {
      await this.update(id, { status: 'failed', error: error.message });
    }
  }

  async update(id, patch) {
    const job = await this.store.update(id, patch);
    if (this.webhooks && ['running', 'succeeded', 'failed'].includes(job.status)) await this.webhooks.dispatch(`migration.${job.status}`, job);
    return job;
  }
}

function isWithin(root, candidate) { const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
