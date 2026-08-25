export class DistributedWorker {
  constructor({queue,runner,concurrency=1}){this.queue=queue;this.runner=runner;this.concurrency=Math.max(1,Math.min(Number(concurrency)||1,16));this.accepting=true;this.active=0;this.loops=[];}
  start(){this.loops=Array.from({length:this.concurrency},()=>this.loop());return this;}
  enqueue(job){if(!this.accepting)throw new Error('Worker is shutting down.');return this.queue.enqueue(job);}
  resumeQueued(){}
  async loop(){while(this.accepting){await this.queue.recoverExpired();const item=await this.queue.reserve(2);if(!item)continue;this.active++;try{await this.runner.run(item.id);await this.queue.ack(item.receipt);}catch{await this.queue.retry(item.receipt);}finally{this.active--;}}}
  status(){return{accepting:this.accepting,active:this.active,queued:null,distributed:true};}
  async shutdown(){this.accepting=false;await Promise.allSettled(this.loops);return this.active===0;}
}
