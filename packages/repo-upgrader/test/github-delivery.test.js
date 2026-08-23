import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GitHubAppClient } from '../src/service/github-app.js';
import { GitHubDelivery } from '../src/service/github-delivery.js';

test('GitHub App JWT is RS256 signed and short lived', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const client = new GitHubAppClient({ appId: 123, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const jwt = client.createJwt(2_000_000_000);
  const [header, payload, signature] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
  assert.equal(claims.iss, '123');
  assert.ok(claims.exp - claims.iat <= 600);
  assert.equal(createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature, 'base64url')), true);
});

test('GitHub delivery pushes a migration branch, opens a PR, and removes workspace', async () => {
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-delivery-'));
  const calls = [];
  const client = {
    async installationToken(id) { assert.equal(id, 42); return { token: 'short-lived', expiresAt: 'soon' }; },
    async createPullRequest(token, fullName, input) { calls.push(['pr', token, fullName, input]); return { number: 7, url: 'https://example.test/pr/7', state: 'open' }; }
  };
  const runGit = (cwd, args, env) => {
    calls.push(['git', cwd, args, env]);
    return '';
  };
  const delivery = new GitHubDelivery({ client, workRoot, runGit, migrateFn: async () => ({ status: 'succeeded', changes: ['package.json'], repairs: [], verification: { passed: true } }) });
  const result = await delivery.deliver({ id: '12345678-abcd', target: 'vite', repository: { fullName: 'owner/repo', ref: 'main', installationId: 42 } });
  assert.equal(result.pullRequest.number, 7);
  assert.ok(calls.some((call) => call[0] === 'git' && call[2][0] === 'push'));
  assert.equal((await fs.readdir(workRoot)).length, 0);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('short-lived'), false);
});

test('installation token errors never expose response tokens', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const client = new GitHubAppClient({ appId: 123, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), fetchImpl: async () => ({ ok: false, status: 403, async json() { return { token: 'must-not-leak', message: 'denied' }; } }) });
  await assert.rejects(client.installationToken(42), /failed \(403\)/);
});
