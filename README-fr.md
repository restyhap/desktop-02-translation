[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

Une application de traduction de bureau pour macOS qui traduit dès que vous sélectionnez du texte — appuyez sur un raccourci clavier, une fenêtre de traduction s'affiche, et consultez les mots dans un dictionnaire local de niveau GoldenDict.

Construit avec Tauri 2 (Rust) + React 19. Neuf langues d'interface, toutes les données restent sur votre machine.

## Téléchargement

| Plateforme | Architecture | Paquet |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases : https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases : https://gitee.com/restyhap/desktop-02-translation/releases

Ouvrez le dmg et faites glisser l'application hors du dossier ; remplacer une version plus ancienne fonctionne sans problème. **Toutes les données utilisateur résident hors du bundle de l'application** (`~/Library/Application Support/com.desktop-translation/`), donc la mise à jour ne touche jamais votre historique, votre vocabulaire ni vos réglages.

> Les noms des paquets indiquent le numéro de version — vérifiez les noms de fichiers réels sur la page Releases.

### Note pour la version Intel

La version Intel (x86_64) **n'inclut pas la synthèse vocale neuronale MOSS-TTS** ; la prononciation bascule sur la synthèse vocale système `speechSynthesis` de macOS. Raison : sa dépendance `ort-sys` ne dispose d'aucune bibliothèque précompilée pour x86_64-macos. La consultation du dictionnaire, la traduction, les fenêtres de sélection et l'historique se comportent de façon identique.

## Fonctionnalités

- **Traduction de la sélection** — sélectionnez n'importe quel texte, appuyez sur le raccourci, une fenêtre de traduction s'affiche ; la fenêtre principale est à un raccourci de distance
- **Dictionnaire local** — recherche de mot par correspondance exacte, avec phonétique, définitions groupées par catégorie grammaticale, phrases d'exemple et ressources de prononciation ; compilez vos propres dictionnaires `.dsl.dz` avec `dictbuild`
- **Moteurs multiples** — Google, DeepL, Baidu, Youdao, Caiyun, Alibaba et Volcengine préconfigurés ; ajoutez des moteurs personnalisés et un endpoint LLM personnalisé dans les réglages
- **Historique et vocabulaire** — chaque traduction est conservée, les favoris restent définitivement, et les entrées peuvent être ajoutées à des groupes de vocabulaire
- **Neuf langues d'interface** — English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **Résident dans la barre des menus** — fermer la fenêtre la masque dans la zone de notification ; le menu de celle-ci affiche la fenêtre ou quitte l'application
- **Lancement à la connexion** — démarrage silencieux en arrière-plan via LaunchAgent, avec un chien de garde par heartbeat pour l'auto-réparation
- **Prononciation** — synthèse vocale système avec réglages de voix, de vitesse, de hauteur et de volume
- **Conservation de l'historique** — durée de conservation configurable ; les enregistrements non favoris expirés sont purgés au démarrage et chaque fois que vous modifiez le réglage

## Raccourcis par défaut

| Raccourci | Action |
|---|---|
| `⌘ + C + C` | Traduire la sélection courante (fenêtre) |
| `⌘ + C + V` | Afficher la fenêtre principale |

Les deux peuvent être redéfinis dans les réglages. L'écoute globale des touches (rdev) s'exécute sur des threads de fond du processus principal — plus aucun processus séparé. La modification des raccourcis remplace la table de règles à chaud, sans redémarrage de l'écouteur.

> ⚠️ À la première utilisation, accordez à l'application l'autorisation dans **Réglages Système → Confidentialité et sécurité → Surveillance des entrées**, sinon les raccourcis globaux et la capture de la sélection ne fonctionneront pas. Tant que l'autorisation manque, l'application affiche un avertissement avec un accès en un clic à ce panneau. L'autorisation est liée à l'empreinte de code de l'application : elle doit être accordée à nouveau après une nouvelle version.

## Compilation depuis les sources

### Prérequis

- macOS 11+ (Apple Silicon ou Intel)
- Node.js 20+ et [pnpm](https://pnpm.io/)
- Chaîne d'outils Rust (via `rustup`) et Xcode Command Line Tools

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
# output: src-tauri/target/release/bundle/dmg/
```

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
  app/keyboard_hook.rs  global hotkeys: rdev event tap on in-process threads
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              dual-architecture build + dual-host release sync script
```

Couches : le frontend ne parle au Rust qu'à travers `invoke` ; côté Rust, `commands/` reste mince et la logique métier vit dans `*_store.rs` ; le schéma SQLite est défini une seule fois dans `db::apply_schema()` et partagé par l'initialisation en production et par les tests.

## Pile technique

- **Framework applicatif** : Tauri 2.12 (Rust) + React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Raccourcis globaux** : rdev (processus sidecar avec chien de garde par heartbeat)
- **Stockage** : SQLite via le crate `sqlite` (dictionnaires, réglages, historique, vocabulaire, clés d'API)
- **Synthèse vocale** : Web Speech API (`speechSynthesis`)
- **Plugins Tauri** : autostart (LaunchAgent), window-state, global-shortcut, single-instance, clipboard-manager, dialog

## Licence

MIT License, plus une restriction supplémentaire de non-commercialisation : tout usage commercial, sous quelque forme que ce soit, exige l'autorisation écrite préalable du détenteur du droit d'auteur, restyhap. Le texte complet figure dans [LICENSE](./LICENSE).

## Liens

- Documents de conception : [docs/](./docs/)
- Signature des mises à jour : [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- Tickets : https://github.com/restyhap/desktop-02-translation/issues
