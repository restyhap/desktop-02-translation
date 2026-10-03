export interface ShortcutConfig {
  translate: string;
  show_main: string;
}

/** 全局快捷键监听诊断状态（后端 app/keyboard_hook.rs 的 HookStatusSnapshot） */
export interface HookStatus {
  /** 监听线程是否在运行 */
  listening: boolean;
  /** 是否已获得 macOS「输入监控」授权；false 时快捷键必然无反应 */
  listen_event: boolean;
  /** 已接收的按键事件数 */
  key_events: number;
}
