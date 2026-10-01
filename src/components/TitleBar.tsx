/**
 * 自绘标题栏 —— macOS `titleBarStyle: "Overlay"` + `hiddenTitle: true` 的配套 UI。
 *
 * 为什么需要：Overlay 会让网页内容铺满整窗、系统标题文字隐藏，但红绿灯按钮仍由系统绘制。
 * 系统标题文字居中，不在左侧，所以「图标 + 应用名」必须自己画在左侧红绿灯右边。
 *
 * 三条硬约束（改本组件前务必知道）：
 * 1. `data-tauri-drag-region` 是 Overlay 模式下唯一让窗口可拖动的手段（schema 明确要求）。
 *    Tauri 2 按 mouse 事件的 target 命中该属性，所以内层包裹元素也要带一份，
 *    否则点到 logo/文字上时窗口拖不动。
 * 2. 左侧 `pl-[78px]` 是给系统红绿灯（关闭/最小化/全屏）预留的位置，不可随意改小。
 * 3. 高度 `h-7`（28px）与 macOS 标准标题栏一致，红绿灯垂直居中才对得齐；
 *    改大会让红绿灯看起来偏上。
 * 4. 绝对定位（`absolute inset-x-0 top-0`）而非文档流内的一行 —— 调用方（App.tsx 根容器）
 *    只需加 `pt-7` 留白，不必为标题栏多包一层 flex，也就不会给下方上百行 JSX 带来缩进变动。
 *
 * 只作用于 main 窗口：translate / toast 两个窗口是 decorations:false 的无边框浮窗，
 * 本来就没有标题栏，不受影响。
 */
import { LogoIcon } from "@/components/icons";

/** 产品名（与 tauri.conf.json main 窗口 title 一致）；属产品名而非界面文案，不走 i18n。 */
const APP_NAME = "Desktop Translation";

export function TitleBar() {
  return (
    <header
      data-tauri-drag-region
      className="absolute inset-x-0 top-0 z-10 flex h-7 items-center border-b border-line bg-bg pl-[78px] pr-3"
    >
      {/* 包裹层同样带 drag-region，保证拖 logo / 拖文字也能拖动窗口 */}
      <span data-tauri-drag-region className="flex items-center gap-2">
        <LogoIcon size={16} />
        <span className="text-[13px] font-medium leading-none tracking-tight text-ink-2">
          {APP_NAME}
        </span>
      </span>
    </header>
  );
}