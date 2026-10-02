[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

텍스트를 선택하는 즉시 번역되는 macOS 데스크톱 번역 앱입니다. 단축키를 누르면 번역 팝업이 뜨고, GoldenDict급 로컬 사전에서 단어를 찾을 수 있습니다.

Tauri 2(Rust) + React 19로 만들었고, UI는 9개 언어를 지원하며 모든 데이터는 본机上에만 남습니다.

## 다운로드

| 플랫폼 | 아키텍처 | 파일 |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

dmg을 열고 앱을 밖으로 끌어오면 됩니다. 이전 버전 위에 덮어씌워도 문제없습니다. **모든 사용자 데이터는 앱 번들 바깥에 저장됩니다**(`~/Library/Application Support/com.desktop-translation/`), 따라서 업그레이드해도 기록, 단어장, 설정이 그대로 유지됩니다.

> 배포 파일 이름에는 버전 번호가 들어갑니다 — 실제 파일 이름은 Releases 페이지에서 확인하세요.

### Intel 빌드 안내

Intel(x86_64) 빌드에는 **MOSS-TTS 신경 음성 합성이 포함되지 않습니다**. 발음은 macOS 시스템 `speechSynthesis`로 대체됩니다. 이유는 의존성인 `ort-sys`에 x86_64-macos용 사전 빌드 라이브러리가 없기 때문입니다. 사전 조회, 번역, 선택 팝업, 기록 기능은 완전히 동일하게 동작합니다.

## 기능

- **선택 번역** — 아무 텍스트나 선택하고 단축키를 누르면 번역 팝업이 뜹니다. 주 창도 단축키 한 번에 불러올 수 있습니다
- **로컬 사전** — 발음 기호, 품사별로 묶인 뜻풀이, 예문, 발음 리소스를 갖춘 정확 일치 단어 조회. `dictbuild`를 이용해 `.dsl.dz` 사전을 직접 만들 수도 있습니다
- **여러 엔진** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba, Volcengine가 사전 설정되어 있습니다. 설정에서 사용자 정의 엔진과 사용자 정의 LLM 엔드포인트를 추가할 수 있습니다
- **기록과 단어장** — 모든 번역이 저장되고, 즐겨찾기는 영구히 유지되며, 항목을 단어장 그룹으로 보낼 수 있습니다
- **9개 UI 언어** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **메뉴바 상주** — 창을 닫으면 트레이로 숨겨지고, 트레이 메뉴에서 창을 표시하거나 종료합니다
- **로그인 시 자동 시작** — LaunchAgent를 통한 선택적 조용한 백그라운드 시작을 지원하며, heartbeat 워치독으로 자가 복구됩니다
- **발음** — 시스템 음성 합성으로, 음색/속도/음높이/볼륨 설정 지원
- **기록 보관 기간** — 보관 기간을 설정할 수 있으며, 만료된 비즐겨찾기 기록은 시작할 때와 설정을 바꿀 때마다 정리됩니다

## 기본 단축키

| 단축키 | 동작 |
|---|---|
| `⌘ + C + C` | 현재 선택 영역 번역(팝업) |
| `⌘ + C + V` | 주 창 표시 |

두 단축키 모두 설정에서 다시 녹화할 수 있습니다. 전역 키 리스닝은 별도의 `keyboard-hook` 프로세스(rdev)에서 동작하며, 주 프로세스가 PING/PONG heartbeat 워치독으로 감시해 응답이 없을 때 다시 띄웁니다.

> ⚠️ 처음 사용할 때 **System Settings → Privacy & Security → Accessibility**에서 앱 권한을 허용하지 않으면 전역 단축키와 선택 영역 캡처가 동작하지 않습니다. 권한은 앱 코드 서명에 묶여 있어서 새 버전을 다시 설치하면 권한을 다시 허용해야 할 수 있습니다.

## 소스에서 빌드

### 요구 사항

- macOS 11+(Apple Silicon 또는 Intel)
- Node.js 20+ 와 [pnpm](https://pnpm.io/)
- Rust toolchain(`rustup` 경유) 과 Xcode Command Line Tools

### 단계

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (builds the keyboard-hook / dictbuild sidecars too)
```

### 품질 게이트

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Intel 빌드에 영향을 주는 변경은 두 target 모두에서 확인해야 합니다:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### 설치 패키지 빌드

```bash
pnpm tauri build
# output: src-tauri/target/release/bundle/dmg/
```

업데이트 서명에 관해서는 [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)를 참고하세요.

### 사전 빌드

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

번들에 포함된 사전 데이터는 약 260MB이며 `~/Library/Application Support/com.desktop-translation/`에 있습니다. 사전 경로는 설정에서 바꿀 수 있습니다.

## 프로젝트 구조

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

계층 구조: 프론트엔드는 `invoke`를 통해서만 Rust와 통신합니다. Rust 쪽에서 `commands/`는 얇은 계층으로 유지되고, 비즈니스 로직은 `*_store.rs`에 담깁니다. SQLite 스키마는 `db::apply_schema()`에 한 번만 정의되며, 운영 초기화와 테스트가 이를 공유합니다.

## 기술 스택

- **앱 프레임워크**: Tauri 2.12(Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **전역 단축키**: rdev(heartbeat 워치독을 갖춘 별도 프로세스)
- **저장소**: `sqlite` 크레이트를 통한 SQLite(사전, 설정, 기록, 단어장, API 키)
- **음성**: Web Speech API(`speechSynthesis`)
- **Tauri 플러그인**: autostart(LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## 라이선스

MIT License에 비영리 사용 제한 조항이 추가되어 있습니다. 어떠한 형태의 상업적 사용도 저작권자 restyhap의 사전 서면 허가를 받아야 합니다.

## 링크

- 설계 문서: [docs/](./docs/)
- 업데이트 서명: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- 이슈: https://github.com/restyhap/desktop-02-translation/issues