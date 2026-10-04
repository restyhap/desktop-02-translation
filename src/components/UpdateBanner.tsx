import { useUpdater, checkForUpdate, downloadUpdate, installAndRestart, dismissUpdateBanner, progressPercent, formatBytes, onMac } from "@/lib/updater";
import { openInputMonitoring } from "@/storage";
import { useAppLocale } from "@/lib/i18n";

/**
 * 主页的「应用更新」横幅。
 *
 * 放主页而不是设置页，理由与 ShortcutPermBanner 一致：更新属于「有事发生」，
 * 用户在主页才看得到；设置页是主动去配置才会打开的地方。设置页「通用」分区
 * 另外有一行手动「检查更新」，两处共用 updater store 的同一份状态。
 *
 * 覆盖四种出现场景（phase 驱动，互斥渲染）：
 * - available     发现新版本，等用户点下载（**不自动下载**，未经同意就拉大包不合适）
 * - downloading   下载中，进度条 + 已下载/总量
 * - ready         下载完，等用户确认安装
 * - error         失败原因直接显示（AGENTS.md 禁止静默失败）
 * 另有 justUpdated：本次启动检测到版本号变了 —— 这是 ad-hoc 签名下「输入监控」
 * 授权必然失效的信号，必须提示用户去系统设置把开关关掉再打开。
 */
export function UpdateBanner() {
  const { t } = useAppLocale();
  const u = useUpdater();

  const openPermSettings = () => {
    openInputMonitoring().catch((err: unknown) => {
      console.error("[UpdateBanner] 打开输入监控设置失败:", err);
    });
  };

  // 刚更新完：优先级最高，只提示重新授权，不掺杂下载动作。
  // 仅 macOS：「输入监控」是 macOS 独有的门禁，其他平台无对应权限可授予。
  if (u.justUpdated && onMac()) {
    return (
      <div className="mt-5 flex items-start gap-3 rounded-card border border-line bg-gold-soft px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-6 text-ink">{t("app.updateJustUpdated", { version: u.currentVersion })}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <button
              type="button"
              onClick={openPermSettings}
              className="cursor-pointer text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              {t("app.updatePermSettingsBtn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (u.dismissed) return null;
  const visible = u.phase === "available" || u.phase === "downloading" || u.phase === "ready" || u.phase === "installing" || u.phase === "error";
  if (!visible) return null;

  const pct = progressPercent(u.downloaded, u.total);
  // 下载/安装中不允许关掉横幅：中途消失会让用户以为程序挂了
  const busy = u.phase === "downloading" || u.phase === "installing";

  return (
    <div className="mt-5 flex items-start gap-3 rounded-card border border-line bg-gold-soft px-4 py-3">
      <div className="min-w-0 flex-1">
        {u.phase === "error" && (
          <>
            <div className="text-sm leading-6 text-ink">{t("app.updateFailed")}</div>
            <div className="mt-0.5 break-words text-xs leading-5 text-ink-3">{u.error}</div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <button
                type="button"
                onClick={() => void checkForUpdate()}
                className="cursor-pointer text-xs font-medium text-accent underline-offset-2 hover:underline"
              >
                {t("app.updateRetry")}
              </button>
              <button
                type="button"
                onClick={dismissUpdateBanner}
                className="cursor-pointer text-xs font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              >
                {t("app.updateDismiss")}
              </button>
            </div>
          </>
        )}

        {u.phase === "available" && (
          <>
            <div className="text-sm leading-6 text-ink">{t("app.updateAvailable", { version: u.availableVersion ?? "" })}</div>
            {u.notes && <div className="mt-0.5 text-xs leading-5 text-ink-3">{u.notes}</div>}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <button
                type="button"
                onClick={() => void downloadUpdate()}
                className="cursor-pointer text-xs font-medium text-accent underline-offset-2 hover:underline"
              >
                {t("app.updateDownload")}
              </button>
              <button
                type="button"
                onClick={dismissUpdateBanner}
                className="cursor-pointer text-xs font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              >
                {t("app.updateLater")}
              </button>
            </div>
          </>
        )}

        {u.phase === "installing" && (
          <div className="text-sm leading-6 text-ink">{t("app.updateInstalling")}</div>
        )}

        {(u.phase === "downloading" || u.phase === "ready") && (
          <>
            <div className="text-sm leading-6 text-ink">
              {u.phase === "ready" ? t("app.updateReady") : t("app.updateDownloading")}
            </div>
            {/* total 未知（服务端未给 Content-Length）时用不确定态进度条 */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hover">
              {pct === null ? (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
              ) : (
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
              )}
            </div>
            <div className="mt-1 text-xs leading-5 text-ink-3">
              {u.phase === "ready"
                ? t("app.updateSize", { size: formatBytes(u.downloaded) })
                : pct === null
                  ? t("app.updateSize", { size: formatBytes(u.downloaded) })
                  : t("app.updateProgress", { percent: String(pct) })}
            </div>
            {u.phase === "ready" && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <button
                  type="button"
                  onClick={() => void installAndRestart()}
                  className="cursor-pointer text-xs font-medium text-accent underline-offset-2 hover:underline"
                >
                  {t("app.updateInstallRestart")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {!busy && u.phase !== "ready" && (
        <button
          type="button"
          onClick={dismissUpdateBanner}
          aria-label={t("app.updateDismiss")}
          className="shrink-0 cursor-pointer text-ink-3 transition-colors hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}