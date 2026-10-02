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

Both are re-recordable in Settings. Global key listening runs in a separate `keyboard-hook` process (rdev); the main process guards it with a PING/PONG heartbeat watchdog and respawns it if it goes unresponsive.

> ⚠️ On first use, grant the app permission under **System Settings → Privacy & Security → Accessibility**, otherwise global hotkeys and selection capture will not respond. The permission is tied to the app's code signature, so it may need re-granting after reinstalling a new version.

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
pnpm tauri dev          # dev mode (builds the keyboard-hook / dictbuild sidecars too)
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
  app/keyboard_hook.rs  hook watchdog and event dispatch
  bin/keyboard_hook.rs  rdev global key listener sidecar (PING/PONG heartbeat)
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
- **Global hotkeys**: rdev (sidecar process with heartbeat watchdog)
- **Storage**: SQLite via the `sqlite` crate (dictionaries, settings, history, vocabulary, API keys)
- **Speech**: Web Speech API (`speechSynthesis`)
- **Tauri plugins**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## License

MIT License, plus an additional non-commercial restriction (see [LICENSE](./LICENSE)): personal study and non-commercial use are free, but any commercial use — in whole or in part — requires the prior written permission of the copyright holder (restyhap). Copyright © 2026 restyhap.

## Links

- Design documents: [docs/](./docs/)
- Update signing: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issues: https://github.com/restyhap/desktop-02-translation/issues