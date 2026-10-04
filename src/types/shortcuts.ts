export interface ShortcutConfig {
  translate: string;
  show_main: string;
}

/** 全局快捷键监听诊断状态（后端 app/keyboard_hook.rs 的 HookStatusSnapshot） */
export interface HookStatus {
  /**
   * 本平台是否实现了全局监听。**目前仅 macOS 为 true**。
   * 为 false 时「输入监控」横幅必须整体隐藏 —— 那是 macOS 特有的 TCC 门禁，
   * 在 Windows/Linux 上弹它既无对应的系统设置面板，也无授权可授予。
   */
  supported: boolean;
  /** 监听线程是否在运行 */
  listening: boolean;
  /** 是否已获得 macOS「输入监控」授权；false 时快捷键必然无反应 */
  listen_event: boolean;
  /** 已接收的按键事件数 */
  key_events: number;
}
