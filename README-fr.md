[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Une application de traduction de bureau pour **macOS et Windows** qui traduit dès que vous sélectionnez du texte — appuyez sur un raccourci clavier, une fenêtre de traduction s'affiche, et consultez les mots dans un dictionnaire local de niveau GoldenDict. macOS est la cible principale ; des builds Linux sont fournis, mais ils ne prennent pas encore en charge la traduction de la sélection.

Construit avec Tauri 2 (Rust) + React 19. Neuf langues d'interface, toutes les données restent sur votre machine.

## Téléchargement

| Plateforme | Architecture | Paquet |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |
| Windows 10 / 11 | x86_64 | `DesktopTranslation_{version}_x64-setup.exe` (installateur NSIS) |
| Linux | x86_64 | `DesktopTranslation_{version}_amd64.AppImage` |

- GitHub Releases : https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases : https://gitee.com/restyhap/desktop-02-translation/releases

**macOS** — ouvrez le dmg et faites glisser l'application hors du dossier. **Windows** — exécutez le programme d'installation `.exe` ; si SmartScreen signale un éditeur inconnu, choisissez *Informations → Exécuter quand même* (voir la note ci-dessous). **Linux** — rendez l'AppImage exécutable avec `chmod +x` puis lancez-le ; il lui faut un environnement FUSE, ou démarrez-le avec `APPIMAGE_EXTRACT_AND_RUN=1`.

Remplacer une version plus ancienne fonctionne sans problème. **Toutes les données utilisateur résident hors du bundle de l'application** (`~/Library/Application Support/com.desktop-translation/` sous macOS, `%APPDATA%\com.desktop-translation\` sous Windows, `~/.local/share/com.desktop-translation/` sous Linux), donc la mise à jour ne touche jamais votre historique, votre vocabulaire ni vos réglages.

> Les noms des paquets indiquent le numéro de version — vérifiez les noms de fichiers réels sur la page Releases.

### Prise en charge des plateformes

| | macOS | Windows | Linux |
|---|---|---|---|
| Traduction de la sélection (raccourcis globaux) | ✅ | ✅ | ❌ pas encore |
| Consultation du dictionnaire local | ✅ | ✅ | ✅ |
| Moteurs, historique, vocabulaire | ✅ | ✅ | ✅ |
| Synthèse vocale neuronale (MOSS-TTS) | ✅ Apple Silicon uniquement | ❌ voix système | ❌ voix système |
| Mises à jour dans l'application | ✅ | ✅ | ✅ |
| Signature de code système | ad-hoc | aucune — invite SmartScreen | aucune |

Les raccourcis globaux fonctionnent sous Windows **sans aucune demande d'autorisation** (un crochet clavier bas niveau laisse passer chaque frappe vers les autres applications). La traduction de la sélection n'est pas implémentée sous Linux : Wayland interdit aux applications de capter les frappes globales. L'application l'indique sur la page d'accueil au lieu de ne rien faire silencieusement — tout le reste, y compris la traduction manuelle, fonctionne normalement.

> ⚠️ **Windows SmartScreen** — le programme d'installation n'est pas signé avec Authenticode, Windows peut donc signaler « Windows a protégé votre PC ». Choisissez *Informations → Exécuter quand même*. C'est une autre chose que la signature minisign du système de mise à jour, qui ne couvre que les paquets de mise à jour.

### Note sur la synthèse vocale

Le build **Intel (x86_64)** et **tous les builds non-macOS** **n'incluent pas la synthèse vocale neuronale MOSS-TTS** ; la prononciation bascule sur la synthèse vocale système `speechSynthesis`. Raison : sa dépendance `ort-sys` ne dispose d'aucune bibliothèque précompilée pour x86_64-macos, Windows ou Linux. La consultation du dictionnaire, la traduction, les fenêtres de sélection et l'historique se comportent de façon identique.

## Fonctionnalités

- **Traduction de la sélection** — sélectionnez n'importe quel texte, appuyez sur le raccourci, une fenêtre de traduction s'affiche ; la fenêtre principale est à un raccourci de distance
- **Dictionnaire local** — recherche de mot par correspondance exacte, avec phonétique, définitions groupées par catégorie grammaticale, phrases d'exemple et ressources de prononciation ; compilez vos propres dictionnaires `.dsl.dz` avec `dictbuild`
- **Moteurs multiples** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba et Volcengine préconfigurés ; ajoutez des moteurs personnalisés et un endpoint LLM personnalisé dans les réglages
- **Historique et vocabulaire** — chaque traduction est conservée, les favoris restent définitivement, et les entrées peuvent être ajoutées à des groupes de vocabulaire
- **Neuf langues d'interface** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Résident dans la barre des menus** — fermer la fenêtre la masque dans la zone de notification (barre des menus sur macOS, zone de notification ailleurs) ; le menu de celle-ci affiche la fenêtre ou quitte l'application
- **Lancement à la connexion** — démarrage silencieux en arrière-plan via LaunchAgent (macOS) / le mécanisme de démarrage automatique propre à la plateforme ailleurs, avec un chien de garde par heartbeat pour l'auto-réparation
- **Prononciation** — synthèse vocale système avec réglages de voix, de vitesse, de hauteur et de volume
- **Conservation de l'historique** — durée de conservation configurable ; les enregistrements non favoris expirés sont purgés au démarrage et chaque fois que vous modifiez le réglage

## Raccourcis par défaut

| Plateforme | Raccourci | Action |
|---|---|---|
| macOS | `⌘ + C + C` | Traduire la sélection courante (fenêtre) |
| macOS | `⌘ + C + V` | Afficher la fenêtre principale |
| Windows | `Ctrl + C + C` | Traduire la sélection courante (fenêtre) |
| Windows | `Ctrl + C + V` | Afficher la fenêtre principale |

Les deux peuvent être redéfinis dans les réglages. L'écoute globale des touches repose sur un crochet maison — aucun processus séparé, aucune bibliothèque tierce : un event tap ListenOnly sur la run loop du thread principal pour macOS, un crochet clavier bas niveau pass-through (`WH_KEYBOARD_LL`) sur un thread dédié pour Windows. La modification des raccourcis remplace la table de règles à chaud, sans reconstruire le crochet.

> ⚠️ **macOS** — à la première utilisation, accordez à l'application l'autorisation dans **Réglages Système → Confidentialité et sécurité → Surveillance des entrées**, sinon les raccourcis globaux et la capture de la sélection ne fonctionneront pas. Tant que l'autorisation manque, la **page d'accueil** affiche un bandeau d'avertissement avec deux actions : « Ouvrir Surveillance des entrées » et « Aller aux réglages ». L'autorisation est liée à l'empreinte de code de l'application : elle doit être accordée à nouveau après l'installation d'un nouveau build. Si une entrée existe déjà, macOS n'affiche aucune demande — **désactivez puis réactivez l'interrupteur** pour la renouveler.
>
> **Windows** — rien à accorder ; le crochet ne nécessite aucune permission particulière.
>
> **Linux** — la traduction de la sélection est indisponible, et la page d'accueil l'indique au lieu de rester silencieuse. Tout le reste fonctionne.

## Compilation depuis les sources

### Prérequis

- macOS 11+ (Apple Silicon ou Intel) — la cible principale
- Windows 10/11 avec les outils de build MSVC, ou Linux avec `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libdbus-1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libfuse2`
- Node.js 20+ et [pnpm](https://pnpm.io/)
- Chaîne d'outils Rust (via `rustup`) et Xcode Command Line Tools (macOS uniquement)

> La compilation croisée native n'est pas possible ici (Windows exige MSVC, Linux exige WebKitGTK/libdbus). Les builds Windows et Linux s'exécutent sur les runners natifs de ces plateformes — voir `.github/workflows/ci.yml` et `.github/workflows/release.yml`.

### Étapes

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (also builds the dictbuild sidecar)
```

### Contrôles qualité

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Tout ce qui touche à la version Intel doit être vérifié sur les deux cibles :

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### Compiler le programme d'installation

```bash
pnpm tauri build
# macOS:   src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux:   src-tauri/target/release/bundle/appimage/
```

Les releases pour les quatre clés de plateforme sont produites par la CI (`.github/workflows/release.yml`) : poussez une balise `v*` annotée et la matrice de build produit dmg + NSIS + AppImage ainsi que les artefacts de mise à jour signés en minisign ; le job publish les fusionne ensuite en un unique `latest.json` pour les quatre plateformes.

Voir [SIGNING_GUIDE.md](./SIGNING_GUIDE.md) pour la signature des mises à jour.

### Compilation des dictionnaires

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

Les données de dictionnaire incluses pèsent environ 260 Mo et se trouvent dans `~/Library/Application Support/com.desktop-translation/` ; les chemins des dictionnaires sont configurables dans les réglages.

## Organisation du projet

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

Couches : le frontend ne parle au Rust qu'à travers `invoke` ; côté Rust, `commands/` reste mince et la logique métier vit dans `*_store.rs` ; le schéma SQLite est défini une seule fois dans `db::apply_schema()` et partagé par l'initialisation en production et par les tests.

## Pile technique

- **Framework applicatif** : Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Raccourcis globaux** : crochet maison, sans bibliothèque tierce — event tap ListenOnly `CGEventTap` sur la run loop du thread principal pour macOS ; crochet clavier bas niveau `WH_KEYBOARD_LL` pass-through sur un thread dédié pour Windows
- **Stockage** : SQLite via le crate `sqlite` (dictionnaires, réglages, historique, vocabulaire, clés d'API)
- **Synthèse vocale** : Web Speech API (`speechSynthesis`)
- **Plugins Tauri** : autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Licence

MIT License, plus une restriction supplémentaire de non-commercialisation : tout usage commercial, sous quelque forme que ce soit, exige l'autorisation écrite préalable du détenteur du droit d'auteur, restyhap. Le texte complet figure dans [LICENSE](./LICENSE).

## Liens

- Documents de conception : [docs/](./docs/)
- Signature des mises à jour : [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Tickets : https://github.com/restyhap/desktop-02-translation/issues
