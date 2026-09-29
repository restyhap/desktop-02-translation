/**
 * 词典词条视图 (右侧主区) — 对齐 src/components/DictEntryView.tsx
 *
 * 增补：资源 chips 懒加载（点击才拉清单）→ 音频播放 / 图片显示。
 * 移植时替换 dictLoadResource / dictGetResource 的 import 为 @/storage/dict 即可。
 */
import { useEffect, useState } from "react";
import type { DictEntry } from "@/lib/types";
import { useAppLocale } from "@/lib/i18n";
import { DictBody, useParsed } from "@/components/DictBody";
import { dictLoadResource, dictGetResource, type DictResource } from "@/mock/store";
import { XIcon } from "@/components/icons";

interface DictEntryViewProps {
  entry: DictEntry & { dictionary_name?: string };
  onClose: () => void;
}

export function DictEntryView({ entry, onClose }: DictEntryViewProps) {
  const { t } = useAppLocale();
  const lines = useParsed(entry.definition);
  // 资源 chips（懒加载）
  const [resources, setResources] = useState<DictResource[] | null>(null);
  const [resLoading, setResLoading] = useState(false);
  // 已加载的资源内容：dataUrl（image 直接显示；audio 播放）
  const [loaded, setLoaded] = useState<Record<string, string | null>>({});
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    // 换词时重置资源区
    setResources(null);
    setLoaded({});
    setAudioEl(null);
  }, [entry.word]);

  const loadChip = async () => {
    if (resources) {
      setResources(null);
      return;
    }
    setResLoading(true);
    const list = await dictLoadResource(entry.word);
    setResources(list);
    setResLoading(false);
  };

   const openResource = async (res: DictResource) => {
    const key = `${res.zipFile}/${res.filename}`;
    if (!(key in loaded)) {
      const dataUrl = await dictGetResource(res);
      setLoaded((prev) => ({ ...prev, [key]: dataUrl }));
      if (res.kind === "image" && dataUrl) return;
    }
    if (res.kind === "audio") {
      const dataUrl = loaded[key] ?? "no-audio";
      if (dataUrl && dataUrl !== "no-audio") {
        const el = new Audio(dataUrl);
        setAudioEl(el);
        void el.play();
      }
    }
  };

  return (
    <div className="rise-in flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
      <div className="rounded-card border border-line bg-bg-elevated shadow-sm">
        {/* 头部：词头 + 词典名 + 关闭 */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-3">
          <span className="font-mono">{entry.dictionary_name ?? t("dict.fallbackName")}</span>
          <button
            onClick={onClose}
            title={t("dict.collapseDef")}
            className="ml-auto grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <XIcon size={13} />
          </button>
        </div>
        <DictBody lines={lines} entryTitle={entry.word_raw || entry.word} />

        {/* 资源 chips：点击展开懒加载清单 */}
        <div className="flex items-center gap-1.5 border-t border-line px-4 py-2">
          <button
            onClick={loadChip}
            className="rounded-md bg-bg-inset px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            {t("dict.resources")}{resources ? " ▾" : resLoading ? " …" : ""}
          </button>
          {resources?.map((res) => {
            const key = `${res.zipFile}/${res.filename}`;
            void key;
            return (
              <button
                key={key}
                onClick={() => openResource(res)}
                title={res.kind === "audio" ? t("dict.playAudio") : t("dict.viewImage")}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-2 transition-colors hover:border-accent/40 hover:text-accent"
              >
                {res.kind === "audio" ? "🔊" : "🖼"} {res.label}
              </button>
            );
          })}
        </div>
        {/* 音频控件 + 内嵌图片 */}
        {(audioEl || Object.values(loaded).some((v) => v?.startsWith("data:image"))) && (
          <div className="border-t border-line px-4 py-2">
            {audioEl && <audio controls src={audioEl.src} className="h-7 w-44" />}
            {Object.entries(loaded)
              .filter(([, v]) => v?.startsWith("data:image"))
              .map(([k, v]) => (
                <img
                  key={k}
                  src={v!}
                  alt={t("dict.imageAlt")}
                  className="max-h-64 rounded-md border border-line"
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
