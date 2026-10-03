[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Приложение для перевода на компьютере с macOS: перевод происходит в момент выделения текста — нажмите горячую клавишу, получите всплывающее окно с переводом и ищите слова в локальном словаре уровня GoldenDict.

Собрано на Tauri 2 (Rust) + React 19. Девять языков интерфейса, все данные остаются на вашем компьютере.

## Загрузка

| Платформа | Архитектура | Файл |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

Откройте dmg и перетащите приложение наружу; замена старой версии проходит без проблем. **Все пользовательские данные хранятся вне пакета приложения** (`~/Library/Application Support/com.desktop-translation/`), поэтому при обновлении не затрагиваются ни ваша история, ни словарь, ни настройки.

> Имена файлов содержат номер версии — проверяйте фактические имена файлов на странице Releases.

### Примечание о сборке Intel

Сборка Intel (x86_64) **не включает нейросетевой синтез речи MOSS-TTS**; озвучивание выполняется через системный `speechSynthesis` в macOS. Причина: у зависимости `ort-sys` нет готовой скомпилированной библиотеки для x86_64-macos. Поиск по словарю, перевод, всплывающие окна по выделению и история работают абсолютно так же.

## Возможности

- **Перевод по выделению** — выделите любой текст, нажмите горячую клавишу и получите всплывающее окно с переводом; главное окно открывается одной горячей клавишей
- **Локальный словарь** — точный поиск слов с транскрипцией, определениями, сгруппированными по частям речи, примерами и ресурсами для озвучивания; собирайте собственные словари `.dsl.dz` с помощью `dictbuild`
- **Несколько движков** — предустановлены Google, DeepL, Baidu, Youdao, Caiyun, Alibaba и Volcengine; добавляйте собственные движки и собственный LLM-эндпоинт в настройках
- **История и словарь** — каждое переведённое высказывание сохраняется, избранное хранится вечно, а записи можно отправлять в группы словаря
- **Девять языков интерфейса** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Живёт в строке меню** — закрытие окна сворачивает его в трей; меню трея позволяет показать окно или выйти
- **Запуск при входе в систему** — необязательный тихий фоновый запуск через LaunchAgent со сторожевым механизмом на основе heartbeat для самовосстановления
- **Озвучивание** — системный синтез речи с настройками голоса, скорости, высоты тона и громкости
- **Срок хранения истории** — настраиваемый период хранения; просроченные записи, кроме избранных, удаляются при запуске и при каждом изменении этой настройки

## Горячие клавиши по умолчанию

| Горячие клавиши | Действие |
|---|---|
| `⌘ + C + C` | Перевести текущее выделение (всплывающее окно) |
| `⌘ + C + V` | Показать главное окно |

Обе комбинации можно переназначить в настройках. Глобальный перехват клавиш (rdev) выполняется в фоновых потоках внутри основного процесса — отдельного вспомогательного процесса больше нет. Изменение горячих клавиш подменяет таблицу правил на лету, без перезапуска перехватчика.

> ⚠️ При первом использовании выдайте приложению разрешение в разделе **System Settings → Privacy & Security → Input Monitoring** (Контроль клавиатуры и ввода), иначе глобальные горячие клавиши и перевод по выделению не будут работать. Пока разрешение не выдано, приложение показывает предупреждение со ссылкой в один клик на эту панель. Разрешение привязано к хешу кода приложения, поэтому после установки новой версии его нужно выдать заново.

## Сборка из исходного кода

### Требования

- macOS 11+ (Apple Silicon или Intel)
- Node.js 20+ и [pnpm](https://pnpm.io/)
- Rust toolchain (через `rustup`) и Xcode Command Line Tools

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
# output: src-tauri/target/release/bundle/dmg/
```

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
  app/keyboard_hook.rs  global hotkeys: rdev event tap on in-process threads
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              dual-architecture build + dual-host release sync script
```

Слои: фронтенд обращается к Rust только через `invoke`; на стороне Rust `commands/` остаётся тонким слоем, а бизнес-логика живёт в `*_store.rs`; схема SQLite определяется единожды в `db::apply_schema()` и используется как при инициализации приложения, так и в тестах.

## Технологии

- **Каркас приложения**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Глобальные горячие клавиши**: rdev (отдельный процесс со сторожевым механизмом heartbeat)
- **Хранилище**: SQLite через крейт `sqlite` (словари, настройки, история, словарь слов, API-ключи)
- **Речь**: Web Speech API (`speechSynthesis`)
- **Плагины Tauri**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Лицензия

MIT License с дополнительным ограничением на некоммерческое использование: любое коммерческое использование требует предварительного письменного разрешения правообладателя, restyhap.

## Ссылки

- Проектные документы: [docs/](./docs/)
- Подпись обновлений: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Вопросы и предложения: https://github.com/restyhap/desktop-02-translation/issues