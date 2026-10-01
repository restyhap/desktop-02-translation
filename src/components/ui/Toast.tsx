/**
 * Toast 体系 — 对齐 src/components/ui/Toast.tsx（唯一被接线的 ui 基件）
 * 3s 自动淡出，success/error/info 三态。
 * 主窗体全部提示（showToast）共用本容器，落点由 position 决定：
 * - top-right（默认，主窗体 main.tsx）：右上角提示
 * - bottom-right（划词弹窗 translate.tsx）：弹窗右上角是标题栏+关闭按钮，保持右下避免遮挡
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type ToastType = "success" | "error" | "info";

/** toast 落点：右上角（主窗体）/ 右下角（划词弹窗，避免遮挡关闭按钮） */
export type ToastPosition = "top-right" | "bottom-right";

/** 各落点的容器 class（fixed 定位 + 堆叠方向） */
const POSITIONS: Record<ToastPosition, string> = {
  "top-right": "fixed top-6 right-6 flex flex-col gap-2",
  "bottom-right": "fixed bottom-6 right-6 flex flex-col gap-2",
};

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

export function ToastProvider({
  children,
  position = "top-right",
}: {
  children: ReactNode;
  /** toast 落点，默认右上角 */
  position?: ToastPosition;
}) {
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
      <div className={`pointer-events-none z-50 ${POSITIONS[position]}`}>
        {items.map((t) => (
          <div
            key={t.id}
            className="rise-in pointer-events-auto flex max-w-sm items-center overflow-hidden rounded-md bg-bg-elevated shadow-[var(--shadow-card)]"
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
