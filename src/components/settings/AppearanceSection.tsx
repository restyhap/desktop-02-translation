import type { AppSettings } from "@/types/settings";

interface AppearanceSectionProps {
  appearance: AppSettings["appearance"];
  onChange: (key: string, value: string | number) => void;
  registerRef: (id: string) => (el: HTMLDivElement | null) => void;
}

export function AppearanceSection({ appearance, onChange, registerRef }: AppearanceSectionProps) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold mb-3 text-foreground">外观</h3>

      <div
        id="section-theme"
        ref={registerRef("section-theme")}
        className="py-2.5 border-b border-border/50"
      >
        <div className="text-sm font-medium text-foreground mb-2">主题</div>
        <select
          value={appearance.theme}
          onChange={(e) => onChange("theme", e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="system">跟随系统</option>
        </select>
      </div>

      <div
        id="section-font-size"
        ref={registerRef("section-font-size")}
        className="py-2.5 border-b border-border/50"
      >
        <div className="text-sm font-medium text-foreground mb-2">字体大小</div>
        <select
          value={appearance.fontSize}
          onChange={(e) => onChange("fontSize", e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="small">小</option>
          <option value="medium">中</option>
          <option value="large">大</option>
        </select>
      </div>

      <div
        id="section-opacity"
        ref={registerRef("section-opacity")}
        className="py-2.5 border-b border-border/50"
      >
        <div className="text-sm font-medium text-foreground mb-2">不透明度: {appearance.opacity}%</div>
        <input
          type="range"
          min="50"
          max="100"
          value={appearance.opacity}
          onChange={(e) => onChange("opacity", parseInt(e.target.value))}
          className="w-full mt-2"
        />
      </div>

      <div
        id="section-hide-delay"
        ref={registerRef("section-hide-delay")}
        className="py-3"
      >
        <div className="text-sm font-medium text-foreground mb-2">自动隐藏延迟</div>
        <div className="text-xs text-muted-foreground mb-2">鼠标离开弹窗后自动隐藏</div>
        <select
          value={appearance.hideDelay}
          onChange={(e) => onChange("hideDelay", Number(e.target.value))}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value={0}>不隐藏</option>
          <option value={3}>3 秒</option>
          <option value={5}>5 秒</option>
          <option value={10}>10 秒</option>
        </select>
      </div>
    </div>
  );
}