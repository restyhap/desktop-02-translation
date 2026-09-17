import { useState, useEffect, useRef } from "react";
import { addApiKey, addEngine, deleteApiKey, deleteEngine, getEngines, listApiKeys, reorderApiKeys, saveSettings } from "@/storage";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { arrayMove } from "@dnd-kit/helpers";
import { Modifier } from "@dnd-kit/abstract";
import type { DragOperation } from "@dnd-kit/abstract";
import type { Draggable as DomDraggable, Droppable as DomDroppable } from "@dnd-kit/dom";
import { restrictShapeToBoundingRectangle } from "@dnd-kit/abstract/modifiers";
import { useToast } from "@/components/ui/Toast";
import type { AppSettings } from "@/types/settings";
import { ApiKeyRecord, EngineInfo } from "@/types/translation";

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

interface ApiKeySectionProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  registerRef: (id: string) => (el: HTMLDivElement | null) => void;
}

export function ApiKeySection({ settings, onUpdateSettings, registerRef }: ApiKeySectionProps) {
  const { showToast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  // ponytail: engines 现在只在刷新时用, 不再渲染到 JSX (默认引擎选择移到了 AddKeyModal)
  void engines;
  const [showAddModal, setShowAddModal] = useState(false);
  const apiKeysRef = useRef<ApiKeyRecord[]>([]);
  apiKeysRef.current = apiKeys;

  const loadEngines = async () => {
    try {
      const result = await getEngines<EngineInfo>();
      setEngines(result);
    } catch {
      setEngines(DEFAULT_ENGINES);
    }
  };

  const refreshApiKeys = async () => {
    try {
      const keys = await listApiKeys() as ApiKeyRecord[];
      setApiKeys(keys);
      return keys;
    } catch (error) {
      console.error("[Settings] 刷新 API Key 失败:", error);
      return [];
    }
  };

  useEffect(() => {
    refreshApiKeys();
    loadEngines();
  }, []);

  const handleAddApiKey = async (name: string, appId: string, key: string, url: string, sort: number, asDefault?: boolean) => {
    if (!name.trim() || !key.trim()) {
      showToast("名称和密钥都是必填项", "error");
      return;
    }
    const serviceName = name.trim().toLowerCase().replace(/\s+/g, "_");

    try {
      await addApiKey(serviceName, name.trim(), appId.trim() || null, key.trim(), sort);
      await addEngine(serviceName, name.trim(), url.trim(), !!appId.trim());
      if (asDefault && settings) {
        const updated = { ...settings, translation: { ...settings.translation, defaultEngine: serviceName } };
        await saveSettings(updated);
        onUpdateSettings(updated);
      }
      showToast("翻译服务添加成功", "success");
      setShowAddModal(false);
      await refreshApiKeys();
      await loadEngines();
    } catch (error) {
      console.error("[Settings] 添加失败:", error);
      showToast("添加失败，请重试", "error");
    }
  };

  const handleDeleteApiKey = async (serviceName: string) => {
    try {
      await deleteApiKey(serviceName);
      await deleteEngine(serviceName);
      showToast("已删除", "success");
      await refreshApiKeys();
      await loadEngines();
    } catch (error) {
      console.error("[Settings] 删除 API Key 失败:", error);
      showToast("删除失败，请重试", "error");
    }
  };

  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold mb-3 text-foreground">翻译服务</h3>

      <div
        id="section-api-keys"
        ref={registerRef("section-api-keys")}
        className="py-2.5"
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
              reorderApiKeys(apiKeysRef.current.map((k) => k.service_name)).catch(() =>
                showToast("保存排序失败", "error")
              );
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

      <AddKeyModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onConfirm={handleAddApiKey}
      />
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