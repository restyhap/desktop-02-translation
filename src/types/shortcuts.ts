export interface ShortcutConfig {
  translate: string;
  show_main: string;
}

/** 全局快捷键监听诊断状态（后端 app/keyboard_hook.rs 的 HookStatusSnapshot） */
export interface HookStatus {
  /**
   * 本平台是否实现了全局监听。**macOS 与 Windows 为 true**；Linux 为 false。
   *
   * `supported === false` 表示**能力缺失**（Linux：Wayland 安全模型禁止应用捕获
   * 全局按键），不是授权故障：没有可授予的权限，也没有可跳转的系统设置面板，
   * 所以不该弹「输入监控」那一套。但**必须**在主页与设置页给出可见说明 ——
   * 用户照样看得到「⌘+C+C 划词」和可录制的快捷键，不提示就是静默失败。
   */
  supported: boolean;
  /** 监听线程是否在运行 */
  listening: boolean;
  /**
   * 是否已获得 macOS「输入监控」授权；false 时快捷键必然无反应。
   * Windows 无授权门禁，恒为 true。
   */
  listen_event: boolean;
  /** 已接收的按键事件数 */
  key_events: number;
}
