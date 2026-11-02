import {useEffect,useState} from 'react';
import {Clock3} from 'lucide-react';
import {api} from './api';
import {t as uiText} from './i18n';
import type {Job} from './types';
import WorkflowButton from './WorkflowButton';
const terminal=new Set(['succeeded','failed','cancelled','interrupted']);
function duration(ms:number){const seconds=Math.floor(Math.max(0,ms)/1000);return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
export default function JobDetails({job}:{job:Job}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(terminal.has(job.status))return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[job.status]);
 const done=terminal.has(job.status),start=Date.parse(job.startedAt||''),end=done?Date.parse(job.completedAt||job.updatedAt||''):now;
 const elapsed=Number.isFinite(start)&&Number.isFinite(end)?duration(end-start):done?'—':duration(now-Date.parse(job.createdAt||''));
 return <div className="job-details"><span className="job-elapsed"><Clock3 size={13}/>{uiText(job.startedAt||done?'耗时':'等待时间')} {elapsed}</span><WorkflowButton filename={job.id} load={()=>api('/jobs/'+job.id+'/workflow')}/></div>;
}
