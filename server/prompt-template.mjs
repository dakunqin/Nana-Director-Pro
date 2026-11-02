export function formatPrompt(value=''){
 const text=typeof value==='string'?value:'';
 if(/^\s*integrated_multimodal_description\s*:/im.test(text))return text+(!/^\s*overall_soundscape\s*:/im.test(text)?'\n\noverall_soundscape: N/A':'')+(!/^\s*non_diegetic_music\s*:/im.test(text)?'\n\nnon_diegetic_music: N/A':'');
 return 'integrated_multimodal_description: '+text+'\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A';
}
export function visualDescription(value=''){if(typeof value!=='string')return '';const text=value;const match=text.match(/^\s*integrated_multimodal_description[ \t]*:[ \t]*([\s\S]*?)(?=\r?\n[ \t]*(?:overall_soundscape|non_diegetic_music)[ \t]*:|$)/i);return (match?match[1]:text).trim();}
export function normalizeShot(shot){return {...shot,prompt:formatPrompt(shot.prompt),soundMode:shot.soundMode??'native'};}
export function normalizeProjectPrompts(project){return project.plan?{...project,plan:{...project.plan,shots:project.plan.shots.map(normalizeShot)}}:project;}
