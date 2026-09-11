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
    const account = this.accounts.get(accountId);
    if (account?.plan === 'trial' && account.trialEndsAt && Date.now() >= new Date(account.trialEndsAt).getTime()) return 'free';
    return account?.plan || fallback;
  }
  get(accountId) { const account = this.accounts.get(accountId); return account ? structuredClone(account) : null; }

  hasEvent(eventId) {
    return this.events.has(eventId);
  }

  async startTrial(accountId, { days = PLANS.trial.trialDays } = {}) {
    const existing = this.accounts.get(accountId);
    if (existing?.trialStartedAt || existing?.plan === 'trial') throw httpError(409, 'The free trial has already been used for this account.');
    if (existing && !['free'].includes(existing.plan) && ['active', 'trialing'].includes(existing.status)) throw httpError(409, 'Paid accounts cannot replace their subscription with a free trial.');
    const startedAt = new Date();
    const account = { ...existing, accountId, plan: 'trial', status: 'trialing', trialStartedAt: startedAt.toISOString(), trialEndsAt: new Date(startedAt.getTime() + days * 86400000).toISOString(), updatedAt: startedAt.toISOString() };
    this.accounts.set(accountId, account);
    await this.persist();
    return structuredClone(account);
  }

  async apply({ eventId, accountId, plan, customerId, subscriptionId, status }) {
    if (!eventId || !accountId || !PLANS[plan]) throw new Error('Invalid billing account update.');
    if (this.events.has(eventId)) return { account: this.accounts.get(accountId), deduplicated: true };
    const previous = this.accounts.get(accountId);
    const account = {
      accountId,
      plan,
      customerId: customerId || null,
      subscriptionId: subscriptionId || null,
      status: status || 'active',
      trialStartedAt: previous?.trialStartedAt || null,
      trialEndsAt: previous?.trialEndsAt || null,
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
function httpError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
