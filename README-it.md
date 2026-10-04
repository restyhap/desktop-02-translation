[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Un'app di traduzione desktop per **macOS e Windows** che traduce nel momento in cui selezioni un testo: premi una scorciatoia, compare un popup con la traduzione e consulta le parole in un dizionario locale di qualità GoldenDict. macOS è la piattaforma principale; le build per Linux sono disponibili ma non supportano ancora la traduzione da selezione.

Realizzata con Tauri 2 (Rust) + React 19. Nove lingue per l'interfaccia, tutti i dati restano sul tuo computer.

## Download

| Piattaforma | Architettura | Asset |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |
| Windows 10 / 11 | x86_64 | `DesktopTranslation_{version}_x64-setup.exe` (installer NSIS) |
| Linux | x86_64 | `DesktopTranslation_{version}_amd64.AppImage` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

**macOS** — apri il dmg e trascina fuori l'app. **Windows** — esegui l'installer `.exe`; se SmartScreen segnala un autore sconosciuto, scegli *Ulteriori informazioni → Esegui comunque* (vedi la nota qui sotto). **Linux** — applica `chmod +x` all'AppImage ed eseguilo; richiede un runtime FUSE, oppure avvialo con `APPIMAGE_EXTRACT_AND_RUN=1`.

Sostituire una versione più vecchia funziona senza problemi. **Tutti i dati utente risiedono fuori dal bundle dell'app** (`~/Library/Application Support/com.desktop-translation/` su macOS, `%APPDATA%\com.desktop-translation\` su Windows, `~/.local/share/com.desktop-translation/` su Linux), quindi aggiornare non tocca mai la cronologia, il vocabolario o le impostazioni.

> I nomi degli asset contengono il numero di versione — controlla i nomi effettivi dei file nella pagina Releases.

### Supporto delle piattaforme

| | macOS | Windows | Linux |
|---|---|---|---|
| Traduzione da selezione (scorciatoia globale) | ✅ | ✅ | ❌ non ancora |
| Consultazione del dizionario locale | ✅ | ✅ | ✅ |
| Motori, cronologia, vocabolario | ✅ | ✅ | ✅ |
| Voce neurale (MOSS-TTS) | ✅ solo Apple Silicon | ❌ voce di sistema | ❌ voce di sistema |
| Aggiornamenti nell'app | ✅ | ✅ | ✅ |
| Firma del codice di sistema | ad-hoc | nessuna: avviso di SmartScreen | nessuna |

Le scorciatoie globali su Windows funzionano **senza richiedere alcuna autorizzazione** (usano un hook di tastiera a basso livello che lascia passare ogni tasto verso le altre app). La traduzione da selezione su Linux non è implementata: Wayland vieta alle applicazioni di catturare i tasti globali. L'app lo dichiara nella pagina principale invece di non fare nulla in silenzio; tutto il resto, compresa la traduzione manuale, funziona normalmente.

> ⚠️ **Windows SmartScreen** — l'installer non è firmato con Authenticode, quindi Windows può mostrare «Windows ha protetto il tuo PC». Scegli *Ulteriori informazioni → Esegui comunque*. È una cosa diversa dalla firma minisign dell'updater, che copre solo i pacchetti di aggiornamento.

### Nota sulla sintesi vocale

Le build **Intel (x86_64)** e **tutte quelle non per macOS** **non includono la sintesi vocale neurale MOSS-TTS**; la pronuncia ricade sul `speechSynthesis` di sistema. Motivo: la sua dipendenza `ort-sys` non dispone di librerie precompilate per x86_64-macos, Windows o Linux. Consultazione del dizionario, traduzione, popup di selezione e cronologia si comportano in modo identico.

## Funzionalità

- **Traduzione da selezione** — seleziona qualsiasi testo, premi la scorciatoia e ottieni un popup con la traduzione; la finestra principale è a una scorciatoia di distanza
- **Dizionario locale** — ricerca esatta delle parole con fonetica, definizioni raggruppate per parte del discorso, frasi d'esempio e risorse di pronuncia; costruisci i tuoi dizionari `.dsl.dz` con `dictbuild`
- **Motori multipli** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba e Volcengine già configurati; aggiungi motori personalizzati e un endpoint LLM personalizzato nelle impostazioni
- **Cronologia e vocabolario** — ogni traduzione viene memorizzata, i preferiti restano per sempre e le voci possono essere inviate in gruppi di vocabolario
- **Nove lingue per l'interfaccia** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Sempre nella barra dei menu** — chiudere la finestra la nasconde nell'area di notifica (barra dei menu su macOS, area di notifica sulle altre piattaforme); il menu dell'area di notifica mostra la finestra o esce
- **Avvio al login** — avvio silenzioso in background opzionale tramite LaunchAgent (macOS) o tramite il meccanismo di autostart della piattaforma sulle altre, con watchdog heartbeat per l'auto-riparazione
- **Pronuncia** — sintesi vocale di sistema con impostazioni di voce, velocità, intonazione e volume
- **Conservazione della cronologia** — finestra di conservazione configurabile; i record scaduti non preferiti vengono eliminati all'avvio e ogni volta che modifichi l'impostazione

## Scorciatoie predefinite

| Piattaforma | Scorciatoia | Azione |
|---|---|---|
| macOS | `⌘ + C + C` | Traduci la selezione corrente (popup) |
| macOS | `⌘ + C + V` | Mostra la finestra principale |
| Windows | `Ctrl + C + C` | Traduci la selezione corrente (popup) |
| Windows | `Ctrl + C + V` | Mostra la finestra principale |

Entrambe sono riconfigurabili nelle Impostazioni. L'ascolto globale delle chiavi è un hook creato internamente: nessun processo separato né libreria di ascolto di terze parti — su macOS un event tap ListenOnly agganciato al run loop del thread principale, su Windows un hook di tastiera a basso livello che lascia passare ogni tasto (`WH_KEYBOARD_LL`). Le modifiche alle scorciatoie sostituiscono a caldo la tabella delle regole, senza ricostruire l'hook.

> ⚠️ **macOS** — al primo utilizzo, concedi all'app il permesso in **Impostazioni di Sistema → Privacy e Sicurezza → Monitoraggio input**, altrimenti le scorciatoie globali e la cattura della selezione non funzioneranno. Finché il permesso manca, la **pagina principale** mostra un avviso con due azioni: «Apri Monitoraggio input» e «Vai alle Impostazioni». Il permesso è legato all'hash del codice dell'app, quindi va riconcesso dopo una nuova versione. Se la voce esiste già, macOS non mostra alcuna richiesta: **spegni e riaccendi l'interruttore** per rinnovarla.
>
> **Windows** — non c'è nulla da concedere; l'hook non richiede permessi speciali.
>
> **Linux** — la traduzione da selezione non è disponibile e la pagina principale lo dichiara invece di restare in silenzio. Tutto il resto funziona.

## Compilare dal codice sorgente

### Requisiti

- macOS 11+ (Apple Silicon o Intel) — la piattaforma principale
- Windows 10/11 con gli strumenti di compilazione MSVC, oppure Linux con `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libfuse2`
- Node.js 20+ e [pnpm](https://pnpm.io/)
- Toolchain Rust (tramite `rustup`) e Xcode Command Line Tools (solo macOS)

> Qui la **compilazione crociata nativa non è possibile** (Windows richiede MSVC, Linux richiede WebKitGTK/libdbus). Le build per Windows e Linux vengono eseguite sui runner delle rispettive piattaforme: vedi `.github/workflows/ci.yml` e `.github/workflows/release.yml`.

### Passaggi

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (also builds the dictbuild sidecar)
```

### Controlli di qualità

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Qualsiasi modifica che riguarda la build Intel deve essere verificata su entrambe le architetture:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### Compilare l'installer

```bash
pnpm tauri build
# macOS:   src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux:   src-tauri/target/release/bundle/appimage/
```

Le release per tutte e quattro le chiavi di piattaforma sono prodotte dalla CI (`.github/workflows/release.yml`): basta spingere un tag annotato `v*` e la matrice di build produce dmg + NSIS + AppImage più gli artefatti dell'updater firmati con minisign; il job di publish li unisce poi in un unico `latest.json` per le quattro piattaforme.

Vedi [SIGNING_GUIDE.md](./SIGNING_GUIDE.md) per la firma degli aggiornamenti.

### Compilare i dizionari

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

I dati del dizionario inclusi occupano circa 260 MB e si trovano in `~/Library/Application Support/com.desktop-translation/`; i percorsi dei dizionari sono configurabili nelle Impostazioni.

## Struttura del progetto

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

Stratificazione: il frontend parla con Rust solo tramite `invoke`; lato Rust `commands/` resta sottile e la logica di business vive in `*_store.rs`; lo schema SQLite è definito una sola volta in `db::apply_schema()` ed è condiviso tra l'inizializzazione in produzione e i test.

## Stack

- **Framework applicativo**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Scorciatoie globali**: creato internamente, senza librerie di ascolto di terze parti — su macOS un `CGEventTap` ListenOnly sul run loop del thread principale; su Windows un hook di tastiera a basso livello che lascia passare ogni tasto (`WH_KEYBOARD_LL`) su un thread privato
- **Archiviazione**: SQLite tramite il crate `sqlite` (dizionari, impostazioni, cronologia, vocabolario, chiavi API)
- **Voce**: Web Speech API (`speechSynthesis`)
- **Plugin Tauri**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Licenza

Licenza MIT con un'ulteriore restrizione non commerciale: qualsiasi uso commerciale, di qualunque tipo, richiede la previa autorizzazione scritta del titolare del copyright (restyhap). L'uso non commerciale — studio personale, ricerca, istruzione, valutazione e uso hobbistico — non richiede alcun permesso.

## Link

- Documenti di progettazione: [docs/](./docs/)
- Firma degli aggiornamenti: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issue: https://github.com/restyhap/desktop-02-translation/issues
