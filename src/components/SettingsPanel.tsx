import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { arrayMove } from "@dnd-kit/helpers";
import { Modifier } from "@dnd-kit/abstract";
import type { DragOperation } from "@dnd-kit/abstract";
import type { Draggable as DomDraggable, Droppable as DomDroppable } from "@dnd-kit/dom";
import { restrictShapeToBoundingRectangle } from "@dnd-kit/abstract/modifiers";
import { useToast } from "@/components/ui/Toast";
import { UpdateButton } from "@/components/UpdateButton";
import type { AppSettings } from "@/types/settings";
import type { ShortcutConfig } from "@/types/shortcuts";
import { SUPPORTED_LANGUAGES, ApiKeyRecord, EngineInfo } from "@/types/translation";
import { ShortcutRecorder } from "./ShortcutRecorder";

interface SettingsPanelProps {
  onClose?: () => void;
}

const DEFAULT_ENGINES: EngineInfo[] = [
  { service_name: "google", display_name: "谷歌翻译", url: "https://translation.googleapis.com/language/translate/v2", requires_app_id: false, requires_api_key: true },
  { service_name: "deepl", display_name: "DeepL", url: "https://api.deepl.com/v2/translate", requires_app_id: false, requires_api_key: true },
  { service_name: "baidu", display_name: "百度翻译", url: "https://fanyi-api.baidu.com/api/trans/vip/translate", requires_app_id: true, requires_api_key: true },
  { service_name: "youdao", display_name: "有道翻译", url: "https://openapi.youdao.com/api", requires_app_id: true, requires_api_key: true },
  { service_name: "caiyun", display_name: "彩云小译", url: "https://api.caiyunapp.com/v1/translator", requires_app_id: false, requires_api_key: true },
  { service_name: "ali", display_name: "阿里翻译", url: "http://mt.cn-hangzhou.aliyuncs.com/api/translate/web/general", requires_app_id: true, requires_api_key: true },
  { service_name: "volcano", display_name: "火山翻译", url: "https://translate-api.volcanoengine.com/", requires_app_id: true, requires_api_key: true },
];

// 限制拖拽位移不超出卡片父容器（翻译服务列表）
// 用 shape.initial（拖拽起始矩形）作边界基准，避免与 Feedback 的增量 shape 更新叠加导致位移翻倍
class RestrictToParentElement extends Modifier {
  apply(operation: DragOperation<DomDraggable, DomDroppable>) {
    const { transform, shape, source } = operation;
    const initialShape = shape?.initial;
    const parent = source?.element?.parentElement;
    if (!initialShape || !parent) return transform;
    return restrictShapeToBoundingRectangle(
      initialShape,
      transform,
      parent.getBoundingClientRect(),
    );
  }
}

interface SettingsPanelProps {
  onClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  sectionId: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "通用",
    items: [
      { id: "launch", label: "开机自启", sectionId: "section-general" },
      { id: "close-behavior", label: "关闭行为", sectionId: "section-close-behavior" },
      { id: "auto-update", label: "自动更新", sectionId: "section-auto-update" },
    ],
  },
  {
    title: "翻译",
    items: [
      { id: "source-lang", label: "默认源语言", sectionId: "section-source-lang" },
      { id: "target-lang", label: "默认目标语言", sectionId: "section-target-lang" },
      { id: "api-keys", label: "API Key", sectionId: "section-api-keys" },
      { id: "auto-detect", label: "自动检测", sectionId: "section-auto-detect" },
    ],
  },
  {
    title: "外观",
    items: [
      { id: "theme", label: "主题", sectionId: "section-theme" },
      { id: "font-size", label: "字体大小", sectionId: "section-font-size" },
      { id: "opacity", label: "不透明度", sectionId: "section-opacity" },
      { id: "hide-delay", label: "自动隐藏延迟", sectionId: "section-hide-delay" },
    ],
  },
  {
    title: "词典",
    items: [
      { id: "dict-paths", label: "词典目录", sectionId: "section-dict-paths" },
    ],
  },
  {
    title: "快捷键",
    items: [
      { id: "shortcut-translate", label: "翻译", sectionId: "section-shortcut-translate" },
      { id: "shortcut-show-main", label: "显示主窗口", sectionId: "section-shortcut-show-main" },
    ],
  },
];


// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  general: { launchAtStartup: false, closeBehavior: "minimizeToTray", checkUpdates: true, language: "zh" },
  translation: { defaultSourceLang: "en", defaultTargetLang: "zh", defaultEngine: "google", autoDetect: true, pasteToTranslate: false },
  appearance: { theme: "system", fontSize: "medium", opacity: 100, hideDelay: 5 },
  shortcuts: { translate: "", show_main: "" },
  llm: { endpoint: "", apiKey: "" },
};

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { showToast } = useToast();
   const [settings, setSettings] = useState<AppSettings | null>(null);
   const [shortcuts, setShortcuts] = useState<ShortcutConfig>({ translate: "", show_main: "" });
   const [shortcutsLoaded, setShortcutsLoaded] = useState(false);
   const [activeNavId, setActiveNavId] = useState<string>("launch");
   const [loadError, setLoadError] = useState<string | null>(null);
 const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
   const [engines, setEngines] = useState<EngineInfo[]>([]);
  // ponytail: engines 现在只在刷新时用, 不再渲染到 JSX (默认引擎选择移到了 AddKeyModal)
  void engines;
 const [showAddModal, setShowAddModal] = useState(false);
  const [dictPaths, setDictPaths] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const apiKeysRef = useRef<ApiKeyRecord[]>([]);
  apiKeysRef.current = apiKeys;

    // 加载翻译引擎（用于添加服务时判断是否已存在同名服务）
    const loadEngines = async () => {
      try {
        const result = await invoke<EngineInfo[]>("get_engines_cmd");
        setEngines(result);
      } catch {
        setEngines(DEFAULT_ENGINES);
      }
    };

    // ponytail: 同名服务检测在 handleAddApiKey 前做; engines state 保留供后续扩展
    void engines;

   useEffect(() => {
     const loadSettings = async () => {
       try {
         const result = await invoke<any>("get_all_settings_cmd");
         let loadedSettings: AppSettings = { ...DEFAULT_SETTINGS };
         
         if (result && typeof result === "object") {
           const r = result as any;
           if (r.general) loadedSettings.general = { ...DEFAULT_SETTINGS.general, ...r.general };
           if (r.translation) loadedSettings.translation = { ...DEFAULT_SETTINGS.translation, ...r.translation };
           if (r.appearance) loadedSettings.appearance = { ...DEFAULT_SETTINGS.appearance, ...r.appearance };
           if (r.shortcuts) {
             const sc = r.shortcuts;
             loadedSettings.shortcuts = { ...DEFAULT_SETTINGS.shortcuts, translate: sc.translate, show_main: sc.showMain || (sc as unknown as Record<string, string>).showMain };
           }
           if (r.llm) loadedSettings.llm = { ...DEFAULT_SETTINGS.llm, ...r.llm };
         }
         
         setSettings(loadedSettings);
         setLoadError(null);
       } catch (error) {
         console.error("[Settings] 加载设置失败:", error);
         setLoadError(error instanceof Error ? error.message : "加载失败");
         setSettings(DEFAULT_SETTINGS);
       }
     };

     const loadShortcuts = async () => {
       try {
         const config = await invoke<ShortcutConfig>("get_shortcuts_cmd");
         setShortcuts(config);
         setShortcutsLoaded(true);
       } catch {
         setShortcutsLoaded(true);
       }
     };

      const loadApiKeys = async () => {
        try {
          const keys = await invoke<ApiKeyRecord[]>("list_api_keys_cmd");
          setApiKeys(keys);
        } catch (error) {
          console.error("[Settings] 加载 API Key 失败:", error);
        }
      };

      loadSettings();
      loadShortcuts();
      loadApiKeys();
      loadEngines();
    }, []);

  // 滚动监听
  useEffect(() => {
    const handleScroll = () => {
      const content = contentRef.current;
      if (!content) return;

      let closestId = navGroups[0].items[0].sectionId;
      let closestDistance = Infinity;

      navGroups.forEach((group) => {
        group.items.forEach((item) => {
          const el = sectionRefs.current[item.sectionId];
          if (el) {
            const rect = el.getBoundingClientRect();
            const distance = Math.abs(rect.top - content.getBoundingClientRect().top);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestId = item.sectionId;
            }
          }
        });
      });

      const activeItem = navGroups
        .flatMap((g) => g.items)
        .find((item) => item.sectionId === closestId);
      if (activeItem) {
        setActiveNavId(activeItem.id);
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener("scroll", handleScroll);
      return () => content.removeEventListener("scroll", handleScroll);
    }
  }, []);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionRefs.current[sectionId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

const updateSetting = (section: keyof AppSettings, key: string, value: any) => {
     setSettings((prev) => {
       if (!prev) return prev;
       const updated = {
         ...prev,
         [section]: { ...prev[section], [key]: value },
       };
       // 单项即保存
       invoke("save_all_settings_cmd", { settings: updated }).catch(() => {});
       return updated;
     });
   };

   const refreshApiKeys = async () => {
    try {
      const keys = await invoke<ApiKeyRecord[]>("list_api_keys_cmd");
      setApiKeys(keys);
      return keys;
    } catch (error) {
      console.error("[Settings] 刷新 API Key 失败:", error);
      return [];
    }
  };

 const handleAddApiKey = async (name: string, appId: string, key: string, url: string, sort: number, asDefault?: boolean) => {
      if (!name.trim() || !key.trim()) {
        showToast("名称和密钥都是必填项", "error");
        return;
      }
      const serviceName = name.trim().toLowerCase().replace(/\s+/g, "_");
      
      try {
        await invoke("add_api_key_cmd", {
          service: serviceName,
          display_name: name.trim(),
          app_id: appId.trim() || null,
          key: key.trim(),
          sort,
        });
        // 同时添加到翻译引擎表
        await invoke("add_engine_cmd", {
          service_name: serviceName,
          display_name: name.trim(),
          url: url.trim(),
          requires_app_id: !!appId.trim(),
          requires_api_key: true,
        });
        if (asDefault && settings) {
          const updated = { ...settings, translation: { ...settings.translation, defaultEngine: serviceName } };
          await invoke("save_all_settings_cmd", { settings: updated });
          setSettings(updated);
        }
        showToast("翻译服务添加成功", "success");
       setShowAddModal(false);
       await refreshApiKeys();
       // 刷新引擎列表
       try {
         const result = await invoke<EngineInfo[]>("get_engines_cmd");
         setEngines(result);
       } catch {}
     } catch (error) {
       console.error("[Settings] 添加失败:", error);
       showToast("添加失败，请重试", "error");
     }
   };

    const handleDeleteApiKey = async (serviceName: string) => {
      try {
        await invoke("delete_api_key_cmd", { service: serviceName });
        await invoke("delete_engine_cmd", { service_name: serviceName });
        showToast("已删除", "success");
        await refreshApiKeys();
        try {
          const result = await invoke<EngineInfo[]>("get_engines_cmd");
          setEngines(result);
        } catch {}
      } catch (error) {
        console.error("[Settings] 删除 API Key 失败:", error);
        showToast("删除失败，请重试", "error");
      }
    };

    const saveDictPaths = async (paths: string[]) => {
      try {
        await invoke("save_dict_paths_cmd", { paths });
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


   if (!settings) {
     return (
       <div className="flex items-center justify-center h-full">
         <div className="text-center">
           <div className="text-muted-foreground mb-2">加载中...</div>
           {loadError && <div className="text-xs text-red-500 mt-2">{loadError}</div>}
         </div>
</div>
  );
}

function KeyItemCard({ item, onDelete }: {
  item: ApiKeyRecord;
  onDelete?: (serviceName: string) => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border rounded-md bg-background cursor-pointer active:cursor-grabbing">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{item.display_name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
          ID: {item.app_id || "—"} · Key: {item.api_key ? "••••" + item.api_key.slice(-4) : "—"}
        </div>
      </div>
      {onDelete && (
        <button
          onClick={() => onDelete(item.service_name)}
          className="ml-2 px-2 py-1 text-xs border rounded hover:bg-destructive hover:text-white shrink-0"
          title="删除此服务"
        >
          删除
        </button>
      )}
    </div>
  );
}

function SortableKeyItem({
  item,
  index,
  onDelete,
}: {
  item: ApiKeyRecord;
  index: number;
  onDelete: (serviceName: string) => void;
}) {
  const { ref, isDragging } = useSortable({
    id: item.service_name,
    index,
    transition: { duration: 300, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
  });

  return (
    <div
      ref={ref}
      className={`${isDragging ? "opacity-60 ring-2 ring-primary/40" : ""} rounded-md`}
    >
      <KeyItemCard item={item} onDelete={onDelete} />
    </div>
  );
}

   return (
     <div className="flex flex-col h-full bg-card rounded-lg border overflow-hidden">
       {/* 标题栏 - 固定高度 56px */}
       <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
         <h2 className="text-lg font-semibold">设置</h2>
         <button
           onClick={onClose}
           className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
         >
           ×
         </button>
       </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧导航 - 固定宽度 224px */}
        <div className="w-56 border-r flex flex-col py-4 overflow-y-auto shrink-0 bg-muted/20">
          {navGroups.map((group, groupIndex) => (
            <div key={group.title} className="mb-2">
              {groupIndex > 0 && <div className="border-t border-border/50 mx-3 my-3" />}
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.title}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveNavId(item.id);
                    scrollToSection(item.sectionId);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                    activeNavId === item.id
                      ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 右侧内容区 */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-8 flex justify-center">
          <div className="w-full max-w-xl">
            
            {/* ========== 通用设置 ========== */}
            <div className="mb-6">
              <h3 className="text-base font-semibold mb-3 text-foreground">通用</h3>
              
              {/* 开机自启 */}
              <div 
                id="section-general" 
                ref={(el) => { sectionRefs.current["section-general"] = el; }}
                className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">开机自启</div>
                  <div className="text-xs text-muted-foreground mt-0.5">系统启动时自动运行</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.general.launchAtStartup}
                  onChange={(e) => updateSetting("general", "launchAtStartup", e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </div>

              {/* 关闭行为 */}
              <div 
                id="section-close-behavior" 
                ref={(el) => { sectionRefs.current["section-close-behavior"] = el; }}
                className="flex items-center justify-between py-2.5 border-b border-border/50"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">关闭行为</div>
                  <div className="text-xs text-muted-foreground mt-0.5">点击关闭按钮时的行为</div>
                </div>
                <select
                  value={settings.general.closeBehavior}
                  onChange={(e) => updateSetting("general", "closeBehavior", e.target.value)}
                  className="px-3 py-1.5 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="minimizeToTray">最小化到托盘</option>
                  <option value="exit">退出程序</option>
                </select>
              </div>

              {/* 自动更新 */}
               <div 
                 id="section-auto-update" 
                 ref={(el) => { sectionRefs.current["section-auto-update"] = el; }}
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
                     checked={settings.general.checkUpdates}
                     onChange={(e) => updateSetting("general", "checkUpdates", e.target.checked)}
                     className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                   />
                 </div>
               </div>
             </div>

            {/* ========== 翻译设置 ========== */}
            <div className="mb-6">
              <h3 className="text-base font-semibold mb-3 text-foreground">翻译</h3>
              
              {/* 默认源语言 */}
              <div 
                id="section-source-lang" 
                ref={(el) => { sectionRefs.current["section-source-lang"] = el; }}
                className="py-2.5 border-b border-border/50"
              >
                <div className="text-sm font-medium text-foreground mb-2">默认源语言</div>
                <select
                  value={settings.translation.defaultSourceLang}
                  onChange={(e) => updateSetting("translation", "defaultSourceLang", e.target.value)}
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
                ref={(el) => { sectionRefs.current["section-target-lang"] = el; }}
                className="py-2.5 border-b border-border/50"
              >
                <div className="text-sm font-medium text-foreground mb-2">默认目标语言</div>
                <select
                  value={settings.translation.defaultTargetLang}
                  onChange={(e) => updateSetting("translation", "defaultTargetLang", e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>

               {/* 默认引擎在「添加翻译服务」弹窗内选择（新建服务时可设为默认） */}

               {/* API Key：数据库真实数据展示 */}
              <div 
                id="section-api-keys" 
                ref={(el) => { sectionRefs.current["section-api-keys"] = el; }}
                className="py-2.5 border-b border-border/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-foreground">翻译服务 API Key ( 拖动改变标签显示顺序 )</div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 shrink-0"
                    title="添加翻译服务"
                  >
                    + 添加
                  </button>
                </div>

                {apiKeys.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-md">
                    暂无已配置的翻译服务，点击「+ 添加」创建
                  </div>
                ) : (
<DragDropProvider
            modifiers={[RestrictToParentElement]}
            onDragOver={(event) => {
                      const { source, target } = event.operation;
                      if (!source || !target || source.id === target.id) return;
                      setApiKeys((prev) => {
                        const from = prev.findIndex((k) => k.service_name === String(source.id));
                        const to = prev.findIndex((k) => k.service_name === String(target.id));
                        if (from < 0 || to < 0 || from === to) return prev;
                        return arrayMove(prev, from, to);
                      });
                    }}
                    onDragEnd={() => {
                      invoke("reorder_api_keys_cmd", {
                        ordered: apiKeysRef.current.map((k) => k.service_name),
                      }).catch(() => showToast("保存排序失败", "error"));
                    }}
                  >
                    <div className="space-y-2">
                      {apiKeys.map((item, index) => (
                        <SortableKeyItem
                          key={item.service_name}
                          item={item}
                          index={index}
                          onDelete={handleDeleteApiKey}
                        />
                      ))}
                    </div>
                    <DragOverlay>
                      {(source) => {
                        const item = apiKeys.find((k) => k.service_name === String(source.id));
                        return item ? <KeyItemCard item={item} /> : null;
                      }}
                    </DragOverlay>
                  </DragDropProvider>
                )}
              </div>

              {/* 自动检测语言 */}
              <div 
                id="section-auto-detect" 
                ref={(el) => { sectionRefs.current["section-auto-detect"] = el; }}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">自动检测语言</div>
                  <div className="text-xs text-muted-foreground mt-0.5">自动识别源语言</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.translation.autoDetect}
                  onChange={(e) => updateSetting("translation", "autoDetect", e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </div>
            </div>

             {/* ========== 词典设置 ========== */}
             <div className="mb-6">
               <h3 className="text-base font-semibold mb-3 text-foreground">词典</h3>

               <div
                 id="section-dict-paths"
                 ref={(el) => { sectionRefs.current["section-dict-paths"] = el; }}
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

             {/* ========== 外观设置 ========== */}
            <div className="mb-6">
              <h3 className="text-base font-semibold mb-3 text-foreground">外观</h3>
              
              {/* 主题 */}
              <div 
                id="section-theme" 
                ref={(el) => { sectionRefs.current["section-theme"] = el; }}
                className="py-2.5 border-b border-border/50"
              >
                <div className="text-sm font-medium text-foreground mb-2">主题</div>
                <select
                  value={settings.appearance.theme}
                  onChange={(e) => updateSetting("appearance", "theme", e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                  <option value="system">跟随系统</option>
                </select>
              </div>

              {/* 字体大小 */}
              <div 
                id="section-font-size" 
                ref={(el) => { sectionRefs.current["section-font-size"] = el; }}
                className="py-2.5 border-b border-border/50"
              >
                <div className="text-sm font-medium text-foreground mb-2">字体大小</div>
                <select
                  value={settings.appearance.fontSize}
                  onChange={(e) => updateSetting("appearance", "fontSize", e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="small">小</option>
                  <option value="medium">中</option>
                  <option value="large">大</option>
                </select>
              </div>

              <div 
                id="section-opacity" 
                ref={(el) => { sectionRefs.current["section-opacity"] = el; }}
                className="py-2.5 border-b border-border/50"
              >
                <div className="text-sm font-medium text-foreground mb-2">不透明度: {settings.appearance.opacity}%</div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={settings.appearance.opacity}
                  onChange={(e) => updateSetting("appearance", "opacity", parseInt(e.target.value))}
                  className="w-full mt-2"
                />
              </div>

              {/* 自动隐藏延迟 */}
              <div 
                id="section-hide-delay" 
                ref={(el) => { sectionRefs.current["section-hide-delay"] = el; }}
                className="py-3"
              >
                <div className="text-sm font-medium text-foreground mb-2">自动隐藏延迟</div>
                <div className="text-xs text-muted-foreground mb-2">鼠标离开弹窗后自动隐藏</div>
                <select
                  value={settings.appearance.hideDelay}
                  onChange={(e) => updateSetting("appearance", "hideDelay", Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value={0}>不隐藏</option>
                  <option value={3}>3 秒</option>
                  <option value={5}>5 秒</option>
                  <option value={10}>10 秒</option>
                </select>
              </div>
            </div>

            {/* ========== 快捷键设置 ========== */}
            <div className="mb-6">
              <h3 className="text-base font-semibold mb-3 text-foreground">快捷键</h3>
              
              {/* 翻译快捷键 */}
              <div
                id="section-shortcut-translate"
                ref={(el) => { sectionRefs.current["section-shortcut-translate"] = el; }}
                className="py-2.5 border-b border-border/50"
              >
                <div className="text-sm font-medium text-foreground mb-2">翻译快捷键</div>
                <div className="text-xs text-muted-foreground mb-2">双击目标键触发翻译</div>
                <ShortcutRecorder
                  value={shortcuts.translate}
                  onChange={(value) => {
                    const updated = { ...shortcuts, translate: value };
                    setShortcuts(updated);
                    invoke("update_shortcuts_cmd", { config: updated });
                  }}
                  disabled={!shortcutsLoaded}
                />
              </div>

              {/* 显示主窗口 */}
              <div 
                id="section-shortcut-show-main" 
                ref={(el) => { sectionRefs.current["section-shortcut-show-main"] = el; }}
                className="py-3"
              >
                <div className="text-sm font-medium text-foreground mb-2">显示主窗口</div>
                <div className="text-xs text-muted-foreground mb-2">双击目标键唤起主窗口</div>
                <ShortcutRecorder
                  value={shortcuts.show_main}
                  onChange={(value) => {
                    const updated = { ...shortcuts, show_main: value };
                    setShortcuts(updated);
                    invoke("update_shortcuts_cmd", { config: updated });
                  }}
                  disabled={!shortcutsLoaded}
                />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 添加 API Key 弹窗 */}
      <AddKeyModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onConfirm={handleAddApiKey}
      />
    </div>
  );
}

function AddKeyModal({ open, onClose, onConfirm }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string, appId: string, key: string, url: string, sort: number, asDefault?: boolean) => Promise<void>;
  currentDefaultEngine?: string;
}) {
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!newName.trim() || !newKey.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(newName, newId, newKey, newUrl, 0, asDefault);
      setNewName("");
      setNewId("");
      setNewKey("");
      setNewUrl("");
      setAsDefault(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-base font-semibold mb-3 text-foreground">添加翻译服务</h3>
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">名称（必填，作为服务标识）</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如: 百度翻译 / 彩云 / 自定义"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">ID（可选，百度/阿里/火山需要）</label>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="例如: 百度 AppID"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Key（必填）</label>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="粘贴或输入 Key"
              type="password"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">API URL（可选，默认使用内置地址）</label>
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="例如: https://api.example.com/translate"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 border rounded-md bg-muted/20">
            <div>
              <div className="text-sm font-medium text-foreground">设为默认翻译引擎</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {asDefault ? "翻译结果将优先使用此服务" : "保持当前默认引擎"}
              </div>
            </div>
            <input
              type="checkbox"
              checked={asDefault}
              onChange={(e) => setAsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary shrink-0"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md text-sm hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!newName.trim() || !newKey.trim() || submitting}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
