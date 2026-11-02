import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const languages=new Set(['en-US','en-GB','zh-CN','zh-TW','ja','ko','es','es-419']);
function size(folder){if(!fs.existsSync(folder))return 0;const stat=fs.lstatSync(folder);if(stat.isSymbolicLink())throw new Error('Refusing a linked package path: '+folder);return stat.isFile()?stat.size:fs.readdirSync(folder).reduce((n,name)=>n+size(path.join(folder,name)),0);}
export function compactRuntime(input){
 const root=path.resolve(input),release=path.join(workspace,'release'),relative=path.relative(release,root);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Compaction target must be a verified subdirectory of '+release);
 const app=path.join(root,'resources','app'),manifest=path.join(app,'package.json');
 if(!fs.existsSync(manifest)||JSON.parse(fs.readFileSync(manifest)).name!=='nana-h3-director-pro')throw new Error('This is not a Nana Director packaged application');
 const before=size(root),removed=[];
 const licenses=path.join(workspace,'vendor','runtime-licenses');if(!fs.existsSync(licenses))throw new Error('Missing bundled frontend license texts');fs.cpSync(licenses,path.join(app,'vendor','runtime-licenses'),{recursive:true});
 fs.copyFileSync(path.join(workspace,'THIRD_PARTY_NOTICES.md'),path.join(app,'THIRD_PARTY_NOTICES.md'));
 function remove(target){const absolute=path.resolve(target),rel=path.relative(root,absolute);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Removal escaped packaged application');if(fs.existsSync(absolute)){size(absolute);removed.push(rel);fs.rmSync(absolute,{recursive:true,force:true});}}
 const modules=path.join(app,'node_modules');
 for(const name of fs.readdirSync(modules))if(!['7zip-bin','ffmpeg-static'].includes(name))remove(path.join(modules,name));
 for(const name of ['linux','mac','win/ia32','win/arm64'])remove(path.join(modules,'7zip-bin',name));
 for(const name of ['install.js','example.js','test.js'])remove(path.join(modules,'ffmpeg-static',name));
 const locales=path.join(root,'locales');if(fs.existsSync(locales))for(const name of fs.readdirSync(locales))if(name.endsWith('.pak')&&!languages.has(name.slice(0,-4)))remove(path.join(locales,name));
 for(const name of ['icon.ico','icon.svg','splash.bmp'])remove(path.join(app,'desktop',name));
 const fresh=path.join(workspace,'dist');if(!fs.existsSync(path.join(fresh,'index.html')))throw new Error('Build the frontend before compacting');
 remove(path.join(app,'dist'));fs.cpSync(fresh,path.join(app,'dist'),{recursive:true});
 const version=JSON.parse(fs.readFileSync(manifest)).version,reportFile=path.join(release,'compact-report-'+version+'.json');let previous=null;try{previous=JSON.parse(fs.readFileSync(reportFile));}catch{}const report={version,beforeBytes:Math.max(before,previous?.beforeBytes||0),lastRunBeforeBytes:before,afterBytes:size(root),removed:[...new Set([...(previous?.removed||[]),...removed])]};
 fs.writeFileSync(path.join(release,'compact-report-'+report.version+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({version:report.version,beforeMB:(before/1048576).toFixed(1),afterMB:(report.afterBytes/1048576).toFixed(1),savedMB:((before-report.afterBytes)/1048576).toFixed(1)}));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)compactRuntime(process.argv[2]||path.join(workspace,'release','win-unpacked'));
