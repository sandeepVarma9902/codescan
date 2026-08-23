import { spawnSync } from 'node:child_process';
import { readJson } from './utils.js';
import path from 'node:path';

export async function verify(root, packageManager, options = {}) {
  const pkg = await readJson(path.join(root, 'package.json'));
  const checks = [];
  if (!options.skipInstall) checks.push(run(root, installCommand(packageManager), 'install'));
  checks.push(run(root, scriptCommand(packageManager, 'build'), 'build'));
  if (pkg.scripts?.test) checks.push(run(root, scriptCommand(packageManager, 'test', true), 'test'));
  if (pkg.scripts?.lint) checks.push(run(root, scriptCommand(packageManager, 'lint'), 'lint'));
  return { passed: checks.every((check) => check.status === 'passed'), checks };
}

function installCommand(pm) {
  if (pm === 'yarn') return ['yarn', ['install']];
  if (pm === 'pnpm') return ['pnpm', ['install', '--frozen-lockfile=false']];
  if (pm === 'bun') return ['bun', ['install']];
  return ['npm', ['install']];
}

function scriptCommand(pm, name, ci = false) {
  if (pm === 'yarn') return ['yarn', [name]];
  if (pm === 'pnpm') return ['pnpm', [name]];
  if (pm === 'bun') return ['bun', ['run', name]];
  return ['npm', ['run', name, ...(ci ? ['--', '--watchAll=false'] : [])]];
}

function run(root, [command, args], name) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
  return { name, command: [command, ...args].join(' '), status: result.status === 0 ? 'passed' : 'failed', exitCode: result.status, durationMs: Date.now() - started, output: `${result.stdout || ''}${result.stderr || ''}`.slice(-4000) };
}
