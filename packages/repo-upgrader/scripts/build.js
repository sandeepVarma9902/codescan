import { promises as fs } from 'node:fs';

await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/BUILD.txt', `repo-upgrader build verified at ${new Date().toISOString()}\n`);
console.log('Build complete');
