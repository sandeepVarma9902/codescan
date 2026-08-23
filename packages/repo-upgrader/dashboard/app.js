const state={token:sessionStorage.getItem('repo-upgrader-token')||''};
const $=(id)=>document.getElementById(id);

$('connect-form').addEventListener('submit',async(event)=>{event.preventDefault();state.token=$('api-key').value.trim();sessionStorage.setItem('repo-upgrader-token',state.token);await load();});
$('refresh').addEventListener('click',load);
$('job-form').addEventListener('submit',async(event)=>{event.preventDefault();message('Starting migration…');try{const job=await api('/v1/jobs',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({repository:{fullName:$('repository').value.trim()},target:$('target').value})});message(`Migration queued: ${job.id}`);event.target.reset();await loadData();}catch(error){message(error.message,true);}});

async function api(path,options={}){const response=await fetch(path,{...options,headers:{authorization:`Bearer ${state.token}`,...options.headers}});const body=await response.json();if(!response.ok)throw new Error(body.error||`Request failed (${response.status})`);return body;}
async function load(){if(!state.token)return;try{await loadData();$('connect-card').hidden=true;$('workspace').hidden=false;$('connection').textContent='Connected';$('connection').classList.add('online');}catch(error){sessionStorage.removeItem('repo-upgrader-token');$('connection').textContent='Connection failed';$('connection').classList.remove('online');message(error.message,true);}}
async function loadData(){const[usage,analytics,jobs]=await Promise.all([api('/v1/usage'),api('/v1/analytics'),api('/v1/jobs?limit=20')]);$('month-count').textContent=`${usage.periodJobs} / ${Number.isFinite(usage.entitlements.monthlyJobs)?usage.entitlements.monthlyJobs:'∞'}`;$('success-rate').textContent=analytics.successRate===null?'—':`${Math.round(analytics.successRate*100)}%`;$('plan').textContent=usage.plan;$('total-count').textContent=analytics.totalMigrations;renderJobs(jobs.jobs);}
function renderJobs(jobs){$('jobs').innerHTML=jobs.length?jobs.map(job=>`<div class="job"><div><strong>${escape(job.repository?.fullName||job.repositoryPath||'Local repository')}</strong><small>${label(job.target)} · ${new Date(job.createdAt).toLocaleString()}</small></div><span class="badge ${escape(job.status)}">${escape(job.status)}</span></div>`).join(''):'<p class="empty">No migrations yet.</p>';}
function label(target){return {vite:'CRA → Vite',nextjs:'React → Next.js','react-native':'React → React Native'}[target]||target;}
function message(value,error=false){$('message').textContent=value;$('message').classList.toggle('error',error);}
function escape(value){const node=document.createElement('span');node.textContent=String(value);return node.innerHTML;}
if(state.token)load();
