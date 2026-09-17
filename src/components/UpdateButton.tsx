import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function UpdateButton() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const checkUpdate = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const result = await invoke<string>("check_update");
      setStatus(result || "已是最新版本");
    } catch (e) {
      setStatus(`检查失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={checkUpdate}
        disabled={checking}
        className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
        title="检查更新"
      >
        {checking ? "⏳..." : "🔄 更新"}
      </button>
      {status && (
        <span className="text-xs text-muted-foreground max-w-[160px] truncate">
          {status}
        </span>
      )}
    </div>
  );
}
