import path from 'node:path';
import { exists, readJson, writeJson } from './utils.js';
import { promises as fs } from 'node:fs';

export async function applyDeterministicRepairs(root, verification) {
  const repairs = [];
  const failedOutput = verification.checks.filter((check) => check.status !== 'passed').map((check) => check.output).join('\n');
  const packageFile = path.join(root, 'package.json');
  const pkg = await readJson(packageFile);

  if (Object.values(pkg.scripts || {}).some((script) => script.includes('react-scripts'))) {
    if (pkg.scripts.start?.includes('react-scripts')) pkg.scripts.start = 'vite';
    if (pkg.scripts.build?.includes('react-scripts')) pkg.scripts.build = 'vite build';
    if (pkg.scripts.test?.includes('react-scripts')) pkg.scripts.test = 'vitest run';
    await writeJson(packageFile, pkg);
    repairs.push({ recipe: 'remove-stale-react-scripts', files: ['package.json'] });
  }

  if (/vite\.config|@vitejs\/plugin-react/i.test(failedOutput) && !(await exists(path.join(root, 'vite.config.js')))) {
    await fs.writeFile(path.join(root, 'vite.config.js'), "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n");
    repairs.push({ recipe: 'restore-vite-config', files: ['vite.config.js'] });
  }
  return repairs;
}
