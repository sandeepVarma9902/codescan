import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AuditLog } from '../src/service/audit-log.js';

test('audit events form a durable, tenant-filtered hash chain', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-audit-'));
  const file = path.join(root, 'audit.jsonl');
  const log = await new AuditLog(file).load();
  const first = await log.record({ accountId: 'acme', actorId: 'admin', action: 'credential.created', resourceType: 'credential', resourceId: 'key-1' });
  const second = await log.record({ accountId: 'other', actorId: 'admin', action: 'migration.submitted', resourceType: 'job', resourceId: 'job-1' });
  assert.equal(second.previousHash, first.hash);
  assert.equal(log.list({ accountId: 'acme' }).length, 1);
  const restored = await new AuditLog(file).load();
  assert.equal(restored.verify(), true);
});

test('audit log detects mutation and strips sensitive metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-audit-tamper-'));
  const file = path.join(root, 'audit.jsonl');
  const log = await new AuditLog(file).load();
  const event = await log.record({ accountId: 'acme', action: 'test', resourceType: 'job', metadata: { target: 'vite', apiKey: 'secret', token: 'hidden' } });
  assert.deepEqual(event.metadata, { target: 'vite' });
  const text = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, text.replace('"target":"vite"', '"target":"nextjs"'));
  await assert.rejects(new AuditLog(file).load(), /integrity check failed/);
});
