import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function cpuSample(cpus=os.cpus()){return cpus.reduce((s,c)=>({idle:s.idle+c.times.idle,total:s.total+Object.values(c.times).reduce((a,b)=>a+b,0)}),{idle:0,total:0});}
export function cpuPercent(before,after){const total=after.total-before.total;return total>0?Math.max(0,Math.min(100,100*(1-(after.idle-before.idle)/total))):null;}
export function parseGpus(stdout){return stdout.trim().split('\n').filter(Boolean).map(line=>{const [index,name,util,used,total,temp]=line.split(',').map(v=>v.trim());const number=v=>/^\d+(\.\d+)?$/.test(v)?Number(v):null;return {index:number(index),name,utilization:number(util),memoryUsedMB:number(used),memoryTotalMB:number(total),temperatureC:number(temp)};});}
export class ResourceMonitor {
  constructor(){this.previous=cpuSample();this.cache=null;this.pending=null;}
  async read(){if(this.cache&&Date.now()-this.cache.at<2000)return this.cache.value;if(this.pending)return this.pending;this.pending=this.sample();try{return await this.pending;}finally{this.pending=null;}}
  async sample(){const current=cpuSample(),cpu=cpuPercent(this.previous,current);this.previous=current;let gpus=[],gpuError=null;try{const {stdout}=await exec('nvidia-smi',['--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu','--format=csv,noheader,nounits'],{windowsHide:true,timeout:2500});gpus=parseGpus(stdout);}catch{gpuError='无法读取 GPU 实时占用；当前支持 NVIDIA 驱动监测，其他显卡不显示估算值';}const value={sampledAt:new Date().toISOString(),scope:'整机资源（包含其他软件与本地 AI 服务）',cpuPercent:cpu,memoryUsedBytes:os.totalmem()-os.freemem(),memoryTotalBytes:os.totalmem(),gpus,gpuError};this.cache={at:Date.now(),value};return value;}
}
