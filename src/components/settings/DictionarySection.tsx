import { useState } from "react";
import { saveDictPaths as persistDictPaths } from "@/storage";
import { useToast } from "@/components/ui/Toast";

interface DictionarySectionProps {
  registerRef: (id: string) => (el: HTMLDivElement | null) => void;
}

export function DictionarySection({ registerRef }: DictionarySectionProps) {
  const { showToast } = useToast();
  const [dictPaths, setDictPaths] = useState<string[]>([]);

  const saveDictPaths = async (paths: string[]) => {
    try {
      await persistDictPaths(paths);
      setDictPaths(paths);
      showToast("词典路径已保存", "success");
    } catch (error) {
      console.error("[Settings] 保存词典路径失败:", error);
      showToast("保存词典路径失败", "error");
    }
  };

  const addDictPath = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        saveDictPaths([...dictPaths, selected]);
      }
    } catch (error) {
      console.error("[Settings] 打开目录选择器失败:", error);
      showToast("目录选择器不可用", "error");
    }
  };

  const removeDictPath = (idx: number) => {
    saveDictPaths(dictPaths.filter((_, i) => i !== idx));
  };

  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold mb-3 text-foreground">词典</h3>

      <div
        id="section-dict-paths"
        ref={registerRef("section-dict-paths")}
        className="py-2.5 border-b border-border/50"
      >
        <div className="text-sm font-medium text-foreground mb-2">词典目录</div>
        <div className="text-xs text-muted-foreground mb-3">GoldenDict DSL 目录（可添加多个，构建时逐个扫描）</div>

        <div className="space-y-2">
          {dictPaths.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 border border-dashed rounded-md text-center">
              暂无词典目录，下方添加
            </div>
          ) : (
            dictPaths.map((p, i) => (
              <div key={p} className="flex items-center justify-between px-3 py-2 border rounded-md bg-muted/30">
                <span className="text-xs font-mono truncate flex-1">{p}</span>
                <button
                  onClick={() => removeDictPath(i)}
                  className="ml-2 px-2 py-0.5 text-xs border rounded hover:bg-destructive hover:text-white shrink-0"
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-3">
          <button
            onClick={addDictPath}
            className="w-full px-3 py-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            + 选择目录…
          </button>
          <div className="text-xs text-muted-foreground mt-1.5">点击选择本地 GoldenDict 目录，可重复添加</div>
        </div>
      </div>
    </div>
  );
}