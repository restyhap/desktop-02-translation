import type { AppSettings } from "@/types/settings";
import { SUPPORTED_LANGUAGES } from "@/types/translation";

interface TranslationSectionProps {
  translation: AppSettings["translation"];
  onChange: (key: string, value: string | boolean) => void;
  registerRef: (id: string) => (el: HTMLDivElement | null) => void;
}

export function TranslationSection({ translation, onChange, registerRef }: TranslationSectionProps) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold mb-3 text-foreground">翻译</h3>

      {/* 默认源语言 */}
      <div
        id="section-source-lang"
        ref={registerRef("section-source-lang")}
        className="py-2.5 border-b border-border/50"
      >
        <div className="text-sm font-medium text-foreground mb-2">默认源语言</div>
        <select
          value={translation.defaultSourceLang}
          onChange={(e) => onChange("defaultSourceLang", e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
      </div>

      {/* 默认目标语言 */}
      <div
        id="section-target-lang"
        ref={registerRef("section-target-lang")}
        className="py-2.5 border-b border-border/50"
      >
        <div className="text-sm font-medium text-foreground mb-2">默认目标语言</div>
        <select
          value={translation.defaultTargetLang}
          onChange={(e) => onChange("defaultTargetLang", e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
      </div>

      {/* 自动检测语言 */}
      <div
        id="section-auto-detect"
        ref={registerRef("section-auto-detect")}
        className="flex items-center justify-between py-3"
      >
        <div>
          <div className="text-sm font-medium text-foreground">自动检测语言</div>
          <div className="text-xs text-muted-foreground mt-0.5">自动识别源语言</div>
        </div>
        <input
          type="checkbox"
          checked={translation.autoDetect}
          onChange={(e) => onChange("autoDetect", e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
      </div>
    </div>
  );
}