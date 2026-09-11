import fs from 'node:fs/promises';
import path from 'node:path';
import { PLANS } from './auth.js';

export class AccountStore {
  constructor(file) {
    this.file = file;
    this.accounts = new Map();
    this.events = new Set();
    this.creditDebits = new Set();
  }

  async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      for (const account of data.accounts || []) this.accounts.set(account.accountId, account);
      for (const eventId of data.events || []) this.events.add(eventId);
      for (const reference of data.creditDebits || []) this.creditDebits.add(reference);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  getPlan(accountId, fallback = 'unpaid') { const account = this.accounts.get(accountId); return account?.plan === 'unpaid' && account.migrationCredits > 0 ? 'single' : account?.plan || fallback; }
  get(accountId) { const account = this.accounts.get(accountId); return account ? structuredClone(account) : null; }
  hasConsumedCredit(accountId, reference) { return this.creditDebits.has(`${accountId}:${reference}`); }

  hasEvent(eventId) {
    return this.events.has(eventId);
  }

  async consumeCredit(accountId, reference) {
    if (!reference) throw new Error('A credit consumption reference is required.');
    const ledgerKey = `${accountId}:${reference}`;
    if (this.creditDebits.has(ledgerKey)) return this.get(accountId);
    const account = this.accounts.get(accountId);
    if (!account || !(account.migrationCredits > 0)) throw httpError(402, 'No prepaid migration credits remain.');
    const next = { ...account, migrationCredits: account.migrationCredits - 1, updatedAt: new Date().toISOString() };
    this.accounts.set(accountId, next);
    this.creditDebits.add(ledgerKey);
    await this.persist();
    return structuredClone(next);
  }

  async apply({ eventId, accountId, plan, customerId, subscriptionId, status, creditDelta = 0 }) {
    if (!eventId || !accountId || !PLANS[plan]) throw new Error('Invalid billing account update.');
    if (this.events.has(eventId)) return { account: this.accounts.get(accountId), deduplicated: true };
    const previous = this.accounts.get(accountId);
    creditDelta = Number(creditDelta || 0);
    const effectivePlan = creditDelta > 0 && ['team', 'business', 'enterprise'].includes(previous?.plan) ? previous.plan : plan;
    const account = {
      accountId,
      plan: effectivePlan,
      customerId: customerId || null,
      subscriptionId: subscriptionId || null,
      status: status || 'active',
      migrationCredits: Math.max(0, Number(previous?.migrationCredits || 0) + creditDelta),
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
    const value = `${JSON.stringify({ version: 2, accounts: [...this.accounts.values()], events: [...this.events], creditDebits: [...this.creditDebits] }, null, 2)}\n`;
    await fs.writeFile(temporary, value, { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }
}
function httpError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
