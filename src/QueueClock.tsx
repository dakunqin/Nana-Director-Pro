import {useEffect,useState} from 'react';
import {Clock3} from 'lucide-react';
import type {Job} from './types';
import {t as uiText} from './i18n';
const ended=new Set(['succeeded','failed','cancelled','interrupted']);
const processing=new Set(['preflight','submitting','submitted','running','collecting']);
const key=(job:Job)=>job.projectId+':'+((job as Job&{requestKey?:string}).requestKey||job.id);
function elapsed(jobs:Job[],now:number){const active=jobs.find(j=>processing.has(j.status))||jobs.find(j=>!ended.has(j.status)),latest=[...jobs].sort((a,b)=>Date.parse(b.completedAt||b.updatedAt||b.createdAt)-Date.parse(a.completedAt||a.updatedAt||a.createdAt))[0],selected=active||latest;if(!selected)return 0;return jobs.filter(j=>key(j)===key(selected)).reduce((sum,j)=>{const start=Date.parse(j.startedAt||''),end=ended.has(j.status)?Date.parse(j.completedAt||j.updatedAt||''):now;return sum+(Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,end-start):0);},0);}
export default function QueueClock({jobs,onOpen}:{jobs:Job[];onOpen:()=>void}){const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);const seconds=Math.floor(elapsed(jobs,now)/1000),text=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');return <button className="queue-clock" aria-label={uiText('当前队列耗时')} title={uiText('当前批次累计处理耗时，不含排队等待；点击查看队列')} onClick={onOpen}><Clock3 size={13}/><span>{uiText('队列')}</span><time>{text}</time></button>;}
