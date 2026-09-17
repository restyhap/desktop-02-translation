import { useState, useMemo } from "react";
import { dictGetResource, dictLoadResources, type DictResource } from "@/storage/dict";
import { parseDefinition, type DictLine } from "@/lib/parseDefinition";

export interface DictEntry {
  word: string;
  word_raw: string;
  definition: string;
  audio_ref?: string | null;
}

function LineView({ line }: { line: DictLine }) {
  switch (line.type) {
    case "pos":
      return (
        <div className="flex items-baseline gap-2 mt-2.5 first:mt-0">
          <span className="shrink-0 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-semibold">
            {line.label}
          </span>
          {line.html && (
            <span
              className="text-xs text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: line.html }}
            />
          )}
        </div>
      );
    case "group":
      return (
        <div className="mt-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
          {line.label}
        </div>
      );
    case "sense":
      return (
        <div className="flex gap-2 mt-1.5 pl-0.5">
          <span className="w-5 shrink-0 text-right text-primary font-semibold text-sm leading-6">
            {line.label}
          </span>
          <span
            className="min-w-0 flex-1 text-sm leading-6"
            dangerouslySetInnerHTML={{ __html: line.html }}
          />
        </div>
      );
    case "subsense":
      return (
        <div className="flex gap-2 mt-0.5 pl-7">
          <span className="w-4 shrink-0 text-muted-foreground text-sm leading-6">
            {line.label}
          </span>
          <span
            className="min-w-0 flex-1 text-sm leading-6"
            dangerouslySetInnerHTML={{ __html: line.html }}
          />
        </div>
      );
    case "example":
      return (
        <div
          className="pl-9 text-sm text-muted-foreground italic leading-6"
          dangerouslySetInnerHTML={{ __html: line.html }}
        />
      );
    case "meta":
      return (
        <div className="mt-1 text-xs text-muted-foreground/80 leading-5">
          <span
            dangerouslySetInnerHTML={{ __html: line.html }}
          />
        </div>
      );
    default:
      return (
        <div
          className="pl-0.5 text-sm leading-6"
          dangerouslySetInnerHTML={{ __html: line.html }}
        />
      );
  }
}

function ResourceChips({ entry }: { entry: DictEntry }) {
  const [resources, setResources] = useState<DictResource[]>([]);
  const [images, setImages] = useState<{ filename: string; url: string }[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingRes, setLoadingRes] = useState(false);

  const loadResources = async () => {
    if (resources.length > 0 || loadingRes) return;
    setLoadingRes(true);
    try {
      const res = await dictLoadResources(entry.word);
      setResources(res);
    } catch (err) {
      console.error("[Dictionary] 加载资源失败:", err);
    } finally {
      setLoadingRes(false);
    }
  };

  const playAudio = async (res: DictResource) => {
    try {
      const data = await dictGetResource(res.zip_file, res.filename);
      const url = `data:${data.mime};base64,${data.data_base64}`;
      setAudioUrl(url);
      new Audio(url).play().catch((e) => console.error("播放失败:", e));
    } catch (err) {
      console.error("[Dictionary] 提取音频失败:", err);
    }
  };

  const showImage = async (res: DictResource) => {
    if (images.some((i) => i.filename === res.filename)) return;
    try {
      const data = await dictGetResource(res.zip_file, res.filename);
      const url = `data:${data.mime};base64,${data.data_base64}`;
      setImages((prev) => [...prev, { filename: res.filename, url }]);
    } catch (err) {
      console.error("[Dictionary] 提取图片失败:", err);
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={loadResources}
        className="text-xs text-muted-foreground hover:text-primary transition-colors"
        title="加载发音与图片"
      >
        🔊 资源
      </button>

      {(resources.length > 0 || loadingRes) && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {resources.map((res, i) => (
              <button
                key={i}
                onClick={() => (res.kind === "audio" ? playAudio(res) : showImage(res))}
                className="px-2 py-1 bg-muted rounded text-xs hover:bg-primary/15 transition-colors truncate max-w-[160px]"
                title={res.filename}
              >
                {res.kind === "audio" ? "🔊" : "🖼️"} {res.filename}
              </button>
            ))}
          </div>

          {audioUrl && (
            <audio key={audioUrl} src={audioUrl} controls className="w-full h-8" />
          )}

          {images.map((img) => (
            <img
              key={img.filename}
              src={img.url}
              alt={img.filename}
              className="max-h-48 rounded border"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DictEntryView({ entry }: { entry: DictEntry }) {
  const lines = useMemo(() => parseDefinition(entry.definition), [entry.definition]);

  return (
    <div className="flex-1 overflow-auto space-y-2 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-base">{entry.word}</span>
        {entry.word_raw && (
          <span className="text-muted-foreground text-xs">{entry.word_raw}</span>
        )}
      </div>
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <LineView key={i} line={line} />
        ))}
      </div>
      <ResourceChips entry={entry} />
    </div>
  );
}