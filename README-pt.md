[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Um aplicativo de tradução para desktop no **macOS e no Windows** que traduz no instante em que você seleciona um texto: pressione um atalho, aparece um popup com a tradução e consulte palavras em um dicionário local de qualidade GoldenDict. O macOS é o alvo principal; as versões para Linux são fornecidas, mas ainda não oferecem tradução por seleção.

Criado com Tauri 2 (Rust) + React 19. Nove idiomas de interface, todos os dados ficam no seu computador.

## Download

| Plataforma | Arquitetura | Arquivo |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |
| Windows 10 / 11 | x86_64 | `DesktopTranslation_{version}_x64-setup.exe` (instalador NSIS) |
| Linux | x86_64 | `DesktopTranslation_{version}_amd64.AppImage` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

**macOS** — abra o dmg e arraste o aplicativo para fora. **Windows** — execute o instalador `.exe`; se o SmartScreen avisar sobre um publicador desconhecido, escolha *Mais informações → Executar assim mesmo* (veja a observação abaixo). **Linux** — aplique `chmod +x` ao AppImage e execute-o; ele precisa de um runtime FUSE, ou então inicie-o com `APPIMAGE_EXTRACT_AND_RUN=1`.

Substituir uma versão mais antiga funciona sem problemas. **Todos os dados do usuário ficam fora do pacote do aplicativo** (`~/Library/Application Support/com.desktop-translation/` no macOS, `%APPDATA%\com.desktop-translation\` no Windows, `~/.local/share/com.desktop-translation/` no Linux), portanto atualizar nunca afeta seu histórico, vocabulário ou configurações.

> Os nomes dos arquivos contêm o número da versão — confira os nomes reais na página Releases.

### Suporte a plataformas

| | macOS | Windows | Linux |
|---|---|---|---|
| Tradução por seleção (atalho global) | ✅ | ✅ | ❌ ainda não |
| Consulta ao dicionário local | ✅ | ✅ | ✅ |
| Mecanismos, histórico, vocabulário | ✅ | ✅ | ✅ |
| Voz neural (MOSS-TTS) | ✅ apenas Apple Silicon | ❌ voz do sistema | ❌ voz do sistema |
| Atualizações no aplicativo | ✅ | ✅ | ✅ |
| Assinatura de código do sistema | ad-hoc | nenhuma — aviso do SmartScreen | nenhuma |

No Windows os atalhos globais funcionam **sem nenhuma solicitação de permissão** (usa um hook de teclado de baixo nível que repassa todas as teclas aos outros aplicativos). A tradução por seleção no Linux não está implementada: o Wayland proíbe que aplicativos capturem teclas globais. O aplicativo informa isso na página inicial em vez de falhar silenciosamente — todo o restante, inclusive a tradução manual, funciona normalmente.

> ⚠️ **SmartScreen no Windows** — o instalador não é assinado com Authenticode, portanto o Windows pode exibir “O Windows protegeu seu PC”. Escolha *Mais informações → Executar assim mesmo*. Isso é diferente da assinatura minisign usada nas atualizações, que cobre apenas os pacotes de atualização.

### Observação sobre a síntese de voz

A versão **Intel (x86_64)** e **todas as versões fora do macOS** **não incluem a síntese de voz neural MOSS-TTS**; a pronúncia passa a usar o `speechSynthesis` do sistema. Motivo: sua dependência `ort-sys` não possui biblioteca pré-compilada para x86_64-macos, Windows ou Linux. A consulta ao dicionário, a tradução, os popups de seleção e o histórico se comportam de forma idêntica.

## Recursos

- **Tradução por seleção** — selecione qualquer texto, pressione o atalho e obtenha um popup com a tradução; a janela principal está a um atalho de distância
- **Dicionário local** — busca exata de palavras com fonética, definições agrupadas por classe gramatical, frases de exemplo e recursos de pronúncia; compile seus próprios dicionários `.dsl.dz` com `dictbuild`
- **Múltiplos mecanismos** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba e Volcengine já configurados; adicione mecanismos personalizados e um endpoint de LLM personalizado nas configurações
- **Histórico e vocabulário** — cada tradução é armazenada, os favoritos são mantidos para sempre e as entradas podem ser enviadas para grupos de vocabulário
- **Nove idiomas de interface** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Permanente na barra de menus** — fechar a janela a oculta na bandeja (barra de menus no macOS, área de notificação nas demais plataformas); o menu da bandeja exibe a janela ou encerra o aplicativo
- **Iniciar ao fazer login** — início silencioso em segundo plano opcional via LaunchAgent (macOS) / o mecanismo de autostart de cada plataforma nas demais, com watchdog de heartbeat para autorreparo
- **Pronúncia** — síntese de voz do sistema com configurações de voz, velocidade, tom e volume
- **Retenção de histórico** — janela de retenção configurável; registros não favoritos expirados são removidos na inicialização e sempre que você alterar a configuração

## Atalhos padrão

| Plataforma | Atalho | Ação |
|---|---|---|
| macOS | `⌘ + C + C` | Traduzir a seleção atual (popup) |
| macOS | `⌘ + C + V` | Mostrar a janela principal |
| Windows | `Ctrl + C + C` | Traduzir a seleção atual (popup) |
| Windows | `Ctrl + C + V` | Mostrar a janela principal |

Os dois podem ser regravados nas Configurações. A escuta global de teclas é um hook próprio, sem processo auxiliar e sem biblioteca de terceiros: no macOS, um event tap ListenOnly ligado ao run loop da thread principal; no Windows, um hook de teclado de baixo nível que repassa todas as teclas (`WH_KEYBOARD_LL`). Alterações de atalhos substituem a tabela de regras a quente, sem reconstruir o hook.

> ⚠️ **macOS** — no primeiro uso, conceda permissão ao aplicativo em **Ajustes do Sistema → Privacidade e Segurança → Monitorização de entrada**, caso contrário os atalhos globais e a captura da seleção não funcionarão. Enquanto a permissão faltar, a **página inicial** exibe um aviso com duas ações: “Abrir Monitorização de entrada” e “Ir para Configurações”. A permissão está vinculada ao hash de código do aplicativo, portanto precisa ser concedida novamente após instalar uma nova versão. Se a entrada já existir, o macOS não mostra nenhuma solicitação — **desligue e religue o interruptor** para renová-la.
>
> **Windows** — nada a conceder; o hook não precisa de nenhuma permissão especial.
>
> **Linux** — a tradução por seleção não está disponível, e a página inicial informa isso em vez de ficar em silêncio. Todo o restante funciona.

## Compilar a partir do código-fonte

### Requisitos

- macOS 11+ (Apple Silicon ou Intel) — o alvo principal
- Windows 10/11 com as ferramentas de build MSVC, ou Linux com `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libfuse2`
- Node.js 20+ e [pnpm](https://pnpm.io/)
- Toolchain Rust (via `rustup`) e Xcode Command Line Tools (somente macOS)

> A compilação cruzada nativa não funciona aqui (o Windows precisa de MSVC, o Linux precisa de WebKitGTK/libdbus). As builds para Windows e Linux são executadas nos runners dessas próprias plataformas — veja `.github/workflows/ci.yml` e `.github/workflows/release.yml`.

### Passos

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (also builds the dictbuild sidecar)
```

### Verificações de qualidade

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Qualquer alteração que afete a versão Intel deve ser verificada nas duas arquiteturas:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### Compilar o instalador

```bash
pnpm tauri build
# macOS:   src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux:   src-tauri/target/release/bundle/appimage/
```

Os releases das quatro chaves de plataforma são produzidos pela CI (`.github/workflows/release.yml`): envie uma tag anotada `v*` e a matriz de build produz dmg + NSIS + AppImage, além dos artefatos de atualização assinados com minisign; em seguida o job de publish os mescla em um único `latest.json` para as quatro plataformas.

Consulte [SIGNING_GUIDE.md](./SIGNING_GUIDE.md) sobre a assinatura de atualizações.

### Compilar dicionários

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

Os dados de dicionário incluídos ocupam cerca de 260 MB e ficam em `~/Library/Application Support/com.desktop-translation/`; os caminhos dos dicionários podem ser configurados nas Configurações.

## Estrutura do projeto

```
src/                    React 19 frontend (Tailwind 4)
  pages/                translate / history / vocabulary / dictionary / settings
  storage/              invoke wrappers (the only frontend→backend entry point)
  types/settings.ts     DEFAULT_SETTINGS (must stay in sync with Rust defaults)
  lib/i18n.ts           nine-language strings

src-tauri/src/
  lib.rs                Tauri Builder wiring (plugin registration)
  app/hook_core.rs        correspondência de regras neutra quanto à plataforma + ação de tradução (todas as plataformas)
  app/keyboard_hook.rs        macOS: event tap ListenOnly próprio ligado ao run loop da thread principal
  app/keyboard_hook_windows.rs  Windows: hook de teclado de baixo nível que repassa as teclas (WH_KEYBOARD_LL)
  app/keyboard_hook_unsupported.rs  demais plataformas: placeholder inoperante com a mesma API
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              build de duas arquiteturas apenas para macOS + script de sincronização com os dois hosts
                          (os releases de quatro plataformas passam pela CI; o script se recusa a
                           sobrescrever um latest.json de múltiplas plataformas)
```

Camadas: o frontend conversa com o Rust apenas por meio de `invoke`; do lado do Rust, `commands/` permanece fino e a lógica de negócio fica em `*_store.rs`; o schema do SQLite é definido uma única vez em `db::apply_schema()` e compartilhado entre a inicialização em produção e os testes.

## Stack

- **Framework do aplicativo**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Atalhos globais**: próprios, sem biblioteca de terceiros para hooks — event tap `CGEventTap` (ListenOnly) do macOS no run loop da thread principal; no Windows, hook de teclado de baixo nível `WH_KEYBOARD_LL` que repassa as teclas, em uma thread privada
- **Armazenamento**: SQLite via crate `sqlite` (dicionários, configurações, histórico, vocabulário, chaves de API)
- **Voz**: Web Speech API (`speechSynthesis`)
- **Plugins do Tauri**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Licença

Licença MIT com uma restrição adicional não comercial: qualquer uso comercial, de qualquer tipo, exige a autorização prévia por escrito do titular dos direitos autorais (restyhap). O uso não comercial — estudo pessoal, pesquisa, educação, avaliação e uso por hobby — não exige permissão.

## Links

- Documentos de projeto: [docs/](./docs/)
- Assinatura de atualizações: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issues: https://github.com/restyhap/desktop-02-translation/issues
