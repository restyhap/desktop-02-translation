import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** 单行输入框 */
export function Input({ className = "", ...rest }: InputProps) {
  return (
    <input
      className={`h-9 w-full rounded-lg border border-line bg-bg-elevated px-3 text-sm text-ink placeholder:text-ink-3 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft ${className}`}
      {...rest}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** 多行输入框 */
export function Textarea({ className = "", ...rest }: TextareaProps) {
  return (
    <textarea
      className={`w-full resize-none rounded-lg border border-line bg-bg-elevated px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft ${className}`}
      {...rest}
    />
  );
}
