import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { migrate } from '../migrator.js';

export class GitHubDelivery {
  constructor({ client, workRoot = os.tmpdir(), migrateFn = migrate, runGit = git }) {
    this.client = client;
    this.workRoot = path.resolve(workRoot);
    this.migrate = migrateFn;
    this.git = runGit;
  }

  async deliver(job) {
    validateRepository(job.repository?.fullName);
    const { token, expiresAt } = await this.client.installationToken(job.repository.installationId);
    await fs.mkdir(this.workRoot, { recursive: true });
    const workspace = await fs.mkdtemp(path.join(this.workRoot, 'repo-upgrader-job-'));
    const repositoryRoot = path.join(workspace, 'repository');
    const askpass = path.join(workspace, 'askpass.sh');
    const base = job.repository.ref || 'main';
    const branch = `repo-upgrader/${job.target || 'vite'}-${job.id.slice(0, 8)}`;
    try {
      await fs.writeFile(askpass, '#!/bin/sh\ncase "$1" in *Username*) echo x-access-token ;; *) echo "$GITHUB_INSTALLATION_TOKEN" ;; esac\n', { mode: 0o700 });
      const auth = { GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0', GITHUB_INSTALLATION_TOKEN: token };
      this.git(workspace, ['clone', '--depth', '1', '--branch', base, '--single-branch', `https://github.com/${job.repository.fullName}.git`, repositoryRoot], auth);
      this.git(repositoryRoot, ['switch', '-c', branch]);
      const report = await this.migrate(repositoryRoot, { target: job.target || 'vite', executor: job.executor || 'docker', rollbackOnFailure: true, maxRepairAttempts: job.maxRepairAttempts ?? 1 });
      if (report.status !== 'succeeded') throw new Error(`Migration ended with status ${report.status}.`);
      this.git(repositoryRoot, ['add', '-A', '--', '.', ':(exclude).modernizer']);
      this.git(repositoryRoot, ['config', 'user.name', 'repo-upgrader[bot]']);
      this.git(repositoryRoot, ['config', 'user.email', 'repo-upgrader[bot]@users.noreply.github.com']);
      this.git(repositoryRoot, ['commit', '-m', `chore: modernize React app to ${job.target || 'vite'}`]);
      this.git(repositoryRoot, ['push', '--set-upstream', 'origin', branch], auth);
      const pullRequest = await this.client.createPullRequest(token, job.repository.fullName, { title: `Modernize React application to ${job.target || 'Vite'}`, head: branch, base, body: prBody(report) });
      return { branch, base, pullRequest, installationTokenExpiresAt: expiresAt, reportSummary: { status: report.status, changes: report.changes, repairs: report.repairs } };
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  }
}

function git(cwd, args, extraEnv = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...extraEnv }, timeout: 5 * 60 * 1000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed: ${`${result.stderr || result.stdout || ''}`.slice(-2000)}`);
  return result.stdout;
}

function validateRepository(fullName) { if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName || '')) throw new Error('Invalid GitHub repository name.'); }
function prBody(report) { return `## Automated modernization\n\nRepo Upgrader completed a deterministic migration.\n\n- Status: ${report.status}\n- Files changed: ${report.changes.length}\n- Repair recipes applied: ${report.repairs.length}\n- Verification passed: ${report.verification?.passed === true}\n\nReview the generated changes and CI results before merging.`; }
