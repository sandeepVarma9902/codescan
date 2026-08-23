import { readJson } from './utils.js';
import path from 'node:path';
import { execute } from './executor.js';

export async function verify(root, packageManager, options = {}) {
  const pkg = await readJson(path.join(root, 'package.json'));
  const checks = [];
  if (!options.skipInstall) {
    checks.push(run(root, installCommand(packageManager), 'install', { ...options, allowNetwork: true }));
    if (checks.at(-1).status !== 'passed') return { passed: false, checks };
  }
  checks.push(run(root, scriptCommand(packageManager, 'build'), 'build', options));
  if (checks.at(-1).status !== 'passed') return { passed: false, checks };
  if (pkg.scripts?.test) checks.push(run(root, scriptCommand(packageManager, 'test', true), 'test', options));
  if (checks.at(-1)?.status !== 'passed') return { passed: false, checks };
  if (pkg.scripts?.lint) checks.push(run(root, scriptCommand(packageManager, 'lint'), 'lint', options));
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

function run(root, command, name, options) {
  return { name, ...execute(root, command, options) };
}
