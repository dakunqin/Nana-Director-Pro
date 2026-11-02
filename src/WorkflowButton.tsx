import {useState} from 'react';
import {Workflow} from 'lucide-react';
import PreviewDialog from './PreviewDialog';
import {t as uiText} from './i18n';
export type WorkflowData={actual:boolean;workflow:Record<string,{class_type:string;inputs:Record<string,unknown>}>};
export default function WorkflowButton({load,filename}:{load:()=>Promise<WorkflowData>;filename:string}){
 const [open,setOpen]=useState(false),[data,setData]=useState<WorkflowData|null>(null),[error,setError]=useState('');
 const show=async()=>{setOpen(true);setData(null);setError('');try{setData(await load());}catch(e){setError((e as Error).message);}};
 const download=()=>{if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data.workflow,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename+(data.actual?'.workflow.json':'.preview.workflow.json');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <><button className="button small" onClick={()=>void show()}><Workflow size={14}/>{uiText('查看 ComfyUI 工作流')}</button>{open&&<PreviewDialog title={uiText('ComfyUI 工作流')} onClose={()=>setOpen(false)}><div className="workflow-viewer">{error?<p role="alert">{error}</p>:!data?<p role="status">{uiText('正在读取工作流…')}</p>:<><p className="subtle-banner">{uiText(data.actual?'任务实际工作流':'待提交工作流预览：参考图名称及尾帧衔接可能在提交时变化。')}</p><button className="button small" onClick={download}>{uiText('下载工作流 JSON')}</button><div className="workflow-nodes">{Object.entries(data.workflow).map(([id,node])=><article key={id}><small>#{id}</small><strong>{node.class_type}</strong><div>{Object.entries(node.inputs).filter(([,value])=>Array.isArray(value)&&value.length===2).map(([key,value])=><span key={key}>{key} ← #{String((value as unknown[])[0])}</span>)}</div></article>)}</div><details><summary>{uiText('查看完整 JSON')}</summary><pre>{JSON.stringify(data.workflow,null,2)}</pre></details></>}</div></PreviewDialog>}</>;
}
