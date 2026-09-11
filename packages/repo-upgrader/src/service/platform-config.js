import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULTS = Object.freeze({ accessMode: 'paid', complimentaryPlan: 'team', complimentaryAccounts: [], marketingMode: 'draft-only', marketingChannels: ['linkedin', 'x'] });

export class PlatformConfig {
  constructor(file, initial = {}) { this.file = file; this.value = validate({ ...DEFAULTS, ...initial }); }
  async load() { try { this.value = validate({ ...DEFAULTS, ...JSON.parse(await fs.readFile(this.file, 'utf8')) }); } catch (error) { if (error.code !== 'ENOENT') throw error; } return this; }
  get() { return structuredClone(this.value); }
  async update(input) { this.value = validate({ ...this.value, ...input }); await fs.mkdir(path.dirname(this.file), { recursive: true }); await fs.writeFile(this.file, `${JSON.stringify(this.value, null, 2)}\n`, { mode: 0o600 }); return this.get(); }
  resolvePlan(accountId, paidPlan = 'unpaid') { if (paidPlan !== 'unpaid') return paidPlan; if (this.value.accessMode === 'free') return this.value.complimentaryPlan; if (this.value.accessMode === 'invite-only' && this.value.complimentaryAccounts.includes(accountId)) return this.value.complimentaryPlan; return paidPlan; }
}

function validate(input) {
  if (!['paid', 'free', 'invite-only'].includes(input.accessMode)) throw bad('accessMode must be paid, free, or invite-only.');
  if (!['team', 'business'].includes(input.complimentaryPlan)) throw bad('complimentaryPlan must be team or business.');
  if (!['draft-only', 'approval-required'].includes(input.marketingMode)) throw bad('marketingMode must be draft-only or approval-required.');
  if (!Array.isArray(input.complimentaryAccounts) || input.complimentaryAccounts.some((value) => !/^[A-Za-z0-9_.:-]{1,128}$/.test(value))) throw bad('complimentaryAccounts must contain valid account IDs.');
  if (!Array.isArray(input.marketingChannels) || input.marketingChannels.some((value) => !['linkedin', 'x'].includes(value))) throw bad('marketingChannels may contain linkedin and x.');
  return { accessMode: input.accessMode, complimentaryPlan: input.complimentaryPlan, complimentaryAccounts: [...new Set(input.complimentaryAccounts)], marketingMode: input.marketingMode, marketingChannels: [...new Set(input.marketingChannels)] };
}
function bad(message) { const error = new Error(message); error.statusCode = 400; return error; }
