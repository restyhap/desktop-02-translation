/**
 * Toast 体系 — 对齐 src/components/ui/Toast.tsx（唯一被接线的 ui 基件）
 * 右下角，3s 自动淡出，success/error/info 三态。
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const COLORS: Record<ToastType, { bar: string }> = {
  success: { bar: "bg-[var(--green)]" },
  error: { bar: "bg-[var(--red)]" },
  info: { bar: "bg-[var(--accent)]" },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, type, message }]);
    // 3s 自动淡出（对齐 src 行为）
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="rise-in pointer-events-auto flex items-center overflow-hidden rounded-md bg-bg-elevated shadow-[var(--shadow-card)]"
          >
            <span className={`h-full w-1 self-stretch ${COLORS[t.type].bar}`} />
            <span className="px-3 py-2 text-[13px] text-ink">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): { showToast: (message: string, type?: ToastType) => void } {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return { showToast: ctx.showToast };
}
