import fs from 'node:fs/promises';
import path from 'node:path';
import { migrate } from '../src/migrator.js';

const [root, target = 'vite'] = process.argv.slice(2);
if (!root) throw new Error('A checked-out repository path is required.');
const report = await migrate(root, { target, executor: 'local', rollbackOnFailure: true, maxRepairAttempts: 1 });
const reportFile = path.join(root, 'repo-upgrader-report.json');
await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
await fs.rm(path.join(root, '.modernizer'), { recursive: true, force: true });
if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `report=${reportFile}\n`);
if (report.status !== 'succeeded') {
  console.error(`Migration did not succeed: ${report.status}`);
  process.exitCode = 2;
}
