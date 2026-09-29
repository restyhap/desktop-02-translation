/**
 * 页头 -- 五页统一规格（克制高级感）
 *
 * 结构：accent 图标 chip（对应侧栏导航图标）+ 24px 衬线标题 + 12px 职责说明行。
 * 主页/历史/生词本/词典共用，保证「图标-页面」一一对应、界面节奏一致。
 */
import type { ReactNode } from "react";

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  hint?: string;
  /** 标题行右侧附件（计数/主操作），可选 */
  right?: ReactNode;
}

export function PageHeader({ icon, title, hint, right }: PageHeaderProps) {
  return (
    <header className="rise-in flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          {icon}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-[24px] leading-tight tracking-tight text-ink">{title}</h1>
          {hint && <p className="mt-0.5 text-[12px] text-ink-2">{hint}</p>}
        </div>
      </div>
      {/* 右侧附件独立垂直居中，不挤占标题/副标题行 */}
      {right && <div className="flex shrink-0 items-center self-center">{right}</div>}
    </header>
  );
}
