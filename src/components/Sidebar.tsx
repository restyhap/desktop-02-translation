/**
 * 左侧 64px 导航 rail — v2 保留（导航身份）
 *
 * 上：主页（地球）+ 历史/生词本/词典；下：主题三态循环 + 设置（设置 = 舞台内整页视图）。
 * v2 差异：不再有 288px 中栏，设置不再是整窗 overlay，而是通过 onTab("settings") 进入。
 * i18n：文案走 useAppLocale().t；语言切换入口只放设置页（此 rail 已有主题循环按钮）。
 *
 * 一致性铁律：四个顶部按钮（主页/历史/生词本/词典）+底部设置全部复用 navClass，
 * 尺寸 h-10 w-10、圆角 rounded-[10px]、容器 gap-1.5、图标 17px 完全相同，间距也统一
 * （主页不再有额外 margin 分组）。主题符号是字体字形，用 text-[16px] 折算到同等
 * 视觉高度。应用 logo 不进侧栏，只放窗口标题栏（见 TitleBar.tsx + LogoIcon）。
 */
import type { ThemeMode } from "@/hooks/useTheme";
import type { TranslationKey } from "@/lib/i18n";
import { useAppLocale } from "@/lib/i18n";
import {
  LanguagesIcon,
  HistoryIcon,
  BookIcon,
  NotebookIcon,
  SettingsIcon,
} from "@/components/icons";

export type SidebarTab = "history" | "vocabulary" | "dictionary";

/** 视图 tab：translate 主页 / 三个功能页 / settings（底部进入的整页设置） */
export type ViewTab = "translate" | SidebarTab | "settings";

interface SidebarProps {
  tab: ViewTab;
  onTab: (tab: ViewTab) => void;
  themeMode: ThemeMode;
  onTheme: (mode: ThemeMode) => void;
}

const TABS: Array<{ key: SidebarTab; tKey: TranslationKey; icon: typeof HistoryIcon }> = [
  { key: "history", tKey: "nav.history", icon: HistoryIcon },
  { key: "vocabulary", tKey: "nav.vocabulary", icon: NotebookIcon },
  { key: "dictionary", tKey: "nav.dictionary", icon: BookIcon },
];

/** 左侧竖向导航 rail */
export function Sidebar({ tab, onTab, themeMode, onTheme }: SidebarProps) {
  const { t } = useAppLocale();
  const cycleModeLabel =
    themeMode === "light"
      ? t("theme.light")
      : themeMode === "dark"
        ? t("theme.dark")
        : t("common.followSystem");
  const navClass = (active: boolean) =>
    `flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors ${
      active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover hover:text-ink"
    }`;
  return (
    <aside
      className="flex h-full w-[64px] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-bg py-4"
      aria-label={t("nav.mainNav")}
    >
      {/* 主页入口：地球图标。样式/尺寸/间距全部走 navClass，与下方三个功能项完全一致
          （h-10 w-10 + rounded-[10px] + gap-1.5，图标 17px）—— 不给任何单项做特殊强调。 */}
      <button
        className={navClass(tab === "translate")}
        title={t("nav.home")}
        aria-current={tab === "translate" ? "page" : undefined}
        onClick={() => onTab("translate")}
      >
        <LanguagesIcon size={17} />
      </button>

      {TABS.map(({ key, tKey, icon: Icon }) => {
        const active = tab === key;
        const label = t(tKey);
        return (
          <button
            key={key}
            title={label}
            aria-current={active ? "page" : undefined}
            onClick={() => onTab(key)}
            className={navClass(active)}
          >
            <Icon size={17} />
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <button
          title={t("theme.cycleTip", { mode: cycleModeLabel })}
          onClick={() =>
            onTheme(themeMode === "light" ? "dark" : themeMode === "dark" ? "system" : "light")
          }
          className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[16px] leading-none text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          {/* 主题三态符号是字体字形（不是 SVG），按基线 14px 渲染时墨迹约 11px，
              比 17px 线稿图标（约 12.8px）小一档，故显式提到 16px 对齐视觉尺寸。 */}
          {themeMode === "dark" ? "◐" : themeMode === "system" ? "◑" : "○"}
        </button>
        <button
          title={t("nav.settings")}
          aria-current={tab === "settings" ? "page" : undefined}
          onClick={() => onTab("settings")}
          className={navClass(tab === "settings")}
        >
          <SettingsIcon size={17} />
        </button>
      </div>
    </aside>
  );
}
