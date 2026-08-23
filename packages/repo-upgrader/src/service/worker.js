import path from 'node:path';
import { migrate } from '../migrator.js';

export class JobWorker {
  constructor({ store, allowedRepositoryRoot, concurrency = 1 }) {
    this.store = store;
    this.allowedRoot = allowedRepositoryRoot ? path.resolve(allowedRepositoryRoot) : null;
    this.concurrency = Math.max(1, Math.min(Number(concurrency) || 1, 4));
    this.queue = [];
    this.active = 0;
  }

  enqueue(job) { this.queue.push(job.id); queueMicrotask(() => this.drain()); }

  async drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const id = this.queue.shift();
      this.active += 1;
      this.run(id).finally(() => { this.active -= 1; this.drain(); });
    }
  }

  async run(id) {
    const job = this.store.get(id);
    try {
      if (!job.repositoryPath) {
        await this.store.update(id, { status: 'awaiting-github-app', message: 'GitHub App installation-token exchange is required before cloning this repository.' });
        return;
      }
      const repositoryPath = path.resolve(job.repositoryPath);
      if (!this.allowedRoot || !isWithin(this.allowedRoot, repositoryPath)) throw new Error('Repository path is outside MODERNIZER_ALLOWED_REPO_ROOT.');
      await this.store.update(id, { status: 'running' });
      const report = await migrate(repositoryPath, { target: job.target, executor: job.executor || 'docker', rollbackOnFailure: true, maxRepairAttempts: job.maxRepairAttempts ?? 1 });
      await this.store.update(id, { status: report.status === 'succeeded' ? 'succeeded' : 'failed', report });
    } catch (error) {
      await this.store.update(id, { status: 'failed', error: error.message });
    }
  }
}

function isWithin(root, candidate) { const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
