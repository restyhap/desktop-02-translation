[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

A macOS desktop translation app that translates the moment you select text — press a hotkey, get a translation popup, and look words up in a local GoldenDict-grade dictionary.

Built with Tauri 2 (Rust) + React 19. Nine UI languages, all data stays on your machine.

## Download

| Platform | Architecture | Asset |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

Open the dmg and drag the app out; replacing an older version works fine. **All user data lives outside the app bundle** (`~/Library/Application Support/com.desktop-translation/`), so upgrading never touches your history, vocabulary, or settings.

> Asset names carry the version number — check the actual file names on the Releases page.

### Note for the Intel build

The Intel (x86_64) build **does not include MOSS-TTS neural speech synthesis**; pronunciation falls back to the macOS system `speechSynthesis`. Reason: its `ort-sys` dependency has no prebuilt x86_64-macos library. Dictionary lookup, translation, selection popups, and history behave identically.

## Features

- **Selection translation** — select any text, hit the hotkey, get a translation popup; the main window is one hotkey away
- **Local dictionary** — exact-match word lookup with phonetics, part-of-speech-grouped definitions, example sentences, and pronunciation resources; build your own `.dsl.dz` dictionaries with `dictbuild`
- **Multiple engines** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba, and Volcengine preconfigured; add custom engines and a custom LLM endpoint in settings
- **History and vocabulary** — every translation is stored, favorites are kept forever, and entries can be sent into vocabulary groups
- **Nine UI languages** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Menu bar resident** — closing the window hides it to the tray; the tray menu shows the window or quits
- **Launch at login** — optional silent background start via LaunchAgent, with a heartbeat watchdog for self-healing
- **Pronunciation** — system speech synthesis with voice, rate, pitch, and volume settings
- **History retention** — configurable retention window; expired non-favorite records are purged on startup and whenever you change the setting

## Default Hotkeys

| Hotkey | Action |
|---|---|
| `⌘ + C + C` | Translate the current selection (popup) |
| `⌘ + C + V` | Show the main window |

Both are re-recordable in Settings. Global key listening uses a macOS event tap attached to the main thread's run loop — no sidecar process and no third-party hook library. Shortcut changes hot-swap the rule table without rebuilding the tap.

> ⚠️ On first use, grant the app permission under **System Settings → Privacy & Security → Input Monitoring**, otherwise global hotkeys and selection capture will not respond. While the permission is missing, the **home page** shows a warning banner with two actions: “Open Input Monitoring Settings” and “Go to Settings”. The permission is bound to the app's code hash, so it must be re-granted after installing a new build. macOS will not show its own prompt when an entry already exists — **turn the switch off and back on** to refresh it.

## Build from Source

### Requirements

- macOS 11+ (Apple Silicon or Intel)
- Node.js 20+ and [pnpm](https://pnpm.io/)
- Rust toolchain (via `rustup`) and Xcode Command Line Tools

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
# output: src-tauri/target/release/bundle/dmg/
```

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
  app/keyboard_hook.rs  global hotkeys: self-built ListenOnly event tap on the main run loop
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              dual-architecture build + dual-host release sync script
```

Layering: the frontend only talks to Rust through `invoke`; on the Rust side `commands/` stays thin and business logic lives in `*_store.rs`; the SQLite schema is defined once in `db::apply_schema()` and shared by production init and tests.

## Stack

- **App framework**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Global hotkeys**: self-built macOS event tap (ListenOnly), attached to the main thread run loop
- **Storage**: SQLite via the `sqlite` crate (dictionaries, settings, history, vocabulary, API keys)
- **Speech**: Web Speech API (`speechSynthesis`)
- **Tauri plugins**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## License

MIT License, plus an additional non-commercial restriction (see [LICENSE](./LICENSE)): personal study and non-commercial use are free, but any commercial use — in whole or in part — requires the prior written permission of the copyright holder (restyhap). Copyright © 2026 restyhap.

## Links

- Design documents: [docs/](./docs/)
- Update signing: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issues: https://github.com/restyhap/desktop-02-translation/issues