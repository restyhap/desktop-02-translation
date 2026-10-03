[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Un'app di traduzione desktop per macOS che traduce nel momento in cui selezioni un testo: premi una scorciatoia, compare un popup con la traduzione e consulta le parole in un dizionario locale di qualità GoldenDict.

Realizzata con Tauri 2 (Rust) + React 19. Nove lingue per l'interfaccia, tutti i dati restano sul tuo computer.

## Download

| Piattaforma | Architettura | Asset |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

Apri il dmg e trascina fuori l'app; sostituire una versione più vecchia funziona senza problemi. **Tutti i dati utente risiedono fuori dal bundle dell'app** (`~/Library/Application Support/com.desktop-translation/`), quindi aggiornare non tocca mai la cronologia, il vocabolario o le impostazioni.

> I nomi degli asset contengono il numero di versione — controlla i nomi effettivi dei file nella pagina Releases.

### Nota per la build Intel

La build Intel (x86_64) **non include la sintesi vocale neurale MOSS-TTS**; la pronuncia ricade sul `speechSynthesis` di sistema di macOS. Motivo: la sua dipendenza `ort-sys` non dispone di una libreria x86_64-macos precompilata. Consultazione del dizionario, traduzione, popup di selezione e cronologia si comportano in modo identico.

## Funzionalità

- **Traduzione da selezione** — seleziona qualsiasi testo, premi la scorciatoia e ottieni un popup con la traduzione; la finestra principale è a una scorciatoia di distanza
- **Dizionario locale** — ricerca esatta delle parole con fonetica, definizioni raggruppate per parte del discorso, frasi d'esempio e risorse di pronuncia; costruisci i tuoi dizionari `.dsl.dz` con `dictbuild`
- **Motori multipli** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba e Volcengine già configurati; aggiungi motori personalizzati e un endpoint LLM personalizzato nelle impostazioni
- **Cronologia e vocabolario** — ogni traduzione viene memorizzata, i preferiti restano per sempre e le voci possono essere inviate in gruppi di vocabolario
- **Nove lingue per l'interfaccia** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Sempre nella barra dei menu** — chiudere la finestra la nasconde nell'area di notifica; il menu dell'area di notifica mostra la finestra o esce
- **Avvio al login** — avvio silenzioso in background opzionale tramite LaunchAgent, con watchdog heartbeat per l'auto-riparazione
- **Pronuncia** — sintesi vocale di sistema con impostazioni di voce, velocità, intonazione e volume
- **Conservazione della cronologia** — finestra di conservazione configurabile; i record scaduti non preferiti vengono eliminati all'avvio e ogni volta che modifichi l'impostazione

## Scorciatoie predefinite

| Scorciatoia | Azione |
|---|---|
| `⌘ + C + C` | Traduci la selezione corrente (popup) |
| `⌘ + C + V` | Mostra la finestra principale |

Entrambe sono riconfigurabili nelle Impostazioni. L'ascolto globale delle chiavi usa un event tap di macOS agganciato al run loop del thread principale: nessun processo separato né libreria di terze parti. Le modifiche alle scorciatoie sostituiscono a caldo la tabella delle regole, senza ricostruire il tap.

> ⚠️ Al primo utilizzo, concedi all'app il permesso in **Impostazioni di Sistema → Privacy e Sicurezza → Monitoraggio input**, altrimenti le scorciatoie globali e la cattura della selezione non funzioneranno. Finché il permesso manca, l'app mostra un avviso con accesso in un clic a quel pannello. Il permesso è legato all'hash del codice dell'app, quindi va riconcesso dopo una nuova versione.

## Compilare dal codice sorgente

### Requisiti

- macOS 11+ (Apple Silicon o Intel)
- Node.js 20+ e [pnpm](https://pnpm.io/)
- Toolchain Rust (tramite `rustup`) e Xcode Command Line Tools

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
# output: src-tauri/target/release/bundle/dmg/
```

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
  app/keyboard_hook.rs  global hotkeys: self-built ListenOnly event tap on the main run loop
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              dual-architecture build + dual-host release sync script
```

Stratificazione: il frontend parla con Rust solo tramite `invoke`; lato Rust `commands/` resta sottile e la logica di business vive in `*_store.rs`; lo schema SQLite è definito una sola volta in `db::apply_schema()` ed è condiviso tra l'inizializzazione in produzione e i test.

## Stack

- **Framework applicativo**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Scorciatoie globali**: event tap macOS creato internamente (ListenOnly), agganciato al run loop del thread principale
- **Archiviazione**: SQLite tramite il crate `sqlite` (dizionari, impostazioni, cronologia, vocabolario, chiavi API)
- **Voce**: Web Speech API (`speechSynthesis`)
- **Plugin Tauri**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Licenza

Licenza MIT con un'ulteriore restrizione non commerciale: qualsiasi uso commerciale, di qualunque tipo, richiede la previa autorizzazione scritta del titolare del copyright (restyhap). L'uso non commerciale — studio personale, ricerca, istruzione, valutazione e uso hobbistico — non richiede alcun permesso.

## Link

- Documenti di progettazione: [docs/](./docs/)
- Firma degli aggiornamenti: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issue: https://github.com/restyhap/desktop-02-translation/issues
