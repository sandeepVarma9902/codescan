const TARGETS = new Set(['vite', 'nextjs', 'react-native']);
const EXECUTORS = new Set(['docker', 'local']);

export class PolicyRegistry {
  constructor(policies = []) {
    this.policies = new Map(policies.map(validatePolicy).map((policy) => [policy.accountId, policy]));
  }

  get(accountId) {
    return this.policies.get(accountId) || null;
  }

  static fromEnvironment(options = {}) {
    let policies = options.policies;
    if (!policies && process.env.MODERNIZER_ACCOUNT_POLICIES_JSON) {
      try { policies = JSON.parse(process.env.MODERNIZER_ACCOUNT_POLICIES_JSON); } catch { throw new Error('MODERNIZER_ACCOUNT_POLICIES_JSON must be valid JSON.'); }
    }
    return new PolicyRegistry(policies || []);
  }
}

export function assertPolicy(policy, input) {
  if (!policy) return;
  const repository = input.repository?.fullName;
  if (policy.allowedRepositories && (!repository || !policy.allowedRepositories.some((pattern) => repositoryMatches(pattern, repository)))) {
    throw httpError(403, 'Repository is not permitted by the account policy.');
  }
  if (policy.allowedTargets && !policy.allowedTargets.includes(input.target)) throw httpError(403, `The ${input.target} target is not permitted by the account policy.`);
  if (policy.allowedExecutors && !policy.allowedExecutors.includes(input.executor)) throw httpError(403, `The ${input.executor} executor is not permitted by the account policy.`);
  if (policy.maxRepairAttempts !== undefined && input.maxRepairAttempts > policy.maxRepairAttempts) throw httpError(403, `Repair attempts exceed the account policy maximum of ${policy.maxRepairAttempts}.`);
}

function validatePolicy(policy) {
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(policy?.accountId || '')) throw new Error('Policies require a valid accountId.');
  if (policy.allowedRepositories && (!Array.isArray(policy.allowedRepositories) || policy.allowedRepositories.some((value) => !/^[A-Za-z0-9_.-]+\/(?:[A-Za-z0-9_.-]+|\*)$/.test(value)))) throw new Error('allowedRepositories must contain owner/repository or owner/* patterns.');
  if (policy.allowedTargets && (!Array.isArray(policy.allowedTargets) || policy.allowedTargets.some((value) => !TARGETS.has(value)))) throw new Error('allowedTargets contains an unsupported target.');
  if (policy.allowedExecutors && (!Array.isArray(policy.allowedExecutors) || policy.allowedExecutors.some((value) => !EXECUTORS.has(value)))) throw new Error('allowedExecutors contains an unsupported executor.');
  if (policy.maxRepairAttempts !== undefined && (!Number.isInteger(policy.maxRepairAttempts) || policy.maxRepairAttempts < 0 || policy.maxRepairAttempts > 3)) throw new Error('maxRepairAttempts must be an integer from 0 to 3.');
  return structuredClone(policy);
}

function repositoryMatches(pattern, repository) {
  return pattern.endsWith('/*') ? repository.startsWith(pattern.slice(0, -1)) : repository === pattern;
}
function httpError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
