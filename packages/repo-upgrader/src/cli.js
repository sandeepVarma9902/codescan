import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
    let closing = false;
    const shutdown = async (signal) => {
      if (closing) return;
      closing = true;
      console.log(`Received ${signal}; draining active migrations.`);
      const { drained } = await service.close({ timeoutMs: 30_000 });
      if (!drained) { console.error('Shutdown deadline reached before all migrations completed.'); process.exitCode = 1; }
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
    return;
  }
  if (command === 'remote') return remote(args.slice(1));
  if (command === 'rollback') return console.log(`Restored checkpoint ${await rollback(root, value(args, '--checkpoint'))}`);
  throw new Error(`Unknown command: ${command}`);
}

function value(args, flag) { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }
function numberValue(args, flag, fallback) { const parsed = Number(value(args, flag)); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
async function output(data, file) { if (file) { await writeJson(path.resolve(file), data); console.log(`Wrote ${path.resolve(file)}`); } else console.log(JSON.stringify(data, null, 2)); }
async function remote(args) {
  const action = args[0];
  const baseUrl = (value(args, '--api-url') || process.env.REPO_UPGRADER_API_URL || '').replace(/\/$/, '');
  const apiKey = value(args, '--api-key') || process.env.REPO_UPGRADER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('--api-url and --api-key (or matching environment variables) are required.');
  const request = async (route, options = {}) => {
    const response = await fetch(`${baseUrl}${route}`, { ...options, headers: { authorization: `Bearer ${apiKey}`, ...options.headers } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Remote API returned HTTP ${response.status}.`);
    return result;
  };
  if (action === 'submit') {
    const repository = value(args, '--github-repo');
    if (!repository) throw new Error('--github-repo owner/name is required.');
    return output(await request('/v1/jobs', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': value(args, '--idempotency-key') || randomUUID() }, body: JSON.stringify({ repository: { fullName: repository }, target: value(args, '--target') || 'vite' }) }), value(args, '--out'));
  }
  if (action === 'jobs') return output(await request('/v1/jobs'), value(args, '--out'));
  if (action === 'usage') return output(await request('/v1/usage'), value(args, '--out'));
  throw new Error('remote action must be submit, jobs, or usage.');
}
function printHelp() { console.log(`repo-upgrader <command> [options]\n\nCommands:\n  scan      Inspect a React repository\n  plan      Generate a deterministic migration plan\n  migrate   Checkpoint, transform, and verify the repository\n  rollback  Restore a checkpoint\n  serve     Start the authenticated migration job API\n  remote    Submit and inspect hosted migrations\n\nOptions:\n  --repo <path>             Repository path (default: current directory)\n  --target <target>         vite, nextjs, or react-native (default: vite)\n  --out <file>              Write scan/plan JSON to a file\n  --skip-install            Skip dependency installation during verification\n  --rollback-on-failure     Automatically restore when verification fails\n  --force                   Proceed despite scanner blockers after review\n  --executor local|docker   Verification executor (default: local)\n  --timeout-ms <number>     Per-command timeout (default: 600000)\n  --max-repair-attempts <n> Bounded deterministic repair retries (max: 3)\n  --checkpoint <id>         Checkpoint to restore (default: latest)\n  --host <address>          Service bind address (default: 127.0.0.1)\n  --port <number>           Service port (default: 8787)\n\nRemote options:\n  --api-url <url>           Hosted service URL (or REPO_UPGRADER_API_URL)\n  --api-key <key>           API key (or REPO_UPGRADER_API_KEY)\n  --github-repo <owner/name> Repository to migrate\n  --idempotency-key <key>   Safe submission retry key (generated by default)\n`); }
