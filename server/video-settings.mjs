import {AppError} from './security.mjs';
export const ASPECTS={'16:9':'16:9 (Widescreen)','9:16':'9:16 (Portrait Widescreen)','1:1':'1:1 (Square)','4:3':'4:3 (Standard)','3:4':'3:4 (Portrait Standard)','3:2':'3:2 (Photo)','2:3':'2:3 (Portrait Photo)','21:9':'21:9 (Ultrawide)'};
export const MEGAPIXELS=[.42,.5,.7,.9,1,1.1];
export const FPS_OPTIONS=[12,15,24,25,30,48,50,60];
export const SAMPLERS=['dual_clock_euler','euler','euler_ancestral','heun','dpmpp_2m','dpmpp_2m_sde'];
export function videoSettings(value={}){const result={aspectRatio:value.aspectRatio??'16:9',megapixels:value.megapixels??.5,sampler:value.sampler??'dual_clock_euler',steps:value.steps??4,fps:value.fps??24};if(!Object.hasOwn(ASPECTS,result.aspectRatio)||!MEGAPIXELS.includes(result.megapixels)||!SAMPLERS.includes(result.sampler)||!Number.isInteger(result.steps)||result.steps<1||result.steps>1000||!FPS_OPTIONS.includes(result.fps))throw new AppError('画幅、分辨率、采样器、步数或帧率无效');return result;}
export function exportDimensions(aspect='16:9'){return ({'16:9':[1280,720],'9:16':[720,1280],'1:1':[960,960],'4:3':[1024,768],'3:4':[768,1024],'3:2':[1152,768],'2:3':[768,1152],'21:9':[1344,576]})[aspect]||[1280,720];}
