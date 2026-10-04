[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Eine Desktop-Übersetzungs-App für **macOS und Windows**, die übersetzt, sobald Sie Text auswählen — Hotkey drücken, Übersetzungsfenster erhalten und Wörter in einem lokalen Wörterbuch auf GoldenDict-Niveau nachschlagen. macOS ist das Hauptziel; für Linux gibt es Builds, die die Auswahl-Übersetzung noch nicht unterstützen.

Erstellt mit Tauri 2 (Rust) + React 19. Neun Oberflächensprachen, alle Daten bleiben auf Ihrem Rechner.

## Download

| Plattform | Architektur | Datei |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |
| Windows 10 / 11 | x86_64 | `DesktopTranslation_{version}_x64-setup.exe` (NSIS-Installationsprogramm) |
| Linux | x86_64 | `DesktopTranslation_{version}_amd64.AppImage` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

**macOS** — öffnen Sie die dmg und ziehen Sie die App heraus. **Windows** — führen Sie das `.exe`-Installationsprogramm aus; wenn SmartScreen vor einem unbekannten Herausgeber warnt, wählen Sie *Weitere Informationen → Trotzdem ausführen* (siehe Hinweis unten). **Linux** — machen Sie das AppImage mit `chmod +x` ausführbar und starten Sie es; es benötigt eine FUSE-Laufzeit, oder Sie starten es mit `APPIMAGE_EXTRACT_AND_RUN=1`.

Das Ersetzen einer älteren Version funktioniert problemlos. **Alle Benutzerdaten liegen außerhalb des App-Bundles** (`~/Library/Application Support/com.desktop-translation/` unter macOS, `%APPDATA%\com.desktop-translation\` unter Windows, `~/.local/share/com.desktop-translation/` unter Linux), sodass ein Upgrade niemals Ihre Historie, Ihren Wortschatz oder Ihre Einstellungen verändert.

> Die Dateinamen enthalten die Versionsnummer — prüfen Sie die tatsächlichen Dateinamen auf der Releases-Seite.

### Plattformunterstützung

| | macOS | Windows | Linux |
|---|---|---|---|
| Auswahl-Übersetzung (globale Hotkeys) | ✅ | ✅ | ❌ noch nicht |
| Lokale Wörterbuchsuche | ✅ | ✅ | ✅ |
| Engines, Historie, Wortschatz | ✅ | ✅ | ✅ |
| Neuronale Sprachausgabe (MOSS-TTS) | ✅ nur Apple Silicon | ❌ Systemstimme | ❌ Systemstimme |
| Updates in der App | ✅ | ✅ | ✅ |
| System-Codesignierung | ad-hoc | keine — SmartScreen-Hinweis | keine |

Globale Hotkeys funktionieren unter Windows **ohne jede Berechtigungsabfrage** (dafür kommt ein Low-Level-Tastaturhaken zum Einsatz, der jeden Tastendruck auch an andere Apps durchreicht). Die Auswahl-Übersetzung unter Linux ist nicht implementiert: Wayland verbietet Anwendungen, globale Tasteneingaben abzufangen. Die App weist auf der Startseite darauf hin, statt still zu nichts zu tun — alles andere, einschließlich der manuellen Übersetzung, funktioniert normal.

> ⚠️ **Windows SmartScreen** — das Installationsprogramm ist nicht mit Authenticode signiert, daher meldet Windows möglicherweise „Windows hat Ihren PC geschützt“. Wählen Sie *Weitere Informationen → Trotzdem ausführen*. Das ist etwas anderes als die minisign-Signatur des Updaters, die nur Update-Pakete abdeckt.

### Hinweis zur Sprachsynthese

Der **Intel-Build (x86_64)** und **alle Builds außer für macOS** **enthalten keine MOSS-TTS neuronale Sprachsynthese**; die Aussprache fällt auf die Systemfunktion `speechSynthesis` zurück. Grund: Die Abhängigkeit `ort-sys` besitzt keine vorkompilierte Bibliothek für x86_64-macos, Windows oder Linux. Wörterbuchsuche, Übersetzung, Auswahl-Popups und Historie verhalten sich identisch.

## Funktionen

- **Auswahl-Übersetzung** — beliebigen Text markieren, Hotkey drücken, Übersetzungsfenster erhalten; das Hauptfenster ist nur einen Hotkey entfernt
- **Lokales Wörterbuch** — exakte Wortsuche mit Lautschrift, nach Wortart gruppierten Definitionen, Beispielsätzen und Aussprachematerialien; bauen Sie eigene `.dsl.dz`-Wörterbücher mit `dictbuild`
- **Mehrere Engines** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba und Volcengine sind vorkonfiguriert; in den Einstellungen lassen sich eigene Engines und ein eigener LLM-Endpunkt hinzufügen
- **Historie und Wortschatz** — jede Übersetzung wird gespeichert, Favoriten bleiben dauerhaft erhalten, und Einträge können in Wortschatzgruppen einsortiert werden
- **Neun Oberflächensprachen** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **In der Menüleiste** — beim Schließen des Fensters wird die App in die Menüleiste ausgeblendet (unter macOS die Menüleiste, auf den anderen Plattformen der Benachrichtigungsbereich); deren Menü zeigt das Fenster oder beendet die App
- **Start bei der Anmeldung** — optionaler stiller Hintergrundstart per LaunchAgent (macOS) bzw. über den jeweils eigenen Autostart-Mechanismus der Plattform, mit Heartbeat-Watchdog zur Selbstheilung
- **Aussprache** — Sprachsynthese des Systems mit Einstellungen für Stimme, Rate, Tonhöhe und Lautstärke
- **Aufbewahrung der Historie** — konfigurierbares Aufbewahrungsfenster; abgelaufene, nicht favorisierte Einträge werden beim Start und bei jeder Änderung der Einstellung gelöscht

## Standard-Hotkeys

| Plattform | Hotkey | Aktion |
|---|---|---|
| macOS | `⌘ + C + C` | Aktuelle Auswahl übersetzen (Popup) |
| macOS | `⌘ + C + V` | Hauptfenster anzeigen |
| Windows | `Ctrl + C + C` | Aktuelle Auswahl übersetzen (Popup) |
| Windows | `Ctrl + C + V` | Hauptfenster anzeigen |

Beide lassen sich in den Einstellungen neu aufzeichnen. Die globale Tastaturüberwachung ist ein selbst gebauter Haken — kein Hilfsprozess und keine Drittanbieter-Bibliothek: für macOS ein ListenOnly-Event-Tap im Run-Loop des Hauptthreads, für Windows ein durchlässiger Low-Level-Tastaturhaken (`WH_KEYBOARD_LL`) auf einem privaten Thread. Änderungen an Kurzbefehlen werden per Hot-Swap übernommen, ohne den Haken neu aufzubauen.

> ⚠️ **macOS** — gewähren Sie der App bei der ersten Verwendung unter **Systemeinstellungen → Datenschutz & Sicherheit → Eingabeüberwachung** die entsprechende Berechtigung, sonst reagieren globale Hotkeys und die Erfassung von Auswahlen nicht. Solange die Berechtigung fehlt, zeigt die **Startseite** einen Warnhinweis mit zwei Aktionen: „Eingabeüberwachung öffnen“ und „Zu den Einstellungen“. Die Berechtigung ist an den Code-Hash der App gebunden und muss nach der Installation eines neuen Builds erneut erteilt werden. Ist bereits ein Eintrag vorhanden, zeigt macOS keine eigene Nachfrage — **Schalter aus und wieder einschalten**, um ihn zu erneuern.
>
> **Windows** — nichts zu erteilen; der Haken benötigt keine besondere Berechtigung.
>
> **Linux** — die Auswahl-Übersetzung steht nicht zur Verfügung, und die Startseite weist darauf hin, statt zu schweigen. Alles andere funktioniert.

## Aus dem Quellcode bauen

### Voraussetzungen

- macOS 11+ (Apple Silicon oder Intel) — das Hauptziel
- Windows 10/11 mit MSVC-Buildtools oder Linux mit `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libfuse2`
- Node.js 20+ und [pnpm](https://pnpm.io/)
- Rust-Toolchain (über `rustup`) und Xcode Command Line Tools (nur macOS)

> Eine native Kreuzkompilierung ist hier nicht möglich (Windows benötigt MSVC, Linux WebKitGTK/libdbus). Builds für Windows und Linux laufen auf den nativen Runnern dieser Plattformen — siehe `.github/workflows/ci.yml` und `.github/workflows/release.yml`.

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
# macOS:   src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux:   src-tauri/target/release/bundle/appimage/
```

Releases für alle vier Plattform-Schlüssel erzeugt die CI (`.github/workflows/release.yml`): Mit einem annotierten `v*`-Tag produziert die Build-Matrix dmg + NSIS + AppImage sowie die minisign-signierten Update-Artefakte, und der Publish-Job führt sie zu einer einzigen `latest.json` für vier Plattformen zusammen.

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
  app/hook_core.rs        platform-neutral rule matching + translate action (all platforms)
  app/keyboard_hook.rs        macOS: self-built ListenOnly event tap on the main run loop
  app/keyboard_hook_windows.rs  Windows: pass-through low-level keyboard hook (WH_KEYBOARD_LL)
  app/keyboard_hook_unsupported.rs  other platforms: no-op placeholder with the same API
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh                macOS-only dual-architecture build + dual-host release script
                          (four-platform releases go through CI; the script refuses to
                           overwrite a multi-platform latest.json)
```

Schichtung: Das Frontend kommuniziert ausschließlich über `invoke` mit Rust; auf der Rust-Seite bleibt `commands/` dünn, die Geschäftslogik liegt in `*_store.rs`; das SQLite-Schema wird genau einmal in `db::apply_schema()` definiert und von Produktionsinitialisierung und Tests gemeinsam genutzt.

## Technologie-Stack

- **App-Framework**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Globale Hotkeys**: selbst gebaut, ohne Drittanbieter-Bibliothek — macOS ListenOnly `CGEventTap` im Run-Loop des Hauptthreads; Windows durchlässiger `WH_KEYBOARD_LL`-Low-Level-Tastaturhaken auf einem privaten Thread
- **Speicher**: SQLite über das `sqlite`-Crate (Wörterbücher, Einstellungen, Historie, Wortschatz, API-Schlüssel)
- **Sprache**: Web Speech API (`speechSynthesis`)
- **Tauri-Plugins**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Lizenz

Dieses Projekt steht unter der MIT-Lizenz mit einer zusätzlichen nichtkommerziellen Einschränkung: Jede kommerzielle Nutzung erfordert die vorherige schriftliche Genehmigung des Copyright-Inhabers restyhap.

## Links

- Design-Dokumente: [docs/](./docs/)
- Signatur von Updates: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issues: https://github.com/restyhap/desktop-02-translation/issues