import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CompositeAuth, CredentialStore } from '../src/service/credential-store.js';

test('managed API keys are shown once, stored as digests, and survive restart', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-credentials-'));
  const file = path.join(root, 'credentials.json');
  const store = await new CredentialStore(file).load();
  const created = await store.create({ accountId: 'acme', plan: 'starter', role: 'member', name: 'CI key' });
  assert.match(created.key, /^ru_live_/);
  assert.equal(created.credential.digest, undefined);
  const persisted = await fs.readFile(file, 'utf8');
  assert.equal(persisted.includes(created.key), false);
  const restored = await new CredentialStore(file).load();
  assert.equal(restored.authenticate(`Bearer ${created.key}`).accountId, 'acme');
  assert.equal(restored.list('acme')[0].name, 'CI key');
});

test('revocation is immediate, tenant scoped, and idempotent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-revoke-'));
  const store = await new CredentialStore(path.join(root, 'credentials.json')).load();
  const { key, credential } = await store.create({ accountId: 'acme', plan: 'pro' });
  assert.equal(await store.revoke(credential.id, 'other'), null);
  assert.equal((await store.revoke(credential.id, 'acme')).id, credential.id);
  assert.equal(store.authenticate(`Bearer ${key}`), null);
  assert.ok((await store.revoke(credential.id, 'acme')).revokedAt);
});

test('composite authentication supports bootstrap and managed credentials', async () => {
  const provider = { authenticate: (header) => header === 'Bearer bootstrap' ? { role: 'admin' } : null };
  const managed = { authenticate: (header) => header === 'Bearer managed' ? { role: 'member' } : null };
  const auth = new CompositeAuth(provider, managed);
  assert.equal(auth.authenticate('Bearer bootstrap').role, 'admin');
  assert.equal(auth.authenticate('Bearer managed').role, 'member');
});
