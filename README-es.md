[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Una aplicación de traducción de escritorio para **macOS y Windows** que traduce en el momento en que seleccionas texto: pulsa un atajo de teclado, aparece una ventana de traducción y consulta palabras en un diccionario local de nivel GoldenDict. macOS es la plataforma principal; las compilaciones para Linux están disponibles, pero todavía no admiten la traducción por selección.

Creada con Tauri 2 (Rust) + React 19. Nueve idiomas de interfaz, todos los datos permanecen en tu equipo.

## Descargas

| Plataforma | Arquitectura | Paquete |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |
| Windows 10 / 11 | x86_64 | `DesktopTranslation_{version}_x64-setup.exe` (instalador NSIS) |
| Linux | x86_64 | `DesktopTranslation_{version}_amd64.AppImage` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

**macOS** — abre el dmg y arrastra la aplicación fuera. **Windows** — ejecuta el instalador `.exe`; si SmartScreen avisa de que el editor es desconocido, elige *Más información → Ejecutar de todas formas* (véase la nota de abajo). **Linux** — aplica `chmod +x` al AppImage y ejecútalo; necesita un runtime de FUSE, o arráncalo con `APPIMAGE_EXTRACT_AND_RUN=1`.

Reemplazar una versión anterior funciona sin problemas. **Todos los datos de usuario están fuera del bundle de la aplicación** (`~/Library/Application Support/com.desktop-translation/` en macOS, `%APPDATA%\com.desktop-translation\` en Windows, `~/.local/share/com.desktop-translation/` en Linux), por lo que actualizar nunca toca tu historial, tu vocabulario ni tus ajustes.

> Los nombres de los paquetes incluyen el número de versión: comprueba los nombres de archivo reales en la página de Releases.

### Soporte de plataformas

| | macOS | Windows | Linux |
|---|---|---|---|
| Traducción por selección (atajo global) | ✅ | ✅ | ❌ todavía no |
| Consulta en el diccionario local | ✅ | ✅ | ✅ |
| Motores, historial, vocabulario | ✅ | ✅ | ✅ |
| Voz neuronal (MOSS-TTS) | ✅ solo Apple Silicon | ❌ voz del sistema | ❌ voz del sistema |
| Actualizaciones dentro de la app | ✅ | ✅ | ✅ |
| Firma de código del sistema | ad-hoc | ninguna: aviso de SmartScreen | ninguna |

En Windows los atajos globales funcionan **sin pedir ningún permiso** (usa un gancho de teclado de bajo nivel que deja pasar todas las teclas hacia las demás aplicaciones). La traducción por selección en Linux no está implementada: Wayland prohíbe que las aplicaciones capturen pulsaciones globales. La aplicación lo indica en la página de inicio en lugar de quedarse sin hacer nada en silencio; todo lo demás, incluida la traducción manual, funciona con normalidad.

> ⚠️ **Windows SmartScreen** — el instalador no está firmado con Authenticode, así que Windows puede mostrar «Windows ha protegido tu PC». Elige *Más información → Ejecutar de todas formas*. Es una cosa distinta de la firma minisign del actualizador, que solo cubre los paquetes de actualización.

### Nota sobre la síntesis de voz

Las compilaciones **Intel (x86_64)** y **todas las que no son de macOS** **no incluyen la síntesis de voz neuronal MOSS-TTS**; la pronunciación recurre a la síntesis de voz del sistema `speechSynthesis`. Motivo: su dependencia `ort-sys` no dispone de biblioteca precompilada para x86_64-macos, Windows ni Linux. La consulta del diccionario, la traducción, las ventanas de selección y el historial se comportan de forma idéntica.

## Características

- **Traducción de la selección** — selecciona cualquier texto, pulsa el atajo y aparece una ventana de traducción; la ventana principal está a un atajo de distancia
- **Diccionario local** — búsqueda de palabras por coincidencia exacta, con fonética, definiciones agrupadas por categoría gramatical, frases de ejemplo y recursos de pronunciación; compila tus propios diccionarios `.dsl.dz` con `dictbuild`
- **Motores múltiples** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba y Volcengine preconfigurados; añade motores personalizados y un endpoint de LLM personalizado en los ajustes
- **Historial y vocabulario** — cada traducción queda guardada, los favoritos se conservan para siempre y las entradas pueden enviarse a grupos de vocabulario
- **Nueve idiomas de interfaz** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Residente en la barra de menús** — cerrar la ventana la oculta en el área de notificación (barra de menús en macOS, área de notificación en el resto de plataformas); el menú de esta muestra la ventana o sale de la aplicación
- **Inicio al iniciar sesión** — arranque silencioso en segundo plano opcional mediante LaunchAgent (macOS) o el mecanismo de autoinicio propio de cada plataforma en el resto, con un vigilante por heartbeat de autocuración
- **Pronunciación** — síntesis de voz del sistema con ajustes de voz, velocidad, tono y volumen
- **Retención del historial** — periodo de retención configurable; los registros no favoritos caducados se purgan al arrancar y cada vez que cambias el ajuste

## Atajos predeterminados

| Plataforma | Atajo | Acción |
|---|---|---|
| macOS | `⌘ + C + C` | Traducir la selección actual (ventana emergente) |
| macOS | `⌘ + C + V` | Mostrar la ventana principal |
| Windows | `Ctrl + C + C` | Traducir la selección actual (ventana emergente) |
| Windows | `Ctrl + C + V` | Mostrar la ventana principal |

Ambos pueden reconfigurarse en los ajustes. La escucha global de teclas es un gancho propio, sin proceso auxiliar ni biblioteca de escucha de terceros: en macOS, un event tap ListenOnly conectado al run loop del hilo principal; en Windows, un gancho de teclado de bajo nivel que deja pasar todas las teclas (`WH_KEYBOARD_LL`). Los cambios de atajos sustituyen la tabla de reglas en caliente, sin reconstruir el gancho.

> ⚠️ **macOS** — en el primer uso, concede a la aplicación permiso en **Ajustes del Sistema → Privacidad y seguridad → Monitorización de entrada**; de lo contrario, los atajos globales y la captura de la selección no responderán. Mientras falte el permiso, la **página de inicio** muestra un aviso con dos acciones: «Abrir Monitorización de entrada» y «Ir a Ajustes». El permiso está vinculado al hash de código de la aplicación, por lo que debe concederse de nuevo tras instalar una versión nueva. Si ya existe una entrada, macOS no muestra ninguna solicitud: **apaga y vuelve a encender el interruptor** para renovarla.
>
> **Windows** — no hay que conceder nada; el gancho no necesita ningún permiso especial.
>
> **Linux** — la traducción por selección no está disponible y la página de inicio lo indica en lugar de fallar en silencio. Todo lo demás funciona con normalidad.

## Compilar desde el código fuente

### Requisitos

- macOS 11+ (Apple Silicon o Intel) — la plataforma principal
- Windows 10/11 con las herramientas de compilación de MSVC, o Linux con `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libfuse2`
- Node.js 20+ y [pnpm](https://pnpm.io/)
- Cadena de herramientas de Rust (vía `rustup`) y Xcode Command Line Tools (solo macOS)

> Aquí **no es posible la compilación cruzada nativa** (Windows necesita MSVC, Linux necesita WebKitGTK/libdbus). Las compilaciones para Windows y Linux se ejecutan en los runners de esas plataformas; consulta `.github/workflows/ci.yml` y `.github/workflows/release.yml`.

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
# macOS:   src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux:   src-tauri/target/release/bundle/appimage/
```

Las publicaciones para las cuatro claves de plataforma las produce la CI (`.github/workflows/release.yml`): sube un tag anotado `v*` y la matriz de compilación genera el dmg + NSIS + AppImage, además de los artefactos del actualizador firmados con minisign; después, el job de publicación los fusiona en un único `latest.json` para las cuatro plataformas.

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

Capas: el frontend solo se comunica con Rust mediante `invoke`; en Rust, `commands/` se mantiene delgado y la lógica de negocio vive en `*_store.rs`; el esquema SQLite se define una sola vez en `db::apply_schema()` y lo comparten la inicialización en producción y las pruebas.

## Stack tecnológico

- **Framework de la aplicación**: Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Atajos globales**: propio, sin biblioteca de escucha de terceros: en macOS, `CGEventTap` ListenOnly en el run loop del hilo principal; en Windows, un gancho de teclado de bajo nivel que deja pasar todas las teclas (`WH_KEYBOARD_LL`) en un hilo privado
- **Almacenamiento**: SQLite mediante el crate `sqlite` (diccionarios, ajustes, historial, vocabulario, claves de API)
- **Voz**: Web Speech API (`speechSynthesis`)
- **Plugins de Tauri**: autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Licencia

MIT License, más una restricción adicional de no comercialización: cualquier uso comercial de cualquier tipo requiere el permiso previo por escrito del titular de los derechos de autor, restyhap. El texto completo está en [LICENSE](./LICENSE).

## Enlaces

- Documentos de diseño: [docs/](./docs/)
- Firma de las actualizaciones: [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Incidencias: https://github.com/restyhap/desktop-02-translation/issues
