import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JobStore } from '../src/service/job-store.js';
import { startService } from '../src/service/server.js';

test('dashboard assets are served without authentication and API data stays protected', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'repo-upgrader-dashboard-'));
  const store=await new JobStore(path.join(root,'jobs.json')).load();
  const service=await startService({token:'test-token',port:0,store,worker:{enqueue(){},shutdown:async()=>true}});
  const base=`http://127.0.0.1:${service.address.port}`;
  const page=await fetch(`${base}/dashboard`);
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-type'),/text\/html/);
  assert.match(await page.text(),/Modernization control panel/);
  assert.equal((await fetch(`${base}/dashboard/app.js`)).status,200);
  assert.equal((await fetch(`${base}/v1/jobs`)).status,401);
  await service.close();
});
