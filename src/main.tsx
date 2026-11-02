import { createRoot } from "react-dom/client";
import {configureLanguage,t} from "./i18n";
import "./styles.css";
import './preparation.css';
import './paper.css';
import './graphite.css';
import './customization.css';
const savedTheme=localStorage.getItem('nana-theme');
if(savedTheme&&['forest','midnight','paper','minimal','graphite','glass'].includes(savedTheme))document.documentElement.dataset.theme=savedTheme;
async function bootstrap(){try{const response=await fetch('/api/v1/ui-preferences');const pref=await response.json();await configureLanguage(pref.language||'system');}catch{await configureLanguage('system');}const root=document.getElementById('root')!;root.textContent=t('正在加载本地工作室，请稍候…');const {default:App}=await import('./App');createRoot(root).render(<App/>);}
void bootstrap();
