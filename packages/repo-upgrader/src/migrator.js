import path from 'node:path';
import { createCheckpoint, rollback } from './checkpoint.js';
import { createPlan } from './planner.js';
import { scanRepository } from './scanner.js';
import { transformCraToVite } from './transform.js';
import { verify } from './verifier.js';
import { STATE_DIR, writeJson } from './utils.js';

export async function migrate(root, options = {}) {
  const resolved = path.resolve(root);
  const scan = await scanRepository(resolved);
  const plan = createPlan(scan, options.target || 'vite');
  if (!plan.supported && !options.force) throw new Error(`${plan.reason || plan.preconditions.join('; ')} Use --force only after reviewing the reported risks.`);
  const checkpointId = await createCheckpoint(resolved);
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), migration: plan.migration, status: 'running', checkpointId, forced: Boolean(options.force), scan, plan, changes: [], verification: null };
  try {
    report.changes = await transformCraToVite(resolved);
    report.verification = await verify(resolved, scan.project.packageManager, options);
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
