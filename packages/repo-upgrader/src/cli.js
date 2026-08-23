import path from 'node:path';
import { rollback } from './checkpoint.js';
import { migrate } from './migrator.js';
import { createPlan } from './planner.js';
import { scanRepository } from './scanner.js';
import { writeJson } from './utils.js';
import { startService } from './service/server.js';

export async function runCli(args) {
  const command = args[0];
  const root = path.resolve(value(args, '--repo') || '.');
  const target = value(args, '--target') || 'vite';
  if (!command || ['help', '--help', '-h'].includes(command)) return printHelp();
  if (command === 'scan') return output(await scanRepository(root), value(args, '--out'));
  if (command === 'plan') return output(createPlan(await scanRepository(root), target), value(args, '--out'));
  if (command === 'migrate') {
    const report = await migrate(root, { target, skipInstall: args.includes('--skip-install'), rollbackOnFailure: args.includes('--rollback-on-failure'), force: args.includes('--force'), executor: value(args, '--executor') || 'local', timeoutMs: numberValue(args, '--timeout-ms', 600000), maxRepairAttempts: numberValue(args, '--max-repair-attempts', 0) });
    console.log(JSON.stringify(report, null, 2));
    if (!['succeeded', 'rolled-back'].includes(report.status)) process.exitCode = 2;
    return;
  }
  if (command === 'serve') {
    const service = await startService({ port: numberValue(args, '--port', 8787), host: value(args, '--host') || '127.0.0.1' });
    console.log(`Repo Upgrader service listening on http://${service.address.address}:${service.address.port}`);
    return;
  }
  if (command === 'rollback') return console.log(`Restored checkpoint ${await rollback(root, value(args, '--checkpoint'))}`);
  throw new Error(`Unknown command: ${command}`);
}

function value(args, flag) { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }
function numberValue(args, flag, fallback) { const parsed = Number(value(args, flag)); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
async function output(data, file) { if (file) { await writeJson(path.resolve(file), data); console.log(`Wrote ${path.resolve(file)}`); } else console.log(JSON.stringify(data, null, 2)); }
function printHelp() { console.log(`repo-upgrader <command> [options]\n\nCommands:\n  scan      Inspect a React repository\n  plan      Generate a deterministic migration plan\n  migrate   Checkpoint, transform, and verify the repository\n  rollback  Restore a checkpoint\n  serve     Start the authenticated migration job API\n\nOptions:\n  --repo <path>             Repository path (default: current directory)\n  --target <target>         vite, nextjs, or react-native (default: vite)\n  --out <file>              Write scan/plan JSON to a file\n  --skip-install            Skip dependency installation during verification\n  --rollback-on-failure     Automatically restore when verification fails\n  --force                   Proceed despite scanner blockers after review\n  --executor local|docker   Verification executor (default: local)\n  --timeout-ms <number>     Per-command timeout (default: 600000)\n  --max-repair-attempts <n> Bounded deterministic repair retries (max: 3)\n  --checkpoint <id>         Checkpoint to restore (default: latest)\n  --host <address>          Service bind address (default: 127.0.0.1)\n  --port <number>           Service port (default: 8787)\n`); }
