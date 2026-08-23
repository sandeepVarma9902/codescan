import { promises as fs } from 'node:fs';
import path from 'node:path';

export const STATE_DIR = '.modernizer';

export async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function walk(root, options = {}) {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', STATE_DIR, ...(options.ignored || [])]);
  const files = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(root);
  return files.sort();
}

export function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
