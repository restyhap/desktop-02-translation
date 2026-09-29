/**
 * 设置页 — v2 重设计：舞台内整页双栏（左 w-44 锚点 rail 卡片 + 右内容大卡）
 *
 * 数据/交互全保留（对齐 src SettingsPanel）：
 * 六个 section（通用/翻译/词典目录/翻译服务/外观/快捷键），
 * dnd-kit 服务排序、AddKeyModal、快捷键录制、主题三态、检查更新、词典目录。
 * 单项改动即调 saveAllSettings（对齐 save_all_settings_cmd）。
 * 仅重排视觉：大卡分节、Row 精修；不再是整窗 overlay。
 */
import { useEffect, useRef, useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { AppSettings } from "@/lib/types";
import { UI_LOCALES, useAppLocale } from "@/lib/i18n";
import {
  saveAllSettings,
  getDictPaths,
  saveDictPaths,
  listApiKeys,
  addApiKey,
  deleteApiKey,
  reorderApiKeys,
  checkUpdate,
  type ApiKeyItem,
} from "@/mock/store";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Misc";
import { ShortcutRecorder } from "@/components/ShortcutRecorder";
import { XIcon } from "@/components/icons";

const SECTIONS = [
  { id: "general", tKey: "settings.sectionGeneral" },
  { id: "translation", tKey: "settings.sectionTranslation" },
  { id: "dict", tKey: "settings.sectionDict" },
  { id: "apis", tKey: "settings.sectionApis" },
  { id: "appearance", tKey: "settings.sectionAppearance" },
  { id: "shortcuts", tKey: "settings.sectionShortcuts" },
] as const;

/* ---------- 基础布局件（v2 精修） ---------- */

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-xs leading-5 text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <section id={`sec-${id}`} data-sec={id} className="scroll-mt-10">
      <h3 className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-semibold text-ink-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {label}
      </h3>
      <div className="rounded-xl border border-line bg-bg-elevated px-5 py-1.5 shadow-[var(--shadow-card)]">
        {children}
      </div>
    </section>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-line-strong"
      }`}
    >
      <span
        className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  );
}

/* ==================== 页面本体 ==================== */

interface SettingsPanelProps {
  settings: AppSettings;
  onClose: () => void;
  /** 单项改动回传 App（App 负责 saveAllSettings 与主题即时生效） */
  onChange: (settings: AppSettings) => void;
}

export function SettingsPanel({ settings, onClose, onChange }: SettingsPanelProps) {
  const { t, choice, setChoice } = useAppLocale();
  const { showToast } = useToast();
  const [active, setActive] = useState<string>("general");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>(() => listApiKeys());
  // 词典目录
  const [paths, setPaths] = useState<string[]>(() => getDictPaths());

  const patch = (fn: (draft: AppSettings) => void) => {
    const draft = JSON.parse(JSON.stringify(settings)) as AppSettings;
    fn(draft);
    saveAllSettings(draft); // 与 save_all_settings_cmd 对齐：先落库
    onChange(draft);
  };

  // 滚动反高亮最近 section（对齐 src 的 scroll 监听 + 距离计算）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      let best: (typeof SECTIONS)[number]["id"] = SECTIONS[0].id;
      let bestDist = Infinity;
      for (const s of SECTIONS) {
        const sec = el.querySelector(`[data-sec="${s.id}"]`);
        if (!sec) continue;
        const d = Math.abs((sec as HTMLElement).getBoundingClientRect().top - el.getBoundingClientRect().top);
        if (d < bestDist) { bestDist = d; best = s.id; }
      }
      setActive(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 滚动发生在右侧内容列内部
  const jump = (id: string) => {
    setActive(id);
    const el = scrollRef.current;
    const sec = el?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (el && sec) {
      // 直接定位（相对可视关系，不依赖 scrollIntoView/smooth 合成器）
      const top = sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      el.scrollTo({ top });
    }
  };

  /* ---------- 翻译服务（dnd-kit 排序 + 增删） ---------- */
  const moveKey = (from: number, to: number) => {
    const list = [...apiKeys];
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    setApiKeys(list);
    reorderApiKeys(list.map((k) => k.service)); // 落库：reorder_api_keys_cmd
  };

  return (
    <div className="relative flex h-full w-full gap-6 px-8 py-6">
      {/* 左：锚点 rail（窗体整层高，无 sticky） */}
      <aside className="flex h-full w-44 shrink-0 flex-col rounded-xl border border-line bg-bg-elevated p-2.5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
          <p className="font-display text-base font-semibold text-ink">{t("settings.title")}</p>
          <button
            onClick={onClose}
            title={t("settings.closeTip")}
            className="grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <XIcon size={13} />
          </button>
        </div>
        <nav className="mt-1 flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              aria-current={active === s.id ? "true" : undefined}
              className={`h-8 rounded-md px-2.5 text-left text-[13px] transition-colors ${
                active === s.id
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-2 hover:bg-hover hover:text-ink"
              }`}
            >
              {t(s.tKey)}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-2 pb-1">
          <button
            onClick={onClose}
            className="h-8 w-full rounded-md px-2.5 text-left text-xs text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            {t("settings.backHome")}
          </button>
        </div>
      </aside>

      {/* 右：内容大卡（独立滚动，整层高） */}
      <div ref={scrollRef} className="h-full min-w-0 flex-1 overflow-y-auto pb-10 pr-1">
          {/* ===== 通用 ===== */}
          <Section id="general" label={t("settings.sectionGeneral")}>
            <Row title={t("settings.launchStartup")} hint={t("settings.launchStartupHint")}>
              <Switch checked={settings.general.launchAtStartup} onChange={(v) => patch((d) => void (d.general.launchAtStartup = v))} />
            </Row>
            <Row title={t("settings.closeWindow")} hint={t("settings.closeWindowHint")}>
              <Select value={settings.general.closeBehavior} onChange={(e) => patch((d) => void (d.general.closeBehavior = e.target.value as AppSettings["general"]["closeBehavior"]))} className="h-8 text-xs">
                <option value="minimizeToTray">{t("settings.minimizeToTray")}</option>
                <option value="exit">{t("settings.exitApp")}</option>
              </Select>
            </Row>
            <Row title={t("settings.checkUpdates")} hint={t("settings.checkUpdatesHint")}>
              <div className="flex items-center gap-2">
                <Switch checked={settings.general.checkUpdates} onChange={(v) => patch((d) => void (d.general.checkUpdates = v))} />
                <UpdateButton />
              </div>
            </Row>
          </Section>

          {/* ===== 翻译 ===== */}
          <div className="mt-6">
            <Section id="translation" label={t("settings.sectionTranslation")}>
              <Row title={t("settings.autoDetect")} hint={t("settings.autoDetectHint")}>
                <Switch checked={settings.translation.autoDetect} onChange={(v) => patch((d) => void (d.translation.autoDetect = v))} />
              </Row>
              <Row title={t("settings.defaultSource")}>
                <Select value={settings.translation.defaultSourceLang} onChange={(e) => patch((d) => void (d.translation.defaultSourceLang = e.target.value as AppSettings["translation"]["defaultSourceLang"]))} className="h-8 text-xs">
                  <option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option>
                </Select>
              </Row>
              <Row title={t("settings.defaultTarget")}>
                <Select value={settings.translation.defaultTargetLang} onChange={(e) => patch((d) => void (d.translation.defaultTargetLang = e.target.value as AppSettings["translation"]["defaultTargetLang"]))} className="h-8 text-xs">
                  <option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option>
                </Select>
              </Row>
            </Section>
          </div>

          {/* ===== 词典目录 ===== */}
          <div className="mt-6">
            <Section id="dict" label={t("settings.sectionDict")}>
              <DictionarySection paths={paths} setPaths={setPaths} onSave={(p) => { saveDictPaths(p); showToast(t("toast.dictDirSaved"), "success"); }} />
            </Section>
          </div>

          {/* ===== 翻译服务 ===== */}
          <div className="mt-6">
            <Section id="apis" label={t("settings.sectionApis")}>
              <ApiSection
                apiKeys={apiKeys}
                setApiKeys={setApiKeys}
                moveKey={moveKey}
                showToast={showToast}
              />
            </Section>
          </div>

          {/* ===== 外观 ===== */}
          <div className="mt-6">
            <Section id="appearance" label={t("settings.sectionAppearance")}>
              <Row title={t("settings.theme")} hint={t("settings.themeHint")}>
                <Select value={settings.appearance.theme} onChange={(e) => patch((d) => void (d.appearance.theme = e.target.value as AppSettings["appearance"]["theme"]))} className="h-8 text-xs">
                  <option value="light">{t("theme.light")}</option>
                  <option value="dark">{t("theme.dark")}</option>
                  <option value="system">{t("common.followSystem")}</option>
                </Select>
              </Row>
              {/* 界面语言：跟随系统 + 9 语（本地名展示），选择落 localStorage 并即时生效 */}
              <Row title={t("settings.uiLang")} hint={t("settings.uiLangHint")}>
                <Select
                  value={choice}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "system") { setChoice("system"); return; }
                    const hit = UI_LOCALES.find((l) => l.code === v);
                    if (hit) setChoice(hit.code);
                  }}
                  aria-label={t("settings.uiLang")}
                  className="h-8 text-xs"
                >
                  <option value="system">{t("common.followSystem")}</option>
                  {UI_LOCALES.map((l) => (
                    <option key={l.code} value={l.code}>{l.nativeName}</option>
                  ))}
                </Select>
              </Row>
              <Row title={t("settings.fontSize")}>
                <Select value={settings.appearance.fontSize} onChange={(e) => patch((d) => void (d.appearance.fontSize = e.target.value as AppSettings["appearance"]["fontSize"]))} className="h-8 text-xs">
                  <option value="small">{t("settings.fontSizeSmall")}</option>
                  <option value="medium">{t("settings.fontSizeMedium")}</option>
                  <option value="large">{t("settings.fontSizeLarge")}</option>
                </Select>
              </Row>
              <Row title={t("settings.opacity")}>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={50} max={100} step={5}
                    value={settings.appearance.opacity}
                    onChange={(e) => patch((d) => void (d.appearance.opacity = Number(e.target.value)))}
                    className="w-32"
                    aria-label={t("settings.opacity")}
                  />
                  <span className="w-9 text-right text-[11px] text-ink-3">{settings.appearance.opacity}%</span>
                </div>
              </Row>
              <Row title={t("settings.hideDelay")} hint={t("settings.hideDelayHint")}>
                <Select value={String(settings.appearance.hideDelay)} onChange={(e) => patch((d) => void (d.appearance.hideDelay = Number(e.target.value)))} className="h-8 text-xs">
                  <option value="0">{t("settings.noAutoHide")}</option>
                  <option value="3">{t("settings.seconds", { n: 3 })}</option>
                  <option value="5">{t("settings.seconds", { n: 5 })}</option>
                  <option value="10">{t("settings.seconds", { n: 10 })}</option>
                </Select>
              </Row>
            </Section>
          </div>

          {/* ===== 快捷键 ===== */}
          <div className="mt-6">
            <Section id="shortcuts" label={t("settings.sectionShortcuts")}>
              <Row title={t("settings.shortcutTranslate")} hint={t("settings.shortcutTranslateHint")}>
                <ShortcutRecorder value={settings.shortcuts.translate} onChange={(v) => patch((d) => void (d.shortcuts.translate = v))} />
              </Row>
              <Row title={t("settings.shortcutMain")} hint={t("settings.shortcutMainHint")}>
                <ShortcutRecorder value={settings.shortcuts.show_main} onChange={(v) => patch((d) => void (d.shortcuts.show_main = v))} />
              </Row>
            </Section>
          </div>
      </div>
    </div>
  );
}

/* ==================== 子组件 ==================== */

/** 检查更新按钮（mock：check_update；结果 Toast + 状态文本双反馈） */
function UpdateButton() {
  const { t } = useAppLocale();
  const { showToast } = useToast();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const msg = await checkUpdate();
    setBusy(false);
    setStatus(msg);
    showToast(msg ? msg : t("settings.upToDate"), "success");
  };
  return (
    <button
      onClick={run}
      disabled={busy}
      className="h-8 rounded-md border border-line px-2.5 text-xs text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
      title={t("settings.updateBtn")}
    >
      {busy ? t("settings.updating") : status === "" ? t("settings.upToDate") : status ?? t("settings.updateBtn")}
    </button>
  );
}

/** 词典目录分节 */
function DictionarySection({
  paths,
  setPaths,
  onSave,
}: {
  paths: string[];
  setPaths: React.Dispatch<React.SetStateAction<string[]>>;
  onSave: (paths: string[]) => void;
}) {
  const { t } = useAppLocale();
  return (
    <div>
      <div className="flex items-center py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">{t("settings.dictDirTitle")}</p>
          <p className="mt-0.5 text-xs text-ink-3">{t("settings.dictDirHint")}</p>
        </div>
        <button
          onClick={() => setPaths([...paths, `/Users/resty/Dictionaries${paths.length + 1}`])}
          className="h-8 rounded-md border border-line px-2.5 text-xs text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          {t("settings.addDirBtn")}
        </button>
      </div>
      {paths.map((p, i) => (
        <div key={p} className="flex items-center gap-2 py-3 text-xs [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
          <span className="min-w-0 flex-1 truncate font-mono text-ink-2">{p}</span>
          <button
            onClick={() => {
              const next = paths.filter((_, j) => j !== i);
              setPaths(next);
              onSave(next);
            }}
            className="text-ink-3 transition-colors hover:text-red"
          >
            {t("common.delete")}
          </button>
        </div>
      ))}
    </div>
  );
}

/** 翻译服务分节：dnd-kit 拖拽排序 + 添加弹窗 + 删除 */
function ApiSection({
  apiKeys,
  setApiKeys,
  moveKey,
  showToast,
}: {
  apiKeys: ApiKeyItem[];
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeyItem[]>>;
  moveKey: (from: number, to: number) => void;
  showToast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const { t } = useAppLocale();
  return (
    <div>
      <div className="flex items-center py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">{t("settings.apisTitle")}</p>
          <p className="mt-0.5 text-xs text-ink-3">{t("settings.apisHint")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="h-8 rounded-md bg-accent px-3 text-xs text-accent-fg transition-colors hover:bg-accent-hover"
        >
          {t("common.add")}
        </button>
      </div>

      <DndContext onDragEnd={({ active: a, over }: DragEndEvent) => {
        if (!over || a.id === over.id) return;
        const from = apiKeys.findIndex((k) => k.service === a.id);
        const to = apiKeys.findIndex((k) => k.service === over.id);
        if (from >= 0 && to >= 0 && from !== to) moveKey(from, to);
      }}>
        <SortableContext items={apiKeys.map((k) => k.service)} strategy={verticalListSortingStrategy}>
          {apiKeys.map((k) => (
            <SortableKeyRow key={k.service} item={k} onDelete={() => {
              if (!window.confirm(t("settings.deleteServiceConfirm", { name: k.display_name }))) return;
              deleteApiKey(k.service);
              setApiKeys(listApiKeys());
              showToast(t("toast.serviceDeleted"), "success");
            }} />
          ))}
        </SortableContext>
      </DndContext>

      {showAdd && (
        <AddKeyModal
          onClose={() => setShowAdd(false)}
          onAdd={(input) => {
            addApiKey(input);
            setApiKeys(listApiKeys());
            setShowAdd(false);
            showToast(t("toast.serviceAdded", { name: input.display_name }), "success");
          }}
        />
      )}
    </div>
  );
}

/** 排序行（dnd-kit useSortable） */
function SortableKeyRow({ item, onDelete }: { item: ApiKeyItem; onDelete: () => void }) {
  const { t } = useAppLocale();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.service });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={`flex items-center gap-2.5 py-3 text-xs [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line ${
        isDragging ? "relative z-10 cursor-grabbing rounded-md bg-bg-elevated" : "cursor-grab"
      }`}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-bg-inset text-[11px] text-ink-3">⠿</span>
      <span className="font-medium text-ink">{item.display_name}</span>
      <span className="font-mono text-ink-3">{item.service}</span>
      <span className="text-ink-3">{t("settings.keyTail", { tail: item.key_tail })}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title={t("settings.deleteServiceTitle", { name: item.display_name })}
        className="ml-auto text-ink-3 transition-colors hover:text-red"
      >
        {t("common.delete")}
      </button>
    </div>
  );
}

/** 添加服务弹窗（对齐 src AddKeyModal） */
function AddKeyModal({
  onAdd,
  onClose,
}: {
  onAdd: (input: { service: string; display_name: string; app_id?: string; key: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [url, setUrl] = useState("");
  void url;
  const { t } = useAppLocale();
  const valid = name.trim() && key.trim();

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/30" onClick={onClose}>
      <div
        className="rise-in w-96 rounded-xl border border-line bg-bg-elevated p-5 shadow-[var(--shadow-popup)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="font-display text-base font-semibold text-ink">{t("settings.addServiceTitle")}</h4>
        <label className="mt-3 block text-xs text-ink-2">{t("settings.serviceName")}</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("settings.serviceNamePh")}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <label className="mt-2.5 block text-xs text-ink-2">{t("settings.apiKey")}</label>
        <input
          value={key}
          type="password"
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-···"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <label className="mt-2.5 block text-xs text-ink-2">{t("settings.apiUrl")}</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 rounded-md border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-hover">
            {t("common.cancel")}
          </button>
          <button
            disabled={!valid}
            onClick={() =>
              onAdd({
                service: name.trim().toLowerCase().replace(/\s+/g, "_"),
                display_name: name.trim(),
                app_id: undefined,
                key,
              })
            }
            className="h-8 rounded-md bg-accent px-4 text-xs text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {t("common.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
