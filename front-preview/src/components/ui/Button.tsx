import type { ReactNode, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  children?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm disabled:opacity-50",
  ghost: "text-ink-2 hover:text-ink hover:bg-hover",
  outline: "border border-line text-ink hover:bg-hover",
  danger: "text-red hover:bg-red-soft",
};

const SIZE = {
  sm: "h-7 px-2.5 text-xs rounded-md gap-1",
  md: "h-9 px-3.5 text-sm rounded-lg gap-1.5",
};

/** 按钮口径 — 与 src/components/ui/Button.tsx 的 4 变体概念一致 */
export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-colors duration-150 select-none disabled:cursor-not-allowed ${SIZE[size]} ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
