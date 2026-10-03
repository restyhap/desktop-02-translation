[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Eine macOS-Desktop-Übersetzungs-App, die übersetzt, sobald Sie Text auswählen — Hotkey drücken, Übersetzungsfenster erhalten und Wörter in einem lokalen Wörterbuch auf GoldenDict-Niveau nachschlagen.

Erstellt mit Tauri 2 (Rust) + React 19. Neun Oberflächensprachen, alle Daten bleiben auf Ihrem Rechner.

## Download

| Plattform | Architektur | Datei |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

Öffnen Sie die dmg und ziehen Sie die App heraus; das Ersetzen einer älteren Version funktioniert problemlos. **Alle Benutzerdaten liegen außerhalb des App-Bundles** (`~/Library/Application Support/com.desktop-translation/`), sodass ein Upgrade niemals Ihre Historie, Ihren Wortschatz oder Ihre Einstellungen verändert.

> Die Dateinamen enthalten die Versionsnummer — prüfen Sie die tatsächlichen Dateinamen auf der Releases-Seite.

### Hinweis zum Intel-Build

Der Intel-Build (x86_64) **enthält keine MOSS-TTS neuronale Sprachsynthese**; die Aussprache fällt auf die Systemfunktion `speechSynthesis` von macOS zurück. Grund: Die Abhängigkeit `ort-sys` besitzt keine vorkompilierte Bibliothek für x86_64-macos. Wörterbuchsuche, Übersetzung, Auswahl-Popups und Historie verhalten sich identisch.

## Funktionen

- **Auswahl-Übersetzung** — beliebigen Text markieren, Hotkey drücken, Übersetzungsfenster erhalten; das Hauptfenster ist nur einen Hotkey entfernt
- **Lokales Wörterbuch** — exakte Wortsuche mit Lautschrift, nach Wortart gruppierten Definitionen, Beispielsätzen und Aussprachematerialien; bauen Sie eigene `.dsl.dz`-Wörterbücher mit `dictbuild`
- **Mehrere Engines** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba und Volcengine sind vorkonfiguriert; in den Einstellungen lassen sich eigene Engines und ein eigener LLM-Endpunkt hinzufügen
- **Historie und Wortschatz** — jede Übersetzung wird gespeichert, Favoriten bleiben dauerhaft erhalten, und Einträge können in Wortschatzgruppen einsortiert werden
- **Neun Oberflächensprachen** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **In der Menüleiste** — beim Schließen des Fensters wird die App in die Menüleiste ausgeblendet; deren Menü zeigt das Fenster oder beendet die App
- **Start bei der Anmeldung** — optionaler stiller Hintergrundstart per LaunchAgent mit Heartbeat-Watchdog zur Selbstheilung
- **Aussprache** — Sprachsynthese des Systems mit Einstellungen für Stimme, Rate, Tonhöhe und Lautstärke
- **Aufbewahrung der Historie** — konfigurierbares Aufbewahrungsfenster; abgelaufene, nicht favorisierte Einträge werden beim Start und bei jeder Änderung der Einstellung gelöscht

## Standard-Hotkeys

| Hotkey | Aktion |
|---|---|
| `⌘ + C + C` | Aktuelle Auswahl übersetzen (Popup) |
| `⌘ + C + V` | Hauptfenster anzeigen |

Beide lassen sich in den Einstellungen neu aufzeichnen. Die globale Tastaturüberwachung (rdev) läuft in Hintergrundthreads innerhalb des Hauptprozesses — kein Hilfsprozess mehr. Änderungen an Kurzbefehlen werden per Hot-Swap übernommen, ohne den Listener neu zu starten.

> ⚠️ Gewähren Sie der App bei der ersten Verwendung unter **Systemeinstellungen → Datenschutz & Sicherheit → Eingabeüberwachung** die entsprechende Berechtigung, sonst reagieren globale Hotkeys und die Erfassung von Auswahlen nicht. Solange die Berechtigung fehlt, zeigt die App einen Warnhinweis mit Ein-Klick-Sprung zu diesem Bereich. Die Berechtigung ist an den Code-Hash der App gebunden und muss nach einer neuen Version erneut erteilt werden.

## Aus dem Quellcode bauen

### Voraussetzungen

- macOS 11+ (Apple Silicon oder Intel)
- Node.js 20+ und [pnpm](https://pnpm.io/)
- Rust-Toolchain (über `rustup`) und Xcode Command Line Tools

### Schritte

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (also builds the dictbuild sidecar)
```

### Qualitätssicherungen

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Alles, was den Intel-Build betrifft, muss auf beiden Targets geprüft werden:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### Installer bauen

```bash
pnpm tauri build
# output: src-tauri/target/release/bundle/dmg/
```

Zur Signatur von Updates siehe [SIGNING_GUIDE.md](./SIGNING_GUIDE.md).

### Wörterbücher bauen

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

Die mitgelieferten Wörterbuchdaten umfassen rund 260 MB und liegen in `~/Library/Application Support/com.desktop-translation/`; die Wörterbuchpfade sind in den Einstellungen konfigurierbar.

## Projektstruktur

```
src/                    React 19 frontend (Tailwind 4)
  pages/                translate / history / vocabulary / dictionary / settings
  storage/              invoke wrappers (the only frontend→backend entry point)
  types/settings.ts     DEFAULT_SETTINGS (must stay in sync with Rust defaults)
  lib/i18n.ts           nine-language strings

src-tauri/src/
  lib.rs                Tauri Builder wiring (plugin registration)
  app/keyboard_hook.rs  global hotkeys: rdev event tap on in-process threads
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              dual-architecture build + dual-host release sync script
```

Schichtung: Das Frontend kommuniziert ausschließlich über `invoke` mit Rust; auf der Rust-Seite bleibt `commands/` dünn, die Geschäftslogik liegt in `*_store.rs`; das SQLite-Schema wird genau einmal in `db::apply_schema()` definiert und von Produktionsinitialisierung und Tests gemeinsam genutzt.

## Technologie-Stack

- **App-Framework**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Globale Hotkeys**: rdev (Sidecar-Prozess mit Heartbeat-Watchdog)
- **Speicher**: SQLite über das `sqlite`-Crate (Wörterbücher, Einstellungen, Historie, Wortschatz, API-Schlüssel)
- **Sprache**: Web Speech API (`speechSynthesis`)
- **Tauri-Plugins**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Lizenz

Dieses Projekt steht unter der MIT-Lizenz mit einer zusätzlichen nichtkommerziellen Einschränkung: Jede kommerzielle Nutzung erfordert die vorherige schriftliche Genehmigung des Copyright-Inhabers restyhap.

## Links

- Design-Dokumente: [docs/](./docs/)
- Signatur von Updates: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issues: https://github.com/restyhap/desktop-02-translation/issues