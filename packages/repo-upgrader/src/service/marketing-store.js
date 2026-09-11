import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class MarketingStore {
  constructor(file, { platformConfig } = {}) { this.file = file; this.platformConfig = platformConfig; this.items = []; }
  async load() { try { this.items = JSON.parse(await fs.readFile(this.file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; } return this; }
  list() { return structuredClone(this.items).reverse(); }
  async create(input, source = 'owner') { if (!['linkedin', 'x'].includes(input.channel)) throw bad('channel must be linkedin or x.'); const text = String(input.text || '').trim(); if (!text || text.length > 2800) throw bad('text must contain 1 to 2,800 characters.'); const item = { id: randomUUID(), channel: input.channel, text, status: 'draft', source, createdAt: new Date().toISOString() }; this.items.push(item); await this.save(); return structuredClone(item); }
  async approve(id) { if (this.platformConfig?.get().marketingMode !== 'approval-required') throw bad('Switch marketing to approval-required before approving drafts.'); const item = this.items.find((value) => value.id === id); if (!item) return null; item.status = 'approved'; item.approvedAt = new Date().toISOString(); await this.save(); return structuredClone(item); }
  async onMigrationSucceeded(job) { const config = this.platformConfig?.get(); if (!config?.marketingChannels?.length || this.items.some((item) => item.jobId === job.id)) return; const target = { vite: 'CRA to Vite', nextjs: 'React to Next.js', 'react-native': 'React to React Native' }[job.target] || 'software modernization'; for (const channel of config.marketingChannels) { const text = channel === 'x' ? `Another ${target} migration completed with automated checks and a rollback-safe workflow. Modernize with confidence. #SoftwareModernization #DevTools` : `A ${target} migration just completed through our verification-first modernization workflow. The process preserves a rollback path, validates the result, and keeps customer repository details private. We are building safer software upgrades for teams of every size.`; const item = await this.create({ channel, text }, 'migration-bot'); const stored = this.items.find((value) => value.id === item.id); stored.jobId = job.id; } await this.save(); }
  async save() { await fs.mkdir(path.dirname(this.file), { recursive: true }); await fs.writeFile(this.file, `${JSON.stringify(this.items, null, 2)}\n`, { mode: 0o600 }); }
}
function bad(message) { const error = new Error(message); error.statusCode = 400; return error; }
