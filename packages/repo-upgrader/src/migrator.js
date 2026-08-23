import path from 'node:path';
import { createCheckpoint, rollback } from './checkpoint.js';
import { createPlan } from './planner.js';
import { scanRepository } from './scanner.js';
import { transformCraToVite } from './transform.js';
import { verify } from './verifier.js';
import { applyDeterministicRepairs } from './repair.js';
import { transformReactToNext } from './nextjs-transform.js';
import { STATE_DIR, writeJson } from './utils.js';

export async function migrate(root, options = {}) {
  const resolved = path.resolve(root);
  const scan = await scanRepository(resolved);
  const plan = createPlan(scan, options.target || 'vite');
  if ((options.target || 'vite') === 'react-native') throw new Error('React Native conversion is analysis-only in v0.9; run plan --target react-native and satisfy its native-platform gates first.');
  if (!plan.supported && !options.force) throw new Error(`${plan.reason || plan.preconditions.join('; ')} Use --force only after reviewing the reported risks.`);
  const checkpointId = await createCheckpoint(resolved);
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), migration: plan.migration, status: 'running', checkpointId, forced: Boolean(options.force), executionPolicy: { executor: options.executor || 'local', timeoutMs: options.timeoutMs || 600000, maxRepairAttempts: options.maxRepairAttempts || 0 }, scan, plan, changes: [], repairs: [], verificationRuns: [], verification: null };
  try {
    report.changes = targetTransform(options.target || 'vite') === 'nextjs' ? await transformReactToNext(resolved) : await transformCraToVite(resolved);
    const maxRepairs = Math.max(0, Math.min(Number(options.maxRepairAttempts) || 0, 3));
    for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
      report.verification = await verify(resolved, scan.project.packageManager, options);
      report.verificationRuns.push({ attempt, ...report.verification });
      if (report.verification.passed || attempt === maxRepairs) break;
      const repairs = await applyDeterministicRepairs(resolved, report.verification);
      report.repairs.push(...repairs.map((repair) => ({ attempt: attempt + 1, ...repair })));
      if (repairs.length === 0) break;
    }
    report.status = report.verification.passed ? 'succeeded' : 'verification-failed';
    if (!report.verification.passed && options.rollbackOnFailure) {
      await rollback(resolved, checkpointId);
      report.status = 'rolled-back';
    }
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    if (options.rollbackOnFailure) { await rollback(resolved, checkpointId); report.status = 'rolled-back'; }
  }
  report.finishedAt = new Date().toISOString();
  const reportFile = path.join(resolved, STATE_DIR, 'reports', `${checkpointId}.json`);
  await writeJson(reportFile, report);
  report.reportFile = reportFile;
  return report;
}

function targetTransform(target) { return target === 'nextjs' ? 'nextjs' : 'vite'; }
