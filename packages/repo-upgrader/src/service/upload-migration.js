import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { scanRepository } from '../scanner.js';
import { createPlan } from '../planner.js';
import { transformCraToVite } from '../transform.js';
import { transformReactToNext } from '../nextjs-transform.js';
import { transformReactToNative } from '../react-native-transform.js';

const MAX_FILES = 2_000;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

export async function migrateUploadedZip(input, target) {
  if (!['vite', 'nextjs', 'react-native'].includes(target)) throw httpError(400, 'target must be vite, nextjs, or react-native.');
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-upgrader-upload-'));
  try {
    const zip = new AdmZip(input);
    const entries = zip.getEntries();
    if (entries.length > MAX_FILES) throw httpError(413, `ZIP contains more than ${MAX_FILES} entries.`);
    let total = 0;
    for (const entry of entries) {
      const relative = safeEntry(entry.entryName);
      if (entry.isDirectory) continue;
      const data = entry.getData();
      total += data.length;
      if (total > MAX_UNCOMPRESSED_BYTES) throw httpError(413, 'Uncompressed project exceeds 50 MB.');
      const destination = path.join(workspace, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, data, { mode: 0o600 });
    }
    const root = await findProjectRoot(workspace);
    const scan = await scanRepository(root);
    const plan = createPlan(scan, target);
    if (!plan.supported) throw httpError(422, plan.reason || plan.preconditions?.join('; ') || 'No supported migration recipe was found.');
    const changes = target === 'vite' ? await transformCraToVite(root) : target === 'nextjs' ? await transformReactToNext(root) : await transformReactToNative(root, { analysis: scan.reactNative });
    const report = { schemaVersion: 1, mode: 'uploaded-zip', status: 'transformed-unverified', safety: 'No project scripts or dependencies were executed by the public upload service.', target, scan, plan, changes, generatedAt: new Date().toISOString() };
    await fs.writeFile(path.join(root, 'repo-upgrader-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    const output = new AdmZip();
    output.addLocalFolder(root);
    return { buffer: output.toBuffer(), report, filename: `${safeName(scan.project.name)}-${target}.zip` };
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
}

function safeEntry(name) {
  const normalized = String(name).replaceAll('\\', '/').replace(/\/$/, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((segment) => segment === '..' || segment === '')) throw httpError(400, `Unsafe ZIP entry: ${name}`);
  return normalized;
}
async function findProjectRoot(workspace) {
  const matches = [];
  async function visit(directory, depth = 0) {
    if (depth > 3) return;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === '__MACOSX' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === 'package.json') matches.push(directory);
      else if (entry.isDirectory()) await visit(absolute, depth + 1);
    }
  }
  await visit(workspace);
  if (matches.length !== 1) throw httpError(400, matches.length ? 'ZIP must contain exactly one React project.' : 'No package.json was found in the uploaded ZIP.');
  return matches[0];
}
function safeName(value) { return String(value || 'migrated-project').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'migrated-project'; }
function httpError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
