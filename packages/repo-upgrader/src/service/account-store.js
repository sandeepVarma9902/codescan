import fs from 'node:fs/promises';
import path from 'node:path';
import { PLANS } from './auth.js';

export class AccountStore {
  constructor(file) {
    this.file = file;
    this.accounts = new Map();
    this.events = new Set();
  }

  async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      for (const account of data.accounts || []) this.accounts.set(account.accountId, account);
      for (const eventId of data.events || []) this.events.add(eventId);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  getPlan(accountId, fallback = 'free') {
    return this.accounts.get(accountId)?.plan || fallback;
  }

  hasEvent(eventId) {
    return this.events.has(eventId);
  }

  async apply({ eventId, accountId, plan, customerId, subscriptionId, status }) {
    if (!eventId || !accountId || !PLANS[plan]) throw new Error('Invalid billing account update.');
    if (this.events.has(eventId)) return { account: this.accounts.get(accountId), deduplicated: true };
    const account = {
      accountId,
      plan,
      customerId: customerId || null,
      subscriptionId: subscriptionId || null,
      status: status || 'active',
      updatedAt: new Date().toISOString()
    };
    this.accounts.set(accountId, account);
    this.events.add(eventId);
    await this.persist();
    return { account, deduplicated: false };
  }

  async persist() {
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    const value = `${JSON.stringify({ version: 1, accounts: [...this.accounts.values()], events: [...this.events] }, null, 2)}\n`;
    await fs.writeFile(temporary, value, { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }
}
