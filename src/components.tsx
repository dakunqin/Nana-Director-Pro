import {t as uiText} from './i18n';
import type { ReactNode } from "react";
import { ArrowUpRight, Film, LoaderCircle, Plus } from "lucide-react";
export function Empty({
  icon = <Film size={28} />,
  title,
  detail,
  children,
}: {
  icon?: ReactNode;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
  );
}
export function Busy({ children }: { children?: ReactNode }) {
  return (
    <span className="busy-label">
      <LoaderCircle size={15} className="spin" />
      {children || uiText("处理中")}
    </span>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function NewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="button primary"
      onClick={onClick}
      aria-label={uiText("新建电影项目")}
    >
      <Plus size={17} />{uiText("新建电影项目")}<ArrowUpRight size={16} />
    </button>
  );
}
export const jobLabels: Record<string, string> = {
  queued: uiText("等待生成"),
  preflight: uiText("资源预检"),
  submitting: uiText("正在提交"),
  submitted: uiText("已提交"),
  running: uiText("引擎生成中"),
  collecting: uiText("归档中"),
  succeeded: uiText("已完成"),
  failed: uiText("生成失败"),
  cancelled: uiText("已取消"),
  interrupted: uiText("需要检查"),
  paused: uiText("已暂停"),
  downloading: uiText("下载中"),
  verifying: uiText("正在校验"),
  completed: uiText("已完成"),
};
export type Act = (
  label: string,
  fn: () => Promise<unknown>,
  success?: string,
) => Promise<void>;
