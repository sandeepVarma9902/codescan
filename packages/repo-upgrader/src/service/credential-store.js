import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { PLANS } from './auth.js';

export class CredentialStore {
  constructor(file, { planResolver } = {}) {
    this.file = path.resolve(file);
    this.planResolver = planResolver;
    this.credentials = new Map();
  }

  async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      for (const credential of data.credentials || []) this.credentials.set(credential.id, credential);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  authenticate(header) {
    if (!header?.startsWith('Bearer ')) return null;
    const candidate = digest(header.slice(7));
    const credential = [...this.credentials.values()].find((entry) => !entry.revokedAt && safeEqual(entry.digest, candidate));
    if (!credential) return null;
    const plan = this.planResolver?.(credential.accountId, credential.plan) || credential.plan;
    return { accountId: credential.accountId, plan, role: credential.role, entitlements: PLANS[plan], credentialId: credential.id };
  }

  async create({ accountId, plan = 'free', role = 'operator', name = 'API key' }) {
    validate({ accountId, plan, role, name });
    const secret = `ru_live_${randomBytes(24).toString('base64url')}`;
    const now = new Date().toISOString();
    const credential = { id: randomUUID(), accountId, plan, role, name, prefix: secret.slice(0, 12), digest: digest(secret), createdAt: now, revokedAt: null };
    this.credentials.set(credential.id, credential);
    await this.persist();
    return { key: secret, credential: publicCredential(credential) };
  }

  list(accountId) {
    return [...this.credentials.values()].filter((entry) => !accountId || entry.accountId === accountId).map(publicCredential);
  }

  async revoke(id, accountId) {
    const credential = this.credentials.get(id);
    if (!credential || (accountId && credential.accountId !== accountId)) return null;
    if (!credential.revokedAt) {
      credential.revokedAt = new Date().toISOString();
      await this.persist();
    }
    return publicCredential(credential);
  }

  async persist() {
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify({ version: 1, credentials: [...this.credentials.values()] }, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }
}

export class CompositeAuth {
  constructor(...providers) { this.providers = providers.filter(Boolean); }
  authenticate(header) {
    for (const provider of this.providers) {
      const principal = provider.authenticate(header);
      if (principal) return principal;
    }
    return null;
  }
}

function validate(value) {
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(value.accountId || '')) throw new Error('A valid accountId is required.');
  if (!PLANS[value.plan]) throw new Error(`Unknown plan: ${value.plan}`);
  if (!['owner', 'admin', 'operator', 'viewer', 'member'].includes(value.role)) throw new Error('role must be owner, admin, operator, or viewer.');
  if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 80) throw new Error('name must contain 1 to 80 characters.');
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function safeEqual(left, right) { const a = Buffer.from(left, 'hex'); const b = Buffer.from(right, 'hex'); return a.length === b.length && timingSafeEqual(a, b); }
function publicCredential({ digest: _digest, ...credential }) { return structuredClone(credential); }
