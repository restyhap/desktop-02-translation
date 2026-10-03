[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Una aplicación de traducción de escritorio para macOS que traduce en el momento en que seleccionas texto: pulsa un atajo de teclado, aparece una ventana de traducción y consulta palabras en un diccionario local de nivel GoldenDict.

Creada con Tauri 2 (Rust) + React 19. Nueve idiomas de interfaz, todos los datos permanecen en tu equipo.

## Descargas

| Plataforma | Arquitectura | Paquete |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

Abre el dmg y arrastra la aplicación fuera; reemplazar una versión anterior funciona sin problemas. **Todos los datos de usuario están fuera del bundle de la aplicación** (`~/Library/Application Support/com.desktop-translation/`), por lo que actualizar nunca toca tu historial, tu vocabulario ni tus ajustes.

> Los nombres de los paquetes incluyen el número de versión: comprueba los nombres de archivo reales en la página de Releases.

### Nota para la versión Intel

La versión Intel (x86_64) **no incluye la síntesis de voz neuronal MOSS-TTS**; la pronunciación recurre a la síntesis de voz del sistema `speechSynthesis` de macOS. Motivo: su dependencia `ort-sys` no dispone de biblioteca precompilada para x86_64-macos. La consulta del diccionario, la traducción, las ventanas de selección y el historial se comportan de forma idéntica.

## Características

- **Traducción de la selección** — selecciona cualquier texto, pulsa el atajo y aparece una ventana de traducción; la ventana principal está a un atajo de distancia
- **Diccionario local** — búsqueda de palabras por coincidencia exacta, con fonética, definiciones agrupadas por categoría gramatical, frases de ejemplo y recursos de pronunciación; compila tus propios diccionarios `.dsl.dz` con `dictbuild`
- **Motores múltiples** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba y Volcengine preconfigurados; añade motores personalizados y un endpoint de LLM personalizado en los ajustes
- **Historial y vocabulario** — cada traducción queda guardada, los favoritos se conservan para siempre y las entradas pueden enviarse a grupos de vocabulario
- **Nueve idiomas de interfaz** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Residente en la barra de menús** — cerrar la ventana la oculta en el área de notificación; el menú de esta muestra la ventana o sale de la aplicación
- **Inicio al iniciar sesión** — arranque silencioso en segundo plano mediante LaunchAgent, con un vigilante por heartbeat de autocuración
- **Pronunciación** — síntesis de voz del sistema con ajustes de voz, velocidad, tono y volumen
- **Retención del historial** — periodo de retención configurable; los registros no favoritos caducados se purgan al arrancar y cada vez que cambias el ajuste

## Atajos predeterminados

| Atajo | Acción |
|---|---|
| `⌘ + C + C` | Traducir la selección actual (ventana emergente) |
| `⌘ + C + V` | Mostrar la ventana principal |

Ambos pueden reconfigurarse en los ajustes. La escucha global de teclas usa un event tap de macOS conectado al run loop del hilo principal: sin proceso auxiliar ni biblioteca de terceros. Los cambios de atajos sustituyen la tabla de reglas en caliente, sin reconstruir el tap.

> ⚠️ En el primer uso, concede a la aplicación permiso en **Ajustes del Sistema → Privacidad y seguridad → Monitorización de entrada**; de lo contrario, los atajos globales y la captura de la selección no responderán. Mientras falte el permiso, la **página de inicio** muestra un aviso con dos acciones: «Abrir Monitorización de entrada» y «Ir a Ajustes». El permiso está vinculado al hash de código de la aplicación, por lo que debe concederse de nuevo tras instalar una versión nueva. Si ya existe una entrada, macOS no muestra ninguna solicitud: **apaga y vuelve a encender el interruptor** para renovarla.

## Compilar desde el código fuente

### Requisitos

- macOS 11+ (Apple Silicon o Intel)
- Node.js 20+ y [pnpm](https://pnpm.io/)
- Cadena de herramientas de Rust (vía `rustup`) y Xcode Command Line Tools

### Pasos

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (also builds the dictbuild sidecar)
```

### Controles de calidad

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Todo lo que afecte a la versión Intel debe comprobarse en ambas arquitecturas:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### Compilar el instalador

```bash
pnpm tauri build
# output: src-tauri/target/release/bundle/dmg/
```

Consulta [SIGNING_GUIDE.md](./SIGNING_GUIDE.md) para la firma de las actualizaciones.

### Compilar los diccionarios

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

Los datos de diccionario incluidos ocupan unos 260 MB y están en `~/Library/Application Support/com.desktop-translation/`; las rutas de los diccionarios se configuran en los ajustes.

## Estructura del proyecto

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

Capas: el frontend solo se comunica con Rust mediante `invoke`; en Rust, `commands/` se mantiene delgado y la lógica de negocio vive en `*_store.rs`; el esquema SQLite se define una sola vez en `db::apply_schema()` y lo comparten la inicialización en producción y las pruebas.

## Stack tecnológico

- **Framework de la aplicación**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Atajos globales**: event tap de macOS propio (ListenOnly), conectado al run loop del hilo principal
- **Almacenamiento**: SQLite mediante el crate `sqlite` (diccionarios, ajustes, historial, vocabulario, claves de API)
- **Voz**: Web Speech API (`speechSynthesis`)
- **Plugins de Tauri**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Licencia

MIT License, más una restricción adicional de no comercialización: cualquier uso comercial de cualquier tipo requiere el permiso previo por escrito del titular de los derechos de autor, restyhap. El texto completo está en [LICENSE](./LICENSE).

## Enlaces

- Documentos de diseño: [docs/](./docs/)
- Firma de las actualizaciones: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Incidencias: https://github.com/restyhap/desktop-02-translation/issues
