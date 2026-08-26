import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { migrateUploadedZip } from '../src/service/upload-migration.js';

function craZip(prefix = 'project/') {
  const zip = new AdmZip();
  zip.addFile(`${prefix}package.json`, Buffer.from(JSON.stringify({ name: 'uploaded-cra', scripts: { start: 'react-scripts start', build: 'react-scripts build' }, dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', 'react-scripts': '5.0.1' } })));
  zip.addFile(`${prefix}public/index.html`, Buffer.from('<div id="root"></div></body>'));
  zip.addFile(`${prefix}src/index.jsx`, Buffer.from('const api = process.env.REACT_APP_API;'));
  return zip;
}

test('uploaded CRA ZIP is transformed and returned without executing project scripts', async () => {
  const result = await migrateUploadedZip(craZip().toBuffer(), 'vite');
  const output = new AdmZip(result.buffer);
  const pkg = JSON.parse(output.readAsText('package.json'));
  assert.equal(result.report.status, 'transformed-unverified');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.match(output.readAsText('vite.config.js'), /defineConfig/);
  assert.match(output.readAsText('repo-upgrader-report.json'), /No project scripts or dependencies were executed/);
});

test('uploaded ZIP must contain exactly one project', async () => {
  const zip = craZip('one/');
  zip.addFile('two/package.json', Buffer.from('{"name":"second"}'));
  await assert.rejects(migrateUploadedZip(zip.toBuffer(), 'vite'), /exactly one React project/);
});
