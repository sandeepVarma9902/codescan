import path from 'node:path';
import { createCheckpoint, rollback } from './checkpoint.js';
import { createPlan } from './planner.js';
import { scanRepository } from './scanner.js';
import { transformCraToVite } from './transform.js';
import { verify } from './verifier.js';
import { applyDeterministicRepairs } from './repair.js';
import { transformReactToNext } from './nextjs-transform.js';
import { transformReactToNative } from './react-native-transform.js';
import { STATE_DIR, writeJson } from './utils.js';

export async function migrate(root, options = {}) {
  const resolved = path.resolve(root);
  const scan = await scanRepository(resolved);
  const plan = createPlan(scan, options.target || 'vite');
  if ((options.target || 'vite') === 'react-native' && !plan.supported) throw new Error('React Native conversion is limited to automatically eligible projects; resolve every blocker and non-infrastructure warning first.');
  if (!plan.supported && !options.force) throw new Error(`${plan.reason || plan.preconditions.join('; ')} Use --force only after reviewing the reported risks.`);
  const checkpointId = await createCheckpoint(resolved);
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), migration: plan.migration, status: 'running', checkpointId, forced: Boolean(options.force), executionPolicy: { executor: options.executor || 'local', timeoutMs: options.timeoutMs || 600000, maxRepairAttempts: options.maxRepairAttempts || 0 }, scan, plan, changes: [], repairs: [], verificationRuns: [], verification: null };
  try {
    report.changes = await transformFor(options.target || 'vite', resolved);
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

function transformFor(target, root) {
  if (target === 'nextjs') return transformReactToNext(root);
  if (target === 'react-native') return transformReactToNative(root);
  return transformCraToVite(root);
}
