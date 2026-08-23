import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCheckpoint, rollback } from '../src/checkpoint.js';

test('checkpoint restores changed, removed, and newly created files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-checkpoint-'));
  await fs.writeFile(path.join(root, 'kept.txt'), 'original');
  await fs.writeFile(path.join(root, 'removed.txt'), 'restore me');
  const id = await createCheckpoint(root);
  await fs.writeFile(path.join(root, 'kept.txt'), 'changed');
  await fs.rm(path.join(root, 'removed.txt'));
  await fs.writeFile(path.join(root, 'new.txt'), 'remove me');
  await rollback(root, id);
  assert.equal(await fs.readFile(path.join(root, 'kept.txt'), 'utf8'), 'original');
  assert.equal(await fs.readFile(path.join(root, 'removed.txt'), 'utf8'), 'restore me');
  await assert.rejects(fs.access(path.join(root, 'new.txt')));
});
