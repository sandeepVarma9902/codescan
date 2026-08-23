import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const GENESIS = '0'.repeat(64);

export class AuditLog {
  constructor(file) { this.file = path.resolve(file); this.events = []; }

  async load() {
    try {
      const text = await fs.readFile(this.file, 'utf8');
      this.events = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      this.verify();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  async record({ accountId, actorId, action, resourceType, resourceId, metadata = {} }) {
    const previousHash = this.events.at(-1)?.hash || GENESIS;
    const event = {
      id: randomUUID(),
      at: new Date().toISOString(),
      accountId: accountId || null,
      actorId: actorId || null,
      action,
      resourceType,
      resourceId: resourceId || null,
      metadata: sanitize(metadata),
      previousHash
    };
    event.hash = hash(event);
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await fs.appendFile(this.file, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    this.events.push(event);
    return structuredClone(event);
  }

  list({ accountId, action, limit = 100 } = {}) {
    return this.events.filter((event) => (!accountId || event.accountId === accountId) && (!action || event.action === action)).slice(-Math.max(1, Math.min(Number(limit) || 100, 500))).reverse().map((event) => structuredClone(event));
  }

  verify() {
    let previousHash = GENESIS;
    for (const event of this.events) {
      if (event.previousHash !== previousHash || event.hash !== hash(event)) throw new Error(`Audit log integrity check failed at event ${event.id || 'unknown'}.`);
      previousHash = event.hash;
    }
    return true;
  }
}

function hash({ hash: _hash, ...event }) { return createHash('sha256').update(JSON.stringify(event)).digest('hex'); }
function sanitize(value) {
  const safe = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (/key|secret|token|authorization/i.test(key)) continue;
    if (['string', 'number', 'boolean'].includes(typeof item) || item === null) safe[key] = item;
  }
  return safe;
}
