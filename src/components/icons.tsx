/** 内联图标 (lucide 线稿风格, stroke 2) — 预览版自带，移植时可换 lucide-react */

interface IconProps {
  size?: number;
  className?: string;
}

function Base({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function LanguagesIcon(p: IconProps) {
  return (
    <Base {...p}>
      {/* 地球经纬（语言与全球翻译，主页/翻译入口） */}
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Base>
  );
}

/**
 * 应用 logo（品牌标识）— 与 src-tauri/icons/logo.svg 同源：靛蓝圆角方块 + D/T 渐变线稿。
 *
 * 用途：侧栏主页入口。与线稿类图标（languages/history/…）不同，这里是**填充块**，
 * 所以不放进 Base（Base 固定 stroke 2 + currentColor + 24 视口）。
 *
 * 小尺寸可读性：线宽由 logo.svg 的 26 加粗到 40。512 视口渲染到 17px 时，
 * 描边 = 40/512×17 ≈ 1.33px，与其它线稿图标（2/24×17 ≈ 1.42px）基本同粗。
 *
 * 徽章底色走 CSS 变量 --logo-tile（见 styles.css）：浅色主题用品牌靛蓝 #1E1B4B，
 * 暗色主题必须上提 —— 否则徽章会与深色 --bg 一起"隐身"（对比度仅约 1.02:1）。
 */
export function LogoIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="Desktop Translation"
    >
      <defs>
        <linearGradient id="dtLogoGrad" x1="240" y1="0" x2="340" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="var(--logo-tile, #1E1B4B)" />
      <g
        fill="none"
        stroke="url(#dtLogoGrad)"
        strokeWidth="40"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* D = 山：源语言（白） */}
        <g transform="translate(160,256) scale(0.75)">
          <path d="M -140,120 C -140,20 -100,-100 -30,-120 C 40,-140 100,-60 80,20 C 60,100 -40,120 -80,100" />
        </g>
        {/* T = 翼：飞越（天青渐变） */}
        <g transform="translate(360,256) scale(0.92)">
          <path d="M -100,-55 C -60,-112 60,-112 100,-55" />
          <path d="M 0,-40 L 0,80" />
        </g>
      </g>
    </svg>
  );
}

export function HistoryIcon(p: IconProps) {
  return (
    <Base {...p}>
      {/* 历史（时钟回拨：圆弧+指针+回卷箭头，语义直指「过往记录」） */}
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Base>
  );
}

export function BookIcon(p: IconProps) {
  return (
    <Base {...p}>
      {/* 词典书（对开翻页书：对称双页 + 中缝书脊，小尺寸可辨识） */}
      <path d="M11.5 5.2C10.2 3.9 8.3 3.2 5.8 3.2H3.5v12.6h2.3c2.5 0 4.4.9 5.7 2.4 1.3-1.5 3.2-2.4 5.7-2.4h2.3V3.2h-2.3c-2.5 0-4.4.7-5.7 2z" />
      <path d="M11.5 5.2v12.6" />
    </Base>
  );
}

export function NotebookIcon(p: IconProps) {
  return (
    <Base {...p}>
      {/* 卷轴（生词卷轴卡片集，承接原历史图标） */}
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
      <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v12a3 3 0 0 0 3 3h3" />
    </Base>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Base {...p}>
      {/* 齿轮设置图标（原版恢复） */}
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.74v.23a2 2 0 0 1-1 1.73l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.15.08a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.15-.08a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.23a2 2 0 0 1 1-1.73l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l.15.08a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  );
}

export function Volume2Icon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Base>
  );
}

export function CopyIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Base>
  );
}

export function StarIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  return (
    <Base {...p}>
      <path
        d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.907l-3.797 3.696a2.123 2.123 0 0 0-.611 1.878l.964 4.856a.53.53 0 0 1-.77.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.397 21.01a.53.53 0 0 1-.77-.56l.964-4.856a2.123 2.123 0 0 0-.611-1.878L2.184 9.797a.53.53 0 0 1 .294-.906l5.166-.756a2.123 2.123 0 0 0 1.597-1.16z"
        fill={filled ? "currentColor" : "none"}
      />
    </Base>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Base>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Base>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Base>
  );
}

export function XIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Base>
  );
}
