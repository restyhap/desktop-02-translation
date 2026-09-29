import type { ReactNode, HTMLAttributes, SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** 下拉选择框 (原生 select 美化) */
export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={`h-9 cursor-pointer appearance-none rounded-lg border border-line bg-bg-elevated px-3 pr-8 text-sm text-ink outline-none transition-colors hover:bg-hover focus:border-accent focus:ring-2 focus:ring-accent-soft ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

type BadgeTone = "accent" | "gold" | "green" | "red" | "neutral";

const BADGE_TONE: Record<BadgeTone, string> = {
  accent: "bg-accent-soft text-accent",
  gold: "bg-gold-soft text-gold",
  green: "bg-green-soft text-green",
  red: "bg-red-soft text-red",
  neutral: "bg-hover text-ink-2",
};

/** 微型标签 */
export function Badge({
  tone = "neutral",
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold leading-5 ${BADGE_TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

/** 空态 */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center px-8">
      {icon && <div className="mb-2 text-ink-3 opacity-60">{icon}</div>}
      <div className="text-sm font-medium text-ink-2">{title}</div>
      {hint && <div className="max-w-[26em] text-xs leading-5 text-ink-3">{hint}</div>}
    </div>
  );
}
