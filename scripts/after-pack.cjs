const {pathToFileURL}=require('node:url');
const path=require('node:path');
module.exports=async context=>{if(context.electronPlatformName!=='win32')return;const {compactRuntime}=await import(pathToFileURL(path.join(__dirname,'compact-runtime.mjs')).href);compactRuntime(context.appOutDir);};
