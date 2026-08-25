export class RedisJobQueue {
  constructor(client,{namespace='repo-upgrader',visibilityTimeoutMs=900000}={}){this.client=client;this.pending=`${namespace}:pending`;this.processing=`${namespace}:processing`;this.leases=`${namespace}:leases`;this.visibilityTimeoutMs=visibilityTimeoutMs;}
  async enqueue(job){await this.client.lPush(this.pending,JSON.stringify({id:job.id,attempt:0}));}
  async reserve(timeoutSeconds=5){const raw=await this.client.brPopLPush(this.pending,this.processing,timeoutSeconds);if(!raw)return null;const item=JSON.parse(raw);await this.client.zAdd(this.leases,[{score:Date.now()+this.visibilityTimeoutMs,value:raw}]);return{...item,receipt:raw};}
  async ack(receipt){const tx=this.client.multi();tx.lRem(this.processing,1,receipt);tx.zRem(this.leases,receipt);await tx.exec();}
  async retry(receipt){const item=JSON.parse(receipt);const next=JSON.stringify({id:item.id,attempt:(item.attempt||0)+1});const tx=this.client.multi();tx.lRem(this.processing,1,receipt);tx.zRem(this.leases,receipt);tx.lPush(this.pending,next);await tx.exec();}
  async recoverExpired(now=Date.now()){const expired=await this.client.zRangeByScore(this.leases,0,now);for(const receipt of expired)await this.retry(receipt);return expired.length;}
}
export async function createRedisJobQueue(url){const{createClient}=await import('redis');const client=createClient({url});client.on('error',(error)=>console.error(JSON.stringify({level:'error',component:'redis',message:error.message})));await client.connect();return{queue:new RedisJobQueue(client),close:()=>client.quit()};}
