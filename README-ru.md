[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Приложение для перевода на компьютере с **macOS и Windows**: перевод происходит в момент выделения текста — нажмите горячую клавишу, получите всплывающее окно с переводом и ищите слова в локальном словаре уровня GoldenDict. macOS — основная платформа; сборки для Linux предоставляются, но пока не поддерживают перевод по выделению.

Собрано на Tauri 2 (Rust) + React 19. Девять языков интерфейса, все данные остаются на вашем компьютере.

## Загрузка

| Платформа | Архитектура | Файл |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |
| Windows 10 / 11 | x86_64 | `DesktopTranslation_{version}_x64-setup.exe` (установщик NSIS) |
| Linux | x86_64 | `DesktopTranslation_{version}_amd64.AppImage` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

**macOS** — откройте dmg и перетащите приложение наружу. **Windows** — запустите установщик `.exe`; если SmartScreen предупредит о неизвестном издателе, выберите *Подробнее → Выполнить в любом случае* (см. примечание ниже). **Linux** — выполните `chmod +x` для AppImage и запустите его; ему нужен runtime FUSE, либо запустите его с `APPIMAGE_EXTRACT_AND_RUN=1`.

Замена старой версии проходит без проблем. **Все пользовательские данные хранятся вне пакета приложения** (`~/Library/Application Support/com.desktop-translation/` в macOS, `%APPDATA%\com.desktop-translation\` в Windows, `~/.local/share/com.desktop-translation/` в Linux), поэтому при обновлении не затрагиваются ни ваша история, ни словарь, ни настройки.

> Имена файлов содержат номер версии — проверяйте фактические имена файлов на странице Releases.

### Поддержка платформ

| | macOS | Windows | Linux |
|---|---|---|---|
| Перевод по выделению (горячая клавиша) | ✅ | ✅ | ❌ пока нет |
| Поиск в локальном словаре | ✅ | ✅ | ✅ |
| Движки, история, словарь слов | ✅ | ✅ | ✅ |
| Нейросетевая речь (MOSS-TTS) | ✅ только Apple Silicon | ❌ системный голос | ❌ системный голос |
| Обновление внутри приложения | ✅ | ✅ | ✅ |
| Системная подпись кода | ad-hoc | нет — предупреждение SmartScreen | нет |

На Windows глобальные горячие клавиши работают **без запроса каких-либо разрешений** (используется низкоуровневый перехват клавиатуры, который пропускает все клавиши в другие приложения). Перевод по выделению на Linux не реализован: Wayland запрещает приложениям перехватывать глобальные нажатия. Приложение сообщает об этом на главной странице, а не молча ничего не делает — всё остальное, включая перевод вручную, работает как обычно.

> ⚠️ **SmartScreen в Windows** — установщик не подписан Authenticode, поэтому Windows может показать «Windows защитил ваш компьютер». Выберите *Подробнее → Выполнить в любом случае*. Это не то же самое, что подпись minisign у обновлений: она покрывает только пакеты обновлений.

### Примечание о синтезе речи

Сборка **Intel (x86_64)** и **все сборки, кроме macOS** **не включают нейросетевой синтез речи MOSS-TTS**; озвучивание выполняется через системный `speechSynthesis`. Причина: у зависимости `ort-sys` нет готовой скомпилированной библиотеки для x86_64-macos, Windows или Linux. Поиск по словарю, перевод, всплывающие окна по выделению и история работают абсолютно так же.

## Возможности

- **Перевод по выделению** — выделите любой текст, нажмите горячую клавишу и получите всплывающее окно с переводом; главное окно открывается одной горячей клавишей
- **Локальный словарь** — точный поиск слов с транскрипцией, определениями, сгруппированными по частям речи, примерами и ресурсами для озвучивания; собирайте собственные словари `.dsl.dz` с помощью `dictbuild`
- **Несколько движков** — предустановлены Google, DeepL, Baidu, Youdao, Caiyun, Alibaba и Volcengine; добавляйте собственные движки и собственный LLM-эндпоинт в настройках
- **История и словарь** — каждое переведённое высказывание сохраняется, избранное хранится вечно, а записи можно отправлять в группы словаря
- **Девять языков интерфейса** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Живёт в строке меню** — закрытие окна сворачивает его в трей (строка меню в macOS, область уведомлений на остальных платформах); меню трея позволяет показать окно или выйти
- **Запуск при входе в систему** — необязательный тихий фоновый запуск через LaunchAgent (macOS) / собственный механизм автозапуска на остальных платформах, со сторожевым механизмом на основе heartbeat для самовосстановления
- **Озвучивание** — системный синтез речи с настройками голоса, скорости, высоты тона и громкости
- **Срок хранения истории** — настраиваемый период хранения; просроченные записи, кроме избранных, удаляются при запуске и при каждом изменении этой настройки

## Горячие клавиши по умолчанию

| Платформа | Горячие клавиши | Действие |
|---|---|---|
| macOS | `⌘ + C + C` | Перевести текущее выделение (всплывающее окно) |
| macOS | `⌘ + C + V` | Показать главное окно |
| Windows | `Ctrl + C + C` | Перевести текущее выделение (всплывающее окно) |
| Windows | `Ctrl + C + V` | Показать главное окно |

Обе комбинации можно переназначить в настройках. Глобальный перехват клавиш — собственный хук, без отдельного вспомогательного процесса и без сторонних библиотек: в macOS это event tap ListenOnly на run loop главного потока, в Windows — низкоуровневый перехват клавиатуры, пропускающий все клавиши (`WH_KEYBOARD_LL`). Изменение горячих клавиш подменяет таблицу правил на лету, без пересоздания хука.

> ⚠️ **macOS** — при первом использовании выдайте приложению разрешение в разделе **System Settings → Privacy & Security → Input Monitoring** (Контроль клавиатуры и ввода), иначе глобальные горячие клавиши и перевод по выделению не будут работать. Пока разрешение не выдано, **главная страница** показывает предупреждение с двумя действиями: «Открыть Input Monitoring» и «Перейти в настройки». Разрешение привязано к хешу кода приложения, поэтому после установки новой версии его нужно выдать заново. Если запись уже есть, macOS не покажет запрос — **выключите и включите переключатель** заново, чтобы обновить её.
>
> **Windows** — ничего выдавать не нужно; хуку не требуется никаких специальных разрешений.
>
> **Linux** — перевод по выделению недоступен, и главная страница сообщает об этом, а не молчит. Всё остальное работает.

## Сборка из исходного кода

### Требования

- macOS 11+ (Apple Silicon или Intel) — основная платформа
- Windows 10/11 со средствами сборки MSVC или Linux с `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libfuse2`
- Node.js 20+ и [pnpm](https://pnpm.io/)
- Rust toolchain (через `rustup`) и Xcode Command Line Tools (только macOS)

> Нативная кросс-компиляция здесь не работает (для Windows нужен MSVC, для Linux — WebKitGTK/libdbus). Сборки для Windows и Linux выполняются на собственных раннерах этих платформ — см. `.github/workflows/ci.yml` и `.github/workflows/release.yml`.

### Шаги

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (also builds the dictbuild sidecar)
```

### Проверки качества

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Всё, что затрагивает сборку Intel, необходимо проверять на обеих архитектурах:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### Сборка установщика

```bash
pnpm tauri build
# macOS:   src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux:   src-tauri/target/release/bundle/appimage/
```

Релизы для всех четырёх ключей платформ собирает CI (`.github/workflows/release.yml`): отправьте аннотированный тег `v*`, и матрица сборки создаст dmg + NSIS + AppImage вместе с артефактами обновлений, подписанными minisign, после чего publish-задача объединит их в один `latest.json` для четырёх платформ.

Инструкции по подписи обновлений — в [SIGNING_GUIDE.md](./SIGNING_GUIDE.md).

### Сборка словарей

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

В комплекте идут словарные данные объёмом около 260 МБ; они находятся в `~/Library/Application Support/com.desktop-translation/`; пути к словарям настраиваются в настройках.

## Структура проекта

```
src/                    React 19 frontend (Tailwind 4)
  pages/                translate / history / vocabulary / dictionary / settings
  storage/              invoke wrappers (the only frontend→backend entry point)
  types/settings.ts     DEFAULT_SETTINGS (must stay in sync with Rust defaults)
  lib/i18n.ts           nine-language strings

src-tauri/src/
  lib.rs                Tauri Builder wiring (plugin registration)
  app/hook_core.rs        независимое от платформы сопоставление правил + действие перевода (все платформы)
  app/keyboard_hook.rs        macOS: собственный event tap ListenOnly на run loop главного потока
  app/keyboard_hook_windows.rs  Windows: низкоуровневый перехват клавиатуры, пропускающий клавиши (WH_KEYBOARD_LL)
  app/keyboard_hook_unsupported.rs  остальные платформы: заглушка с тем же API и без действий
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              сборка двух архитектур только для macOS + скрипт синхронизации с двумя хостами
                          (релизы для четырёх платформ идут через CI; скрипт отказывается
                           перезаписывать latest.json для нескольких платформ)
```

Слои: фронтенд обращается к Rust только через `invoke`; на стороне Rust `commands/` остаётся тонким слоем, а бизнес-логика живёт в `*_store.rs`; схема SQLite определяется единожды в `db::apply_schema()` и используется как при инициализации приложения, так и в тестах.

## Технологии

- **Каркас приложения**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Глобальные горячие клавиши**: собственный перехват, без сторонних библиотек — event tap `CGEventTap` (ListenOnly) macOS на run loop главного потока; в Windows — низкоуровневый перехват клавиатуры `WH_KEYBOARD_LL`, пропускающий клавиши, в приватном потоке
- **Хранилище**: SQLite через крейт `sqlite` (словари, настройки, история, словарь слов, API-ключи)
- **Речь**: Web Speech API (`speechSynthesis`)
- **Плагины Tauri**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Лицензия

MIT License с дополнительным ограничением на некоммерческое использование: любое коммерческое использование требует предварительного письменного разрешения правообладателя, restyhap.

## Ссылки

- Проектные документы: [docs/](./docs/)
- Подпись обновлений: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Вопросы и предложения: https://github.com/restyhap/desktop-02-translation/issues