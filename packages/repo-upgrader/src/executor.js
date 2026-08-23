import { spawnSync } from 'node:child_process';

const SAFE_ENV_KEYS = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'ComSpec'];

export function execute(root, [command, args], options = {}) {
  const executor = options.executor || 'local';
  const specification = executor === 'docker'
    ? dockerCommand(root, command, args, options)
    : [command, args];
  const started = Date.now();
  const result = spawnSync(specification[0], specification[1], {
    cwd: root,
    encoding: 'utf8',
    env: safeEnvironment(),
    timeout: options.timeoutMs || 10 * 60 * 1000,
    maxBuffer: options.maxOutputBytes || 1024 * 1024
  });
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const output = redact(`${result.stdout || ''}${result.stderr || ''}${result.error ? `\n${result.error.message}` : ''}`);
  return {
    executor,
    command: executor === 'docker' ? `docker ${specification[1].join(' ')}` : [command, ...args].join(' '),
    status: result.status === 0 ? 'passed' : timedOut ? 'timed-out' : 'failed',
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - started,
    output: output.slice(-(options.reportOutputBytes || 8000))
  };
}

export function dockerCommand(root, command, args, options = {}) {
  const network = options.allowNetwork ? 'bridge' : 'none';
  const script = ['corepack enable', [command, ...args].map(shellQuote).join(' ')].join(' && ');
  return ['docker', ['run', '--rm', '--init', '--network', network, '--memory', options.memory || '2g', '--cpus', String(options.cpus || 2), '--pids-limit', '256', '--volume', `${root}:/workspace`, '--workdir', '/workspace', options.image || 'node:20-bookworm', 'bash', '-lc', script]];
}

function safeEnvironment() {
  const env = { CI: 'true', NODE_ENV: 'test', FORCE_COLOR: '0' };
  for (const key of SAFE_ENV_KEYS) if (process.env[key]) env[key] = process.env[key];
  return env;
}

function shellQuote(value) { return `'${String(value).replaceAll("'", `'\\''`)}'`; }
function redact(output) {
  return output.replace(/([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z0-9_]*\s*[=:]\s*)([^\s]+)/gi, '$1[REDACTED]');
}
