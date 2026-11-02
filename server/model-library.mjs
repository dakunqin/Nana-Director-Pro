import {createWriteStream,existsSync,mkdirSync,renameSync,statfsSync,unlinkSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {safePath,AppError} from './security.mjs';
import {hashFile} from './downloads.mjs';
export const MODEL_FOLDERS=['checkpoints','diffusion_models','text_encoders','vae','loras','clip_vision','controlnet','embeddings','audio_encoders','upscale_models'];
export class ModelLibrary{
 constructor(store,root){this.store=store;this.root=root;this.active=new Set();}
 list(){return this.store.list('custom-models');}
 async importFile(req,{folder,filename,size}){if(!MODEL_FOLDERS.includes(folder)||typeof filename!=='string'||filename!==path.posix.basename(filename)||/[\\/:\x00-\x1f]/.test(filename)||!/^.{1,180}\.(safetensors|ckpt|pt|pth|gguf|bin)$/i.test(filename))throw new AppError('请选择模型类别及有效模型文件，不能导入可执行文件');if(!Number.isSafeInteger(size)||size<=0||size>200*1024**3)throw new AppError('模型文件大小无效（上限 200 GB）');const relative=`models/${folder}/${filename}`,dest=safePath(this.root,relative);if(this.active.has(relative)||existsSync(dest))throw new AppError('同名模型已存在或正在导入，请更换文件名，已有模型不会被覆盖',409);const disk=statfsSync(this.root);if(Number(disk.bavail)*Number(disk.bsize)<size+100*1024**2)throw new AppError('数据盘空间不足');this.active.add(relative);mkdirSync(path.dirname(dest),{recursive:true});const part=dest+'.'+randomUUID()+'.importing';let received=0;try{await pipeline(req,new Transform({transform(chunk,_,done){received+=chunk.length;done(received>size?new AppError('文件超出声明大小'):null,chunk);}}),createWriteStream(part,{flags:'wx'}));if(received!==size)throw new AppError('文件上传不完整');const sha256=await hashFile(part);if(existsSync(dest))throw new AppError('同名文件已经存在',409);renameSync(part,dest);const model={id:randomUUID(),folder,filename,path:relative,size,sha256,createdAt:new Date().toISOString()};this.store.put('custom-models',model.id,model);return model;}finally{this.active.delete(relative);if(existsSync(part))unlinkSync(part);}}
}
