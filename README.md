[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

A desktop translation app for **macOS and Windows** that translates the moment you select text — press a hotkey, get a translation popup, and look words up in a local GoldenDict-grade dictionary. macOS is the primary target; Linux builds are provided but do not yet support selection translate.

Built with Tauri 2 (Rust) + React 19. Nine UI languages, all data stays on your machine.

## Download

| Platform | Architecture | Asset |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |
| Windows 10 / 11 | x86_64 | `DesktopTranslation_{version}_x64-setup.exe` (NSIS installer) |
| Linux | x86_64 | `DesktopTranslation_{version}_amd64.AppImage` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

**macOS** — open the dmg and drag the app out. **Windows** — run the `.exe` installer; if SmartScreen warns about an unknown publisher, choose *More info → Run anyway* (see the note below). **Linux** — `chmod +x` the AppImage and run it; it needs a FUSE runtime, or start it with `APPIMAGE_EXTRACT_AND_RUN=1`.

Replacing an older version works fine. **All user data lives outside the app bundle** (`~/Library/Application Support/com.desktop-translation/` on macOS, `%APPDATA%\com.desktop-translation\` on Windows, `~/.local/share/com.desktop-translation/` on Linux), so upgrading never touches your history, vocabulary, or settings.

> Asset names carry the version number — check the actual file names on the Releases page.

### Platform support

| | macOS | Windows | Linux |
|---|---|---|---|
| Selection translate (global hotkey) | ✅ | ✅ | ❌ not yet |
| Local dictionary lookup | ✅ | ✅ | ✅ |
| Engines, history, vocabulary | ✅ | ✅ | ✅ |
| Neural speech (MOSS-TTS) | ✅ Apple Silicon only | ❌ system voice | ❌ system voice |
| In-app updates | ✅ | ✅ | ✅ |
| System code signing | ad-hoc | none — SmartScreen prompt | none |

Windows global hotkeys work with **no permission prompt** (it uses a low-level keyboard hook that passes every key through to other apps). Selection translate on Linux is not implemented: Wayland forbids applications from capturing global keystrokes. The app says so on the home page instead of silently doing nothing — everything else, including manual translation, works normally.

> ⚠️ **Windows SmartScreen** — the installer is not Authenticode-signed, so Windows may report “Windows protected your PC”. Choose *More info → Run anyway*. This is a different thing from the updater's minisign signature, which only covers update packages.

### Note for speech synthesis

The **Intel (x86_64)** build and **all non-macOS** builds **do not include MOSS-TTS neural speech synthesis**; pronunciation falls back to the system `speechSynthesis`. Reason: its `ort-sys` dependency has no prebuilt library for x86_64-macos, Windows, or Linux. Dictionary lookup, translation, selection popups, and history behave identically.

## Features

- **Selection translation** — select any text, hit the hotkey, get a translation popup; the main window is one hotkey away
- **Local dictionary** — exact-match word lookup with phonetics, part-of-speech-grouped definitions, example sentences, and pronunciation resources; build your own `.dsl.dz` dictionaries with `dictbuild`
- **Multiple engines** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba, and Volcengine preconfigured; add custom engines and a custom LLM endpoint in settings
- **History and vocabulary** — every translation is stored, favorites are kept forever, and entries can be sent into vocabulary groups
- **Nine UI languages** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Menu bar resident** — closing the window hides it to the tray (menu bar on macOS, notification area elsewhere); the tray menu shows the window or quits
- **Launch at login** — optional silent background start via LaunchAgent (macOS) / the platform's own autostart mechanism elsewhere, with a heartbeat watchdog for self-healing
- **Pronunciation** — system speech synthesis with voice, rate, pitch, and volume settings
- **History retention** — configurable retention window; expired non-favorite records are purged on startup and whenever you change the setting

## Default Hotkeys

| Platform | Hotkey | Action |
|---|---|---|
| macOS | `⌘ + C + C` | Translate the current selection (popup) |
| macOS | `⌘ + C + V` | Show the main window |
| Windows | `Ctrl + C + C` | Translate the current selection (popup) |
| Windows | `Ctrl + C + V` | Show the main window |

Both are re-recordable in Settings. Global key listening is a self-built hook — no sidecar process and no third-party hook library: a ListenOnly event tap on the main thread run loop for macOS, a pass-through low-level keyboard hook (`WH_KEYBOARD_LL`) on a private thread for Windows. Shortcut changes hot-swap the rule table without rebuilding the hook.

> ⚠️ **macOS** — on first use, grant the app permission under **System Settings → Privacy & Security → Input Monitoring**, otherwise global hotkeys and selection capture will not respond. While the permission is missing, the **home page** shows a warning banner with two actions: “Open Input Monitoring Settings” and “Go to Settings”. The permission is bound to the app's code hash, so it must be re-granted after installing a new build. macOS will not show its own prompt when an entry already exists — **turn the switch off and back on** to refresh it.
>
> **Windows** — nothing to grant; the hook needs no special permission.
>
> **Linux** — selection translate is unavailable, and the home page says so rather than staying silent. Everything else works.

## Build from Source

### Requirements

- macOS 11+ (Apple Silicon or Intel) — the primary target
- Windows 10/11 with MSVC build tools, or Linux with `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libfuse2`
- Node.js 20+ and [pnpm](https://pnpm.io/)
- Rust toolchain (via `rustup`) and Xcode Command Line Tools (macOS only)

> Native cross-compilation does not work here (Windows needs MSVC, Linux needs WebKitGTK/libdbus). Builds for Windows and Linux run on those platforms' own runners — see `.github/workflows/ci.yml` and `.github/workflows/release.yml`.

### Steps

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (also builds the dictbuild sidecar)
```

### Quality gates

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Anything touching the Intel build must be checked on both targets:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### Build the installer

```bash
pnpm tauri build
# macOS:   src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux:   src-tauri/target/release/bundle/appimage/
```

Releases for all four platform keys are produced by CI (`.github/workflows/release.yml`): push an annotated `v*` tag and the build matrix produces dmg + NSIS + AppImage plus the minisign-signed updater artifacts, then the publish job merges them into a single four-platform `latest.json`.

See [SIGNING_GUIDE.md](./SIGNING_GUIDE.md) for update signing.

### Building dictionaries

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

The bundled dictionary data is roughly 260 MB and lives in `~/Library/Application Support/com.desktop-translation/`; dictionary paths are configurable in Settings.

## Project Layout

```
src/                    React 19 frontend (Tailwind 4)
  pages/                translate / history / vocabulary / dictionary / settings
  storage/              invoke wrappers (the only frontend→backend entry point)
  types/settings.ts     DEFAULT_SETTINGS (must stay in sync with Rust defaults)
  lib/i18n.ts           nine-language strings

src-tauri/src/
  lib.rs                Tauri Builder wiring (plugin registration)
  app/hook_core.rs        platform-neutral rule matching + translate action (all platforms)
  app/keyboard_hook.rs        macOS: self-built ListenOnly event tap on the main run loop
  app/keyboard_hook_windows.rs  Windows: pass-through low-level keyboard hook (WH_KEYBOARD_LL)
  app/keyboard_hook_unsupported.rs  other platforms: no-op placeholder with the same API
  bin/dictbuild.rs        dictionary build tool
  db.rs                   single-source SQLite schema (apply_schema)
  *_store.rs              history / vocabulary / settings data layer
  commands/               IPC commands (thin thunks)

docs/                     requirements, database design, dictionary plan, progress archives
release.sh                macOS-only dual-architecture build + dual-host release script
                          (four-platform releases go through CI; the script refuses to
                           overwrite a multi-platform latest.json)
```

Layering: the frontend only talks to Rust through `invoke`; on the Rust side `commands/` stays thin and business logic lives in `*_store.rs`; the SQLite schema is defined once in `db::apply_schema()` and shared by production init and tests.

## Stack

- **App framework**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Global hotkeys**: self-built, no third-party hook library — macOS ListenOnly `CGEventTap` on the main thread run loop; Windows pass-through `WH_KEYBOARD_LL` low-level keyboard hook on a private thread
- **Storage**: SQLite via the `sqlite` crate (dictionaries, settings, history, vocabulary, API keys)
- **Speech**: Web Speech API (`speechSynthesis`)
- **Tauri plugins**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## License

MIT License, plus an additional non-commercial restriction (see [LICENSE](./LICENSE)): personal study and non-commercial use are free, but any commercial use — in whole or in part — requires the prior written permission of the copyright holder (restyhap). Copyright © 2026 restyhap.

## Links

- Design documents: [docs/](./docs/)
- Update signing: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issues: https://github.com/restyhap/desktop-02-translation/issues