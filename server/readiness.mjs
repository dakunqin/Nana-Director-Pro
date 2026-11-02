import {createRequire} from 'node:module';
import {existsSync,statfsSync} from 'node:fs';
import path from 'node:path';
import {Comfy} from './comfy.mjs';
import {buildWorkflow,preflight} from './workflow.mjs';
import {catalog} from './environment.mjs';
import {binaryPath} from './process.mjs';
const require=createRequire(import.meta.url);
const probe=()=>buildWorkflow({prompt:'资源准备检查，不提交生成',duration:5},{id:'readiness',aspectRatio:'16:9',megapixels:0.5});
const modelKeys=['unet_name','clip_name','vae_name','lora_name'];
const action=(label,page,target)=>({label,page,target:target||(page==='settings'?'runtime':undefined)});
export function assessReadiness({settings,installed,services,objectInfo,inspectionError,tools,freeBytes}){
  const items=[],ollama=!!services.ollama?.online,comfy=!!services.comfy?.online;
  const director=ollama&&services.ollama.models?.some(m=>m.name===settings.model);
  const serviceAction=installed?action('启动或检查服务','settings'):action('安装环境 / 连接已有服务','settings');
  items.push({id:'director-service',title:'本地导演服务',state:ollama?'ready':'missing',summary:ollama?'已连接本机 Ollama':'尚未连接，暂时不能自动分析剧本',details:[],action:serviceAction});
  items.push({id:'director-model',title:'剧本与分镜模型',state:director?'ready':ollama?'missing':'blocked',summary:director?`${settings.model} 已安装`:ollama?`尚未安装所选模型 ${settings.model}`:'先启动本地导演服务，再检查模型',details:[],action:ollama?action('去下载所选导演模型','models','director-models'):serviceAction});
  items.push({id:'video-service',title:'ComfyUI 视频引擎',state:comfy?'ready':'missing',summary:comfy?'服务已连接；仍需检查节点与权重':'尚未连接，暂时不能生成视频',details:[],action:serviceAction});
  let nodesReady=false,modelsReady=false;
  if(!comfy||!objectInfo){const state=comfy?'unknown':'blocked';const summary=comfy?'检查未完成，请重新检测；不能据此视为已就绪':'先连接视频引擎，再检查所需资源';
    items.push({id:'video-nodes',title:'H3 基础节点',state,summary,details:inspectionError?[inspectionError]:[],action:serviceAction});
    items.push({id:'video-models',title:'H3 基础五模型',state,summary,details:[],action:serviceAction});
  }else{
    const graph=probe();const bindings=Object.values(graph).flatMap(n=>Object.entries(n.inputs).filter(([key])=>modelKeys.includes(key)).map(([key,file])=>({type:n.class_type,key,file})));
    const nodeErrors=preflight(graph,objectInfo).errors.filter(error=>!bindings.some(b=>error.startsWith(b.type+'.'+b.key+' ')));
    const missing=[],unknown=[];
    for(const b of bindings){const definition=objectInfo[b.type]?.input;const choices=(definition?.required?.[b.key]||definition?.optional?.[b.key])?.[0];if(!Array.isArray(choices))unknown.push(b.file);else if(!choices.includes(b.file))missing.push(b.file);}
    nodesReady=!nodeErrors.length;modelsReady=!missing.length&&!unknown.length;
    items.push({id:'video-nodes',title:'H3 基础节点',state:nodesReady?'ready':'missing',summary:nodesReady?'所需节点及基础输入检查通过':`有 ${nodeErrors.length} 项节点缺失或版本不兼容`,details:nodeErrors,action:action('安装 / 修复节点并重启','settings')});
    items.push({id:'video-models',title:'H3 基础五模型',state:modelsReady?'ready':unknown.length?'unknown':'missing',summary:modelsReady?'当前 ComfyUI 已识别五个基础权重':missing.length?`还缺 ${missing.length} 个模型；运行环境安装完成不等于模型已下载`:'暂时无法确认模型，请先修复节点或重新检测',details:missing.map(file=>{const resource=catalog.resources.find(r=>path.posix.basename(r.path)===file);return `${resource?.name||'模型'}：${file}`;}),action:action('去下载 H3 基础模型','models','video-models')});
  }
  const diskKnown=Number.isFinite(freeBytes),diskReady=diskKnown&&freeBytes>=2*1024**3;
  items.push({id:'tools',title:'视频导出与安装工具',state:tools.ffmpeg&&tools.archive?'ready':'missing',summary:tools.ffmpeg&&tools.archive?'FFmpeg 与解压工具可用':'软件工具文件缺失，请重新解压完整软件包',details:[...(!tools.ffmpeg?['缺少 FFmpeg，不能提取关系帧或导出成片']:[]),...(!tools.archive?['缺少解压工具，不能安装环境或备份项目']:[])],action:action('查看环境与修复说明','settings')});
  items.push({id:'disk',title:'数据盘空间',state:diskReady?'ready':diskKnown?'missing':'unknown',summary:diskReady?'可用空间不少于 2 GB；下载时还会按模型大小检查':diskKnown?'可用空间不足 2 GB，请先清理空间或更换数据盘':'无法检查可用空间，请确认数据目录可访问',details:[],action:action('选择数据盘 / 查看路径','settings','hardware')});
  return {checkedAt:new Date().toISOString(),planningReady:!!director,videoReady:comfy&&nodesReady&&modelsReady&&!!tools.ffmpeg&&diskReady,exportReady:!!tools.ffmpeg&&diskReady,backupReady:!!tools.archive&&diskReady,inferenceValidated:false,items};
}
export class Readiness {
  constructor(store,root,environment){this.store=store;this.root=root;this.environment=environment;this.cache=null;this.pending=null;this.startedAt=Date.now();this.initialized=false;}
  async check(force=false){
    const settings=this.store.settings(),key=JSON.stringify([settings.ollamaUrl,settings.comfyUrl,settings.allowLan,settings.model]);
    if(!force&&this.cache?.key===key&&Date.now()-this.cache.at<12000)return this.cache.value;
    if(this.pending?.key===key)return this.pending.promise;
    const promise=(async()=>{const services=await this.environment.status();let objectInfo=null,inspectionError=null;try{if(services.comfy.online)objectInfo=await new Comfy(settings.comfyUrl,settings.allowLan).info(8000);}catch(e){inspectionError=e.message;}
      const tools={ffmpeg:false,archive:false};try{tools.ffmpeg=existsSync(binaryPath(require('ffmpeg-static')));tools.archive=existsSync(binaryPath(require('7zip-bin').path7za));}catch{}
      let freeBytes=null;try{const disk=statfsSync(this.root);freeBytes=Number(disk.bavail)*Number(disk.bsize);}catch{}
      const value=assessReadiness({settings,installed:!!this.store.get('environment','installed'),services,objectInfo,inspectionError,tools,freeBytes});
      const installed=!!this.store.get('environment','installed');const waiting=installed&&((settings.managedComfy&&!services.comfy.online)||(settings.managedOllama&&!services.ollama.online));if(!waiting)this.initialized=true;value.initializing=!this.initialized&&waiting&&Date.now()-this.startedAt<120000;
      if(JSON.stringify([this.store.settings().ollamaUrl,this.store.settings().comfyUrl,this.store.settings().allowLan,this.store.settings().model])===key)this.cache={key,at:Date.now(),value};return value;
    })();
    this.pending={key,promise};try{return await promise;}finally{if(this.pending?.promise===promise)this.pending=null;}
  }
}
