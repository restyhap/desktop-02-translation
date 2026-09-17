import { UpdateButton } from "@/components/UpdateButton";
import type { AppSettings } from "@/types/settings";

interface GeneralSectionProps {
  general: AppSettings["general"];
  onChange: (key: string, value: string | boolean) => void;
  registerRef: (id: string) => (el: HTMLDivElement | null) => void;
}

export function GeneralSection({ general, onChange, registerRef }: GeneralSectionProps) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold mb-3 text-foreground">通用</h3>

      <div
        id="section-general"
        ref={registerRef("section-general")}
        className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
      >
        <div>
          <div className="text-sm font-medium text-foreground">开机自启</div>
          <div className="text-xs text-muted-foreground mt-0.5">系统启动时自动运行</div>
        </div>
        <input
          type="checkbox"
          checked={general.launchAtStartup}
          onChange={(e) => onChange("launchAtStartup", e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
      </div>

      <div
        id="section-close-behavior"
        ref={registerRef("section-close-behavior")}
        className="flex items-center justify-between py-2.5 border-b border-border/50"
      >
        <div>
          <div className="text-sm font-medium text-foreground">关闭行为</div>
          <div className="text-xs text-muted-foreground mt-0.5">点击关闭按钮时的行为</div>
        </div>
        <select
          value={general.closeBehavior}
          onChange={(e) => onChange("closeBehavior", e.target.value)}
          className="px-3 py-1.5 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="minimizeToTray">最小化到托盘</option>
          <option value="exit">退出程序</option>
        </select>
      </div>

      <div
        id="section-auto-update"
        ref={registerRef("section-auto-update")}
        className="flex items-center justify-between py-3"
      >
        <div>
          <div className="text-sm font-medium text-foreground">自动更新</div>
          <div className="text-xs text-muted-foreground mt-0.5">检查并安装更新</div>
        </div>
        <div className="flex items-center gap-3">
          <UpdateButton />
          <input
            type="checkbox"
            checked={general.checkUpdates}
            onChange={(e) => onChange("checkUpdates", e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
        </div>
      </div>
    </div>
  );
}