export class RepoUpgraderClient{
 constructor({baseUrl,apiKey,transport=fetch}){this.baseUrl=baseUrl.replace(/\/$/,'');this.apiKey=apiKey;this.transport=transport;}
 async request(path,options={}){const response=await this.transport(`${this.baseUrl}${path}`,{...options,headers:{authorization:`Bearer ${this.apiKey}`,...options.headers}});const value=await response.json();if(!response.ok){const error=new Error(value.error||`HTTP ${response.status}`);error.status=response.status;throw error;}return value;}
 submit(input,{idempotencyKey=crypto.randomUUID()}={}){return this.request('/v1/jobs',{method:'POST',headers:{'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify(input)});}
 jobs({status,limit}={}){const query=new URLSearchParams(Object.entries({status,limit}).filter(([,v])=>v!==undefined));return this.request(`/v1/jobs${query.size?`?${query}`:''}`);}
 job(id){return this.request(`/v1/jobs/${encodeURIComponent(id)}`);}
 cancel(id){return this.request(`/v1/jobs/${encodeURIComponent(id)}`,{method:'DELETE'});}
 usage(){return this.request('/v1/usage');}analytics(){return this.request('/v1/analytics');}
 report(id){return this.request(`/v1/jobs/${encodeURIComponent(id)}/report`);}
}
