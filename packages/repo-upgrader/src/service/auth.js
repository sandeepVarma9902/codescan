import { createHash, timingSafeEqual } from 'node:crypto';

export const PLANS = {
  free: { monthlyJobs: 3, targets: ['vite'] },
  starter: { monthlyJobs: 25, targets: ['vite', 'nextjs'] },
  pro: { monthlyJobs: 100, targets: ['vite', 'nextjs', 'react-native'] },
  enterprise: { monthlyJobs: Infinity, targets: ['vite', 'nextjs', 'react-native'] }
};

export class ApiKeyRegistry {
  constructor({ legacyToken, keys = [] } = {}) {
    this.entries = keys.map(validateEntry).map((entry) => ({ ...entry, digest: digest(entry.key), key: undefined }));
    if (legacyToken) this.entries.push({ accountId: 'default', plan: 'enterprise', role: 'admin', digest: digest(legacyToken) });
    if (this.entries.length === 0) throw new Error('MODERNIZER_API_TOKEN or MODERNIZER_API_KEYS_JSON is required.');
  }

  authenticate(header) {
    if (!header?.startsWith('Bearer ')) return null;
    const candidate = digest(header.slice(7));
    const entry = this.entries.find((item) => timingSafeEqual(item.digest, candidate));
    return entry ? { accountId: entry.accountId, plan: entry.plan, role: entry.role || 'member', entitlements: PLANS[entry.plan] } : null;
  }

  static fromEnvironment(options = {}) {
    let keys = options.apiKeys;
    if (!keys && process.env.MODERNIZER_API_KEYS_JSON) {
      try { keys = JSON.parse(process.env.MODERNIZER_API_KEYS_JSON); } catch { throw new Error('MODERNIZER_API_KEYS_JSON must be valid JSON.'); }
    }
    return new ApiKeyRegistry({ legacyToken: options.token ?? process.env.MODERNIZER_API_TOKEN, keys: keys || [] });
  }
}

export function assertEntitled(principal, target, usage) {
  if (!principal.entitlements.targets.includes(target)) throw httpError(403, `The ${principal.plan} plan does not include ${target} migrations.`);
  if (usage.periodJobs >= principal.entitlements.monthlyJobs) throw httpError(429, `Monthly migration quota reached for the ${principal.plan} plan.`);
}

function validateEntry(entry) {
  if (!entry?.key || !/^[A-Za-z0-9_.:-]{16,}$/.test(entry.key)) throw new Error('Configured API keys must contain at least 16 safe characters.');
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(entry.accountId || '')) throw new Error('Configured API keys require a valid accountId.');
  if (!PLANS[entry.plan]) throw new Error(`Unknown plan: ${entry.plan}`);
  return entry;
}
function digest(value) { return createHash('sha256').update(value).digest(); }
function httpError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
