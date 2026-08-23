import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists, readJson, STATE_DIR, timestamp, walk, writeJson } from './utils.js';

export async function createCheckpoint(root) {
  const id = timestamp();
  const checkpointRoot = path.join(root, STATE_DIR, 'checkpoints', id);
  const files = await walk(root);
  const manifest = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    const destination = path.join(checkpointRoot, 'files', rel);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(file, destination);
    manifest.push(rel);
  }
  await writeJson(path.join(checkpointRoot, 'manifest.json'), { id, createdAt: new Date().toISOString(), files: manifest });
  await writeJson(path.join(root, STATE_DIR, 'latest.json'), { checkpointId: id });
  return id;
}

export async function rollback(root, checkpointId) {
  let id = checkpointId;
  if (!id) id = (await readJson(path.join(root, STATE_DIR, 'latest.json'))).checkpointId;
  const checkpointRoot = path.join(root, STATE_DIR, 'checkpoints', id);
  const manifestFile = path.join(checkpointRoot, 'manifest.json');
  if (!(await exists(manifestFile))) throw new Error(`Checkpoint not found: ${id}`);
  const manifest = await readJson(manifestFile);
  const current = await walk(root);
  const original = new Set(manifest.files);
  for (const file of current) {
    const rel = path.relative(root, file);
    if (!original.has(rel)) await fs.rm(file);
  }
  for (const rel of manifest.files) {
    const source = path.join(checkpointRoot, 'files', rel);
    const destination = path.join(root, rel);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  return id;
}
