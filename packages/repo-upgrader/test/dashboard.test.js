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

test('migration reports require ownership and a completed report', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'repo-upgrader-report-'));
  const store=await new JobStore(path.join(root,'jobs.json')).load();
  const pending=await store.create({accountId:'tenant-a',target:'vite'});
  const complete=await store.create({accountId:'tenant-a',target:'vite',report:{status:'succeeded',checks:[{name:'build',status:'passed'}]}});
  const service=await startService({apiKeys:[{key:'rk_tenant_a_dashboard_123',accountId:'tenant-a',plan:'starter'},{key:'rk_tenant_b_dashboard_123',accountId:'tenant-b',plan:'starter'}],port:0,store,worker:{enqueue(){},shutdown:async()=>true}});
  const base=`http://127.0.0.1:${service.address.port}`;
  const headers={authorization:'Bearer rk_tenant_a_dashboard_123'};
  assert.equal((await fetch(`${base}/v1/jobs/${pending.id}/report`,{headers})).status,409);
  const response=await fetch(`${base}/v1/jobs/${complete.id}/report`,{headers});
  assert.equal(response.status,200);
  assert.equal((await response.json()).checks[0].status,'passed');
  assert.equal((await fetch(`${base}/v1/jobs/${complete.id}/report`,{headers:{authorization:'Bearer rk_tenant_b_dashboard_123'}})).status,404);
  await service.close();
});
