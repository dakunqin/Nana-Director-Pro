import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessReadiness} from '../server/readiness.mjs';
import {buildWorkflow} from '../server/workflow.mjs';
const graph=buildWorkflow({prompt:'检查',duration:5},{id:'readiness',aspectRatio:'16:9',megapixels:0.5});
function prepared(){const info=Object.fromEntries(Object.values(graph).map(n=>[n.class_type,{input:{required:{}}}]));for(const n of Object.values(graph))for(const [key,value]of Object.entries(n.inputs))if(['unet_name','clip_name','vae_name','lora_name'].includes(key)) {const map=info[n.class_type].input.required;map[key]=[Array.from(new Set([...(map[key]?.[0]||[]),value]))];}return {settings:{model:'qwen3:8b'},installed:true,services:{ollama:{online:true,models:[{name:'qwen3:8b'}]},comfy:{online:true}},objectInfo:info,tools:{ffmpeg:true,archive:true},freeBytes:100*1024**3};}
test('connected services with missing H3 weights show actionable preparation and block video',()=>{const data=prepared();data.objectInfo.UNETLoader.input.required.unet_name=[[]];const r=assessReadiness(data);assert.equal(r.planningReady,true);assert.equal(r.videoReady,false);assert.ok(r.items.find(i=>i.id==='video-models').details.some(t=>t.includes('minimax_h3_fl2va')));assert.equal(r.items.find(i=>i.id==='video-models').action.page,'models');});
test('offline or uninstalled director model does not block manual video but blocks planning',()=>{const data=prepared();data.services.ollama={online:false,models:[]};const r=assessReadiness(data);assert.equal(r.planningReady,false);assert.equal(r.videoReady,true);});
test('node inspection failure remains unknown instead of declaring resources ready',()=>{const data=prepared();data.objectInfo=null;data.inspectionError='连接超时';const r=assessReadiness(data);assert.equal(r.videoReady,false);assert.equal(r.items.find(i=>i.id==='video-nodes').state,'unknown');});
test('missing tools and low disk space provide remedies and block export/video',()=>{const data=prepared();data.tools.ffmpeg=false;data.freeBytes=1024;const r=assessReadiness(data);assert.equal(r.videoReady,false);assert.equal(r.exportReady,false);assert.equal(r.items.find(i=>i.id==='disk').action.page,'settings');});
test('ready means baseline resources available, not a claim that GPU inference was validated',()=>{const r=assessReadiness(prepared());assert.equal(r.planningReady,true);assert.equal(r.videoReady,true);assert.equal(r.inferenceValidated,false);});

import {Readiness} from '../server/readiness.mjs';
import {Store} from '../server/store.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('installed managed services get a startup detection window instead of an early missing verdict',async t=>{const root=mkdtempSync(path.join(tmpdir(),'nana-start-check-')),store=new Store(root);t.after(()=>store.close());store.put('environment','installed',{comfy:root});store.saveSettings({managedComfy:true});const readiness=new Readiness(store,root,{status:async()=>({comfy:{online:false},ollama:{online:false}})});assert.equal((await readiness.check(true)).initializing,true);readiness.startedAt-=120001;assert.equal((await readiness.check(true)).initializing,false);});
