import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JobStore {
  constructor(file) { this.file = path.resolve(file); this.jobs = new Map(); this.writeChain = Promise.resolve(); }

  async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.jobs = new Map(data.jobs.map((job) => [job.id, job]));
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

  get(id) { const job = this.jobs.get(id); return job ? structuredClone(job) : null; }

  async update(id, patch) {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`Unknown job: ${id}`);
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
