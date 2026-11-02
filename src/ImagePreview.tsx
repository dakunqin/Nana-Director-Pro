import {t as uiText} from './i18n';
import PreviewDialog from './PreviewDialog';
export default function ImagePreview({src,alt,onClose}:{src:string;alt:string;onClose:()=>void}){return <PreviewDialog title={uiText("图片预览")} onClose={onClose}><img src={src} alt={alt}/></PreviewDialog>;}
