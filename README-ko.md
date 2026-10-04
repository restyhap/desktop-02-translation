[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

**macOS와 Windows**를 대상으로 하는 데스크톱 번역 앱입니다. 텍스트를 선택하는 즉시 번역되고, 단축키를 누르면 번역 팝업이 뜨며, GoldenDict급 로컬 사전에서 단어를 찾을 수 있습니다. macOS가 주 타깃이며, Linux 빌드도 제공하지만 아직 선택 번역을 지원하지 않습니다.

Tauri 2(Rust) + React 19로 만들었고, UI는 9개 언어를 지원하며 모든 데이터는 본机上에만 남습니다.

## 다운로드

| 플랫폼 | 아키텍처 | 파일 |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |
| Windows 10 / 11 | x86_64 | `DesktopTranslation_{version}_x64-setup.exe`(NSIS 인스톨러) |
| Linux | x86_64 | `DesktopTranslation_{version}_amd64.AppImage` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

**macOS** — dmg을 열고 앱을 밖으로 끌어오면 됩니다. **Windows** — `.exe` 인스톨러를 실행하세요. SmartScreen가 알 수 없는 게시자를 경고하면 *자세히 정보 → 그래도 실행*을 선택합니다(아래 참고). **Linux** — AppImage에 `chmod +x`를 적용한 뒤 실행하세요. FUSE 런타임이 필요하며, `APPIMAGE_EXTRACT_AND_RUN=1`로 실행할 수도 있습니다.

이전 버전 위에 덮어씌워도 문제없습니다. **모든 사용자 데이터는 앱 번들 바깥에 저장됩니다**(macOS는 `~/Library/Application Support/com.desktop-translation/`, Windows는 `%APPDATA%\com.desktop-translation\`, Linux는 `~/.local/share/com.desktop-translation/`), 따라서 업그레이드해도 기록, 단어장, 설정이 그대로 유지됩니다.

> 배포 파일 이름에는 버전 번호가 들어갑니다 — 실제 파일 이름은 Releases 페이지에서 확인하세요.

### 플랫폼 지원

| | macOS | Windows | Linux |
|---|---|---|---|
| 선택 번역(전역 단축키) | ✅ | ✅ | ❌ 아직 미지원 |
| 로컬 사전 조회 | ✅ | ✅ | ✅ |
| 번역 엔진 / 기록 / 단어장 | ✅ | ✅ | ✅ |
| 신경 음성(MOSS-TTS) | ✅ Apple Silicon 전용 | ❌ 시스템 음성 | ❌ 시스템 음성 |
| 앱 내 업데이트 | ✅ | ✅ | ✅ |
| 시스템 코드 서명 | ad-hoc | 없음 — SmartScreen 경고 | 없음 |

Windows의 전역 단축키는 **권한 요청 없이** 동작합니다(다른 앱으로 모든 키를 그대로 통과시키는 로우 레벨 키보드 훅을 쓰기 때문입니다). Linux의 선택 번역은 구현되지 않았습니다 — Wayland가 앱의 전역 키 캡처를 금지하기 때문입니다. 앱은 아무 반응 없이 침묵하지 않고 홈 화면에 그 사실을 알려 줍니다. 그 외 기능은 수동 입력 번역을 포함해 정상적으로 동작합니다.

> ⚠️ **Windows SmartScreen** — 인스톨러가 Authenticode 서명되어 있지 않아 Windows가 "Windows가 PC를 보호했습니다"라고 알릴 수 있습니다. *자세히 정보 → 그래도 실행*을 선택하세요. 이는 업데이트의 minisign 서명과 별개이며, 후자는 업데이트 패키지만 검증합니다.

### 음성 합성 안내

**Intel(x86_64)** 빌드와 **macOS 이외의 모든** 빌드에는 **MOSS-TTS 신경 음성 합성이 포함되지 않습니다**. 발음은 시스템 `speechSynthesis`로 대체됩니다. 이유는 의존성인 `ort-sys`에 x86_64-macos / Windows / Linux용 사전 빌드 라이브러리가 없기 때문입니다. 사전 조회, 번역, 선택 팝업, 기록 기능은 완전히 동일하게 동작합니다.

## 기능

- **선택 번역** — 아무 텍스트나 선택하고 단축키를 누르면 번역 팝업이 뜹니다. 주 창도 단축키 한 번에 불러올 수 있습니다
- **로컬 사전** — 발음 기호, 품사별로 묶인 뜻풀이, 예문, 발음 리소스를 갖춘 정확 일치 단어 조회. `dictbuild`를 이용해 `.dsl.dz` 사전을 직접 만들 수도 있습니다
- **여러 엔진** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba, Volcengine가 사전 설정되어 있습니다. 설정에서 사용자 정의 엔진과 사용자 정의 LLM 엔드포인트를 추가할 수 있습니다
- **기록과 단어장** — 모든 번역이 저장되고, 즐겨찾기는 영구히 유지되며, 항목을 단어장 그룹으로 보낼 수 있습니다
- **9개 UI 언어** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **메뉴바 상주** — 창을 닫으면 트레이로 숨겨집니다(macOS는 메뉴바, 그 외 플랫폼은 알림 영역). 트레이 메뉴에서 창을 표시하거나 종료합니다
- **로그인 시 자동 시작** — LaunchAgent(macOS) / 그 외 플랫폼은 각자의 autostart 메커니즘을 통한 선택적 조용한 백그라운드 시작을 지원하며, heartbeat 워치독으로 자가 복구됩니다
- **발음** — 시스템 음성 합성으로, 음색/속도/음높이/볼륨 설정 지원
- **기록 보관 기간** — 보관 기간을 설정할 수 있으며, 만료된 비즐겨찾기 기록은 시작할 때와 설정을 바꿀 때마다 정리됩니다

## 기본 단축키

| 플랫폼 | 단축키 | 동작 |
|---|---|---|
| macOS | `⌘ + C + C` | 현재 선택 영역 번역(팝업) |
| macOS | `⌘ + C + V` | 주 창 표시 |
| Windows | `Ctrl + C + C` | 현재 선택 영역 번역(팝업) |
| Windows | `Ctrl + C + V` | 주 창 표시 |

두 단축키 모두 설정에서 다시 녹화할 수 있습니다. 전역 키 리스닝은 직접 만든 훅을 사용합니다 — 별도 프로세스도, 서드파티 훅 라이브러리도 없습니다. macOS는 주 스레드 run loop에 붙인 ListenOnly event tap, Windows는 모든 키를 그대로 통과시키는 로우 레벨 키보드 훅(`WH_KEYBOARD_LL`)입니다. 단축키를 바꾸면 훅을 다시 만들지 않고 규칙 테이블을 핫스왑합니다.

> ⚠️ **macOS** — 처음 사용할 때 **System Settings → Privacy & Security → Input Monitoring**에서 앱 권한을 허용하지 않으면 전역 단축키와 선택 영역 캡처가 동작하지 않습니다. 권한이 없으면 **홈 화면**에 경고 배너가 뜨고, 「Input Monitoring 열기」와 「설정으로 이동」 두 가지 버튼이 제공됩니다. 권한은 앱 코드 해시에 묶여 있어서 새 버전을 설치하면 권한을 다시 허용해야 합니다. 이미 항목이 있으면 macOS는 직접 묻지 않으니, **스위치를 껐다 켜서** 갱신하세요.
>
> **Windows** — 허용해 줄 것이 없습니다. 훅에는 특별한 권한이 필요하지 않습니다.
>
> **Linux** — 선택 번역을 쓸 수 없으며, 앱은 침묵하지 않고 그 사실을 홈 화면에 알려 줍니다. 그 외 기능은 모두 정상적으로 동작합니다.

## 소스에서 빌드

### 요구 사항

- macOS 11+(Apple Silicon 또는 Intel) — 주 타깃
- Windows 10/11 + MSVC 빌드 도구, 또는 Linux + `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libfuse2`
- Node.js 20+ 와 [pnpm](https://pnpm.io/)
- Rust toolchain(`rustup` 경유) 과 Xcode Command Line Tools(macOS 전용)

> 여기서는 네이티브 교차 컴파일이 되지 않습니다(Windows는 MSVC, Linux는 WebKitGTK/libdbus가 필요). Windows와 Linux 빌드는 각자 플랫폼의 러너에서 실행됩니다 — `.github/workflows/ci.yml`과 `.github/workflows/release.yml`을 참고하세요.

### 단계

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (also builds the dictbuild sidecar)
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
# macOS:   src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux:   src-tauri/target/release/bundle/appimage/
```

네 개 플랫폼 키에 대한 릴리스는 CI(`.github/workflows/release.yml`)가 만듭니다. annotated `v*` 태그를 푸시하면 빌드 매트릭스가 dmg + NSIS + AppImage와 minisign 서명된 업데이터 산출물을 만들고, publish job이 이를 네 플랫폼 `latest.json` 하나로 합칩니다.

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
  app/hook_core.rs        platform-neutral rule matching + translate action (all platforms)
  app/keyboard_hook.rs        macOS: self-built ListenOnly event tap on the main run loop
  app/keyboard_hook_windows.rs  Windows: pass-through low-level keyboard hook (WH_KEYBOARD_LL)
  app/keyboard_hook_unsupported.rs  other platforms: no-op placeholder with the same API
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              macOS-only dual-architecture build + dual-host release script
                        (four-platform releases go through CI; the script refuses to
                         overwrite a multi-platform latest.json)
```

계층 구조: 프론트엔드는 `invoke`를 통해서만 Rust와 통신합니다. Rust 쪽에서 `commands/`는 얇은 계층으로 유지되고, 비즈니스 로직은 `*_store.rs`에 담깁니다. SQLite 스키마는 `db::apply_schema()`에 한 번만 정의되며, 운영 초기화와 테스트가 이를 공유합니다.

## 기술 스택

- **앱 프레임워크**: Tauri 2.12(Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **전역 단축키**: 직접 만듦, 서드파티 훅 라이브러리 없음 — macOS는 주 스레드 run loop 위의 ListenOnly `CGEventTap`, Windows는 전용 스레드에서 모든 키를 통과시키는 `WH_KEYBOARD_LL` 로우 레벨 키보드 훅
- **저장소**: `sqlite` 크레이트를 통한 SQLite(사전, 설정, 기록, 단어장, API 키)
- **음성**: Web Speech API(`speechSynthesis`)
- **Tauri 플러그인**: autostart(LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## 라이선스

MIT License에 비영리 사용 제한 조항이 추가되어 있습니다. 어떠한 형태의 상업적 사용도 저작권자 restyhap의 사전 서면 허가를 받아야 합니다.

## 링크

- 설계 문서: [docs/](./docs/)
- 업데이트 서명: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- 이슈: https://github.com/restyhap/desktop-02-translation/issues