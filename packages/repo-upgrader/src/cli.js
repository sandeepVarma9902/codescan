import path from 'node:path';
import { rollback } from './checkpoint.js';
import { migrate } from './migrator.js';
import { createPlan } from './planner.js';
import { scanRepository } from './scanner.js';
import { writeJson } from './utils.js';

export async function runCli(args) {
  const command = args[0];
  const root = path.resolve(value(args, '--repo') || '.');
  const target = value(args, '--target') || 'vite';
  if (!command || ['help', '--help', '-h'].includes(command)) return printHelp();
  if (command === 'scan') return output(await scanRepository(root), value(args, '--out'));
  if (command === 'plan') return output(createPlan(await scanRepository(root), target), value(args, '--out'));
  if (command === 'migrate') {
    const report = await migrate(root, { target, skipInstall: args.includes('--skip-install'), rollbackOnFailure: args.includes('--rollback-on-failure') });
    console.log(JSON.stringify(report, null, 2));
    if (!['succeeded', 'rolled-back'].includes(report.status)) process.exitCode = 2;
    return;
  }
  if (command === 'rollback') return console.log(`Restored checkpoint ${await rollback(root, value(args, '--checkpoint'))}`);
  throw new Error(`Unknown command: ${command}`);
}

function value(args, flag) { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }
async function output(data, file) { if (file) { await writeJson(path.resolve(file), data); console.log(`Wrote ${path.resolve(file)}`); } else console.log(JSON.stringify(data, null, 2)); }
function printHelp() { console.log(`repo-upgrader <command> [options]\n\nCommands:\n  scan      Inspect a React repository\n  plan      Generate a deterministic migration plan\n  migrate   Checkpoint, transform, and verify the repository\n  rollback  Restore a checkpoint\n\nOptions:\n  --repo <path>             Repository path (default: current directory)\n  --target vite|nextjs      Migration target (default: vite)\n  --out <file>              Write scan/plan JSON to a file\n  --skip-install            Skip dependency installation during verification\n  --rollback-on-failure     Automatically restore when verification fails\n  --checkpoint <id>         Checkpoint to restore (default: latest)\n`); }
