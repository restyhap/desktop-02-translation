import { useCallback, useEffect, useState } from "react";

import { useAppLocale } from "@/lib/i18n";
import { getHookStatus, openInputMonitoring } from "@/storage";
import type { HookStatus } from "@/types/shortcuts";

/** 轮询间隔（ms）。授权状态只有用户在系统设置里改动才会变，2s 足够跟手又不空转。 */
const POLL_INTERVAL = 2000;

/** 权限文案里的诊断数字：让用户能自己判断「是真没授权」还是「只是还没按键」 */
function formatKeyEvents(n: number): string {
  return String(n);
}

/**
 * 主页顶部的「输入监控未授权」故障横幅。
 *
 * 为什么放主页而不是设置页：未授权时**全局快捷键完全无反应**，用户往往是在主页
 * 划词、按 ⌘+C 却毫无动静时才发现出问题的。设置页是「主动去配置」才会看到的地方，
 * 把故障提示放在那里等于静默失败（本项目明确禁止）。这里同时给出两个出口：
 * 跳系统设置（解决授权）与跳设置页（改快捷键本身）。
 *
 * 判定式 `!listening || (listen_event !== true && key_events === 0)`：
 * - `listen_event` 由后端 `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)` 给出，
 *   是唯一会比对 csreq 的信号（`CGPreflightListenEventAccess` 在 csreq 不匹配时
 *   仍返回 true，`CGEventTapCreate` 未授权时照样返回非 NULL，两者都不可信）。
 * - `key_events === 0` 是**反向保险**：本次会话一旦真收到过按键事件，就证明授权
 *   有效，此时即便 `listen_event` 读数异常也绝不误报故障。
 */
export function ShortcutPermBanner({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { t } = useAppLocale();
  const [status, setStatus] = useState<HookStatus | null>(null);

  const refresh = useCallback(() => {
    getHookStatus()
      .then(setStatus)
      .catch((err: unknown) => {
        // 读不到状态不等于故障，横幅保持隐藏即可；错误只进控制台（用户看不到）
        console.error("[ShortcutPermBanner] 读取监听状态失败:", err);
      });
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (status === null) return null;

  const broken = !status.listening || (status.listen_event !== true && status.key_events === 0);
  if (!broken) return null;

  const openSettings = () => {
    openInputMonitoring().catch((err: unknown) => {
      console.error("[ShortcutPermBanner] 打开输入监控设置失败:", err);
    });
  };

  return (
    <div className="mt-5 flex items-start gap-3 rounded-card border border-line bg-gold-soft px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-6 text-ink">{t("app.shortcutPermWarn")}</div>
        <div className="mt-0.5 text-xs leading-5 text-ink-3">
          {t("app.shortcutPermStats")
            .replace("{events}", formatKeyEvents(status.key_events))
            .replace("{state}", status.listening ? t("app.shortcutPermRunning") : t("app.shortcutPermStopped"))}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <button
            type="button"
            onClick={openSettings}
            className="cursor-pointer text-xs font-medium text-accent underline-offset-2 hover:underline"
          >
            {t("app.shortcutPermBtn")}
          </button>
          <button
            type="button"
            onClick={onGoToSettings}
            className="cursor-pointer text-xs font-medium text-ink-2 underline-offset-2 hover:text-accent hover:underline"
          >
            {t("app.shortcutPermSettingsBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}