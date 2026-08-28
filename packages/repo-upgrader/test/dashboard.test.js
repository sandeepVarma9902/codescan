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
  assert.equal((await fetch(`${base}/dashboard/decisions.css`)).status,200);
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

test('blocker decisions are tenant scoped, audited, and resume the job', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'repo-upgrader-decisions-'));
  const store=await new JobStore(path.join(root,'jobs.json')).load();
  const queued=await store.create({accountId:'tenant-a',target:'react-native'});
  const blocker={id:'router-1',category:'library-incompatibility',dependency:'react-router-dom',status:'open',options:[{id:'expo-router',label:'Use Expo Router',kind:'recommended'}]};
  await store.update(queued.id,{status:'awaiting-decision',blockers:[blocker]});
  const enqueued=[];
  const service=await startService({apiKeys:[{key:'rk_tenant_a_decisions_123',accountId:'tenant-a',plan:'pro'},{key:'rk_tenant_b_decisions_123',accountId:'tenant-b',plan:'pro'}],port:0,store,worker:{enqueue(job){enqueued.push(job);},shutdown:async()=>true},auditFile:path.join(root,'audit.jsonl')});
  const base=`http://127.0.0.1:${service.address.port}`;
  const denied=await fetch(`${base}/v1/jobs/${queued.id}/decisions`,{method:'POST',headers:{authorization:'Bearer rk_tenant_b_decisions_123','content-type':'application/json'},body:'{"mode":"recommended"}'});
  assert.equal(denied.status,404);
  const response=await fetch(`${base}/v1/jobs/${queued.id}/decisions`,{method:'POST',headers:{authorization:'Bearer rk_tenant_a_decisions_123','content-type':'application/json'},body:'{"mode":"recommended"}'});
  assert.equal(response.status,202);
  const resumed=await response.json();
  assert.equal(resumed.status,'queued');
  assert.equal(resumed.blockers[0].status,'resolved');
  assert.equal(resumed.decisions[0].optionId,'expo-router');
  assert.equal(enqueued.length,1);
  assert.equal(service.auditLog.list({accountId:'tenant-a'})[0].action,'migration.decisions-approved');
  await service.close();
});
