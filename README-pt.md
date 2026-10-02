[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Um aplicativo de tradução para desktop no macOS que traduz no instante em que você seleciona um texto: pressione um atalho, aparece um popup com a tradução e consulte palavras em um dicionário local de qualidade GoldenDict.

Criado com Tauri 2 (Rust) + React 19. Nove idiomas de interface, todos os dados ficam no seu computador.

## Download

| Plataforma | Arquitetura | Arquivo |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

Abra o dmg e arraste o aplicativo para fora; substituir uma versão mais antiga funciona sem problemas. **Todos os dados do usuário ficam fora do pacote do aplicativo** (`~/Library/Application Support/com.desktop-translation/`), portanto atualizar nunca afeta seu histórico, vocabulário ou configurações.

> Os nomes dos arquivos contêm o número da versão — confira os nomes reais na página Releases.

### Observação sobre a versão Intel

A versão Intel (x86_64) **não inclui a síntese de voz neural MOSS-TTS**; a pronúncia passa a usar o `speechSynthesis` do sistema macOS. Motivo: sua dependência `ort-sys` não possui biblioteca pré-compilada para x86_64-macos. A consulta ao dicionário, a tradução, os popups de seleção e o histórico se comportam de forma idêntica.

## Recursos

- **Tradução por seleção** — selecione qualquer texto, pressione o atalho e obtenha um popup com a tradução; a janela principal está a um atalho de distância
- **Dicionário local** — busca exata de palavras com fonética, definições agrupadas por classe gramatical, frases de exemplo e recursos de pronúncia; compile seus próprios dicionários `.dsl.dz` com `dictbuild`
- **Múltiplos mecanismos** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba e Volcengine já configurados; adicione mecanismos personalizados e um endpoint de LLM personalizado nas configurações
- **Histórico e vocabulário** — cada tradução é armazenada, os favoritos são mantidos para sempre e as entradas podem ser enviadas para grupos de vocabulário
- **Nove idiomas de interface** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Permanente na barra de menus** — fechar a janela a oculta na bandeja; o menu da bandeja exibe a janela ou encerra o aplicativo
- **Iniciar ao fazer login** — início silencioso em segundo plano opcional via LaunchAgent, com watchdog de heartbeat para autorreparo
- **Pronúncia** — síntese de voz do sistema com configurações de voz, velocidade, tom e volume
- **Retenção de histórico** — janela de retenção configurável; registros não favoritos expirados são removidos na inicialização e sempre que você alterar a configuração

## Atalhos padrão

| Atalho | Ação |
|---|---|
| `⌘ + C + C` | Traduzir a seleção atual (popup) |
| `⌘ + C + V` | Mostrar a janela principal |

Os dois podem ser regravados nas Configurações. A escuta global de teclas roda em um processo separado `keyboard-hook` (rdev); o processo principal o protege com um watchdog de heartbeat PING/PONG e o reinicia se ele ficar sem resposta.

> ⚠️ No primeiro uso, conceda permissão ao aplicativo em **Ajustes do Sistema → Privacidade e Segurança → Acessibilidade**, caso contrário os atalhos globais e a captura da seleção não funcionarão. A permissão está vinculada à assinatura de código do aplicativo, portanto pode precisar ser concedida novamente após reinstalar uma nova versão.

## Compilar a partir do código-fonte

### Requisitos

- macOS 11+ (Apple Silicon ou Intel)
- Node.js 20+ e [pnpm](https://pnpm.io/)
- Toolchain Rust (via `rustup`) e Xcode Command Line Tools

### Passos

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (builds the keyboard-hook / dictbuild sidecars too)
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
# output: src-tauri/target/release/bundle/dmg/
```

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
  app/keyboard_hook.rs  hook watchdog and event dispatch
  bin/keyboard_hook.rs  rdev global key listener sidecar (PING/PONG heartbeat)
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              dual-architecture build + dual-host release sync script
```

Camadas: o frontend conversa com o Rust apenas por meio de `invoke`; do lado do Rust, `commands/` permanece fino e a lógica de negócio fica em `*_store.rs`; o schema do SQLite é definido uma única vez em `db::apply_schema()` e compartilhado entre a inicialização em produção e os testes.

## Stack

- **Framework do aplicativo**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Atalhos globais**: rdev (processo sidecar com watchdog de heartbeat)
- **Armazenamento**: SQLite via crate `sqlite` (dicionários, configurações, histórico, vocabulário, chaves de API)
- **Voz**: Web Speech API (`speechSynthesis`)
- **Plugins do Tauri**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Licença

Licença MIT com uma restrição adicional não comercial: qualquer uso comercial, de qualquer tipo, exige a autorização prévia por escrito do titular dos direitos autorais (restyhap). O uso não comercial — estudo pessoal, pesquisa, educação, avaliação e uso por hobby — não exige permissão.

## Links

- Documentos de projeto: [docs/](./docs/)
- Assinatura de atualizações: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Issues: https://github.com/restyhap/desktop-02-translation/issues
