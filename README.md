# freakcloud ☁️⚡

<p align="center">
  <img src="public/logo.png" alt="freakcloud logo" width="96" height="96" />
</p>

<p align="center">
  <strong>An ultra-lightweight, high-performance desktop music player for SoundCloud.</strong><br>
  Ультралегковесный десктопный плеер для SoundCloud на Rust и Tauri v2.
</p>

<p align="center">
  <a href="#-english">English</a> • <a href="#-русский">Русский</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?style=flat-square&logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-Tokio-orange?style=flat-square&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/RAM-~40MB-success?style=flat-square" alt="Lightweight RAM">
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="License">
</p>

<p align="center">
  <code>soundcloud</code> • <code>music-player</code> • <code>desktop</code> • <code>tauri</code> • <code>rust</code> • <code>react</code> • <code>typescript</code> • <code>offline-cache</code> • <code>audio-crossfade</code> • <code>taste-graph</code> • <code>discord-rpc</code> • <code>lightweight</code>
</p>

> [!TIP]
> **⚡ Quick SoundCloud Authorization / Быстрая авторизация в один клик**  
> For instant zero-friction login without manual token extraction, install our companion browser extension:  
> Для моментального и безопасного входа без ручного ввода токенов установите наше браузерное расширение:  
> 👉 **[freakcloud-extension](https://github.com/MinakowDev/freakcloud-extension)**

<p align="center">
  <img src="docs/assets/main_page.png" alt="freakcloud UI preview" width="850" />
</p>

---

<h2 id="english">🇬🇧 English</h2>

### ⚡ Ultra-Lightweight by Design

Unlike bulky Chromium/Electron-based players that consume 500MB–1GB of RAM and put unnecessary load on your CPU, **freakcloud** is built with **Tauri v2** and a native **Rust** Tokio core:

- **Minimal Memory Footprint**: Typically runs at ~30–50 MB of RAM.
- **Zero Background Bloat**: Near-zero CPU usage when idling or playing audio.
- **Instant Cold Start**: Native system webview rendering without bundling an entire browser engine.

### ✨ Features

- **Personal Wave & Continuous Stream**: Infinite intelligent music flow powered by SoundCloud Track Stations blended with a client-side **Taste Graph** (exponential time-decay, completion bonuses, skip penalties, 3.0x local likes multiplier). Automatically replenishes in smooth batches of 10 tracks before reaching the end.
- **Queue with Playback History**: Transparent queue with a dedicated **«Previously Played»** history section. 1-click instant jump to any previous song without losing queue progression.
- **Interactive Taste Graph 2.0**: Studio CAD-style 2D physics simulation of your musical identity with zoom & pan, artist avatar nodes, micro-genre clustering, node boosting/damping, mute/blacklist controls, and an interactive stats inspector.
- **6-Segment Media Library with Spring Glider**:
  - **SoundCloud Likes**: Synchronized cloud library.
  - **My Likes**: Instant offline-capable local favorited tracks.
  - **Offline Cache**: Downloaded local files for zero-latency offline playback.
  - **Albums**: Full album saves, discography views, and dedicated album modals.
  - **Artists**: Library artist cards, top spotlight artists, track count & alphabetical sorting, and a deep-dive **Artist Card Modal** with top tracks and releases.
  - **Custom Playlists**: Full-featured playlist creator and editor with **2x2 dynamic collage covers**, inline title editing, and integrated SoundCloud search to add tracks in one click.
- **High-Performance Entity Caching**: In-memory LRU/TTL cache for artist profiles, albums, and playlists to eliminate redundant network calls and enable instant page transitions.
- **Fluid & Adaptive Window Titlebar**: Custom frameless window header (`decorations: false`) with window controls (minimize, maximize, close) permanently pinned to the top-right corner, and a fluid search bar that dynamically scales from 140px to 440px.
- **Drag-to-Scroll Sliders**: Smooth drag & pull horizontal scrolling on sliders and carousel sections.
- **Spotify-like Crossfade**: Smooth logarithmic volume ramping and seamless transitions between tracks.
- **Discord Rich Presence (RPC)**: Live status showcasing your currently playing track, artist, album art, and progress directly on Discord.
- **System Tray Integration**: Background playback, tray mini-widget, and minimize-to-tray support.

### 🔑 One-Click SoundCloud Authorization

SoundCloud employs DataDome WAF protections that block direct automated logins. To effortlessly authenticate without manual token extraction, use our open-source companion browser extension:

👉 **[freakcloud Sync Extension (GitHub)](https://github.com/MinakowDev/freakcloud-extension)**

1. Install the extension in Chrome, Edge, Brave, or any Chromium browser (via *Developer mode* → *Load unpacked*).
2. Log into [soundcloud.com](https://soundcloud.com).
3. The extension automatically detects your session and transmits authorization locally to your desktop freakcloud app via `127.0.0.1:49281`.

### 🛠 Tech Stack & Architecture

- **Frontend**: React 18, TypeScript, Vite, Vanilla CSS + Tailwind tokens, Remix Icon.
- **Backend**: Tauri v2, Rust, Tokio, Reqwest, Hyper (Loopback Audio Server), Discord RPC.
- **Recommendation Engine**: Hybrid — SoundCloud Track Stations (Collaborative Filtering) + Client Taste Graph (Behavioral Heuristics with exponential time-decay).
- **Architecture**: Modular Feature-Sliced Design (`entities`, `widgets`, `shared`, `pages`) and Rust Clean Architecture (`domain`, `infrastructure`, `interfaces`, `application`).

### 🚀 Getting Started (Development & Build)

#### Prerequisites
- [Rust](https://www.rust-lang.org/) (latest stable)
- [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/) (v18+)

```bash
# Clone the repository
git clone https://github.com/MinakowDev/freakcloud.git
cd freakcloud/freakcloud

# Install frontend dependencies
bun install

# Run desktop app in development mode
bun tauri dev

# Build release executable / installer
bun tauri build
```

---

<h2 id="russian">🇷🇺 Русский</h2>

### ⚡ Ультралегковесная архитектура

В отличие от тяжелых плееров на базе Electron и прожорливых вкладок браузера, потребляющих сотни мегабайт ОЗУ, **freakcloud** построен на **Tauri v2** и скомпилированном ядре **Rust**:

- **Минимум оперативной памяти**: Потребляет всего ~30–50 МБ ОЗУ при активном воспроизведении.
- **Нулевая фоновая нагрузка**: Менее 0.1% нагрузки на процессор во время простоя или воспроизведения.
- **Мгновенный холодный старт**: Нативный системный Webview без встраивания тяжелого браузера Chromium.

### ✨ Возможности

- **Бесконечный поток и персональная волна**: Умная персональная волна рекомендаций, объединяющая SoundCloud Track Stations и клиентский **Граф Вкусов** (экспоненциальное затухание по времени, бонусы за дослушивания, штрафы за скипы, 3.0x вес локальных лайков). Поток автоматически подгружает пачки по 10 треков при приближении к концу очереди.
- **Очередь с историей прослушиваний**: Наглядная боковая панель очереди с отдельным разделом **«Ранее играли»**. Переход к любому прослушанному треку в один клик без сброса очереди и порядка воспроизведения.
- **Интерактивный Граф Вкусов 2.0**: Живая физическая 2D-симуляция ваших музыкальных предпочтений с зумом и перемещением, **аватарками артистов внутри кружков графа**, кластеризацией микрожанров, бустом/снижением влияния, чёрным списком и четким инспектором метрик.
- **6-секционная медиатека со стеклянным глайдером**:
  - **SoundCloud**: Синхронизированные облачные лайки.
  - **Мои лайки**: Мгновенные локальные лайки, доступные без интернета.
  - **Сохраненки**: Офлайн-кэш для мгновенного прослушивания без задержек сети.
  - **Альбомы**: Сохраненные релизы, просмотр трек-листа альбома и мгновенное добавление в очередь.
  - **Артисты**: Интеллектуальные карточки исполнителей, блок лидеров прослушиваний, сортировка по трекам и алфавиту, а также **Карточка артиста** с топом треков и дискографией.
  - **Плейлисты**: Полнофункциональный менеджер плейлистов с **динамическими коллажами обложек 2x2**, инлайн-редактированием названий и встроенным поиском для добавления треков из SoundCloud в один клик.
- **Быстрое кэширование сущностей**: Клиентский LRU/TTL кэш для карточек артистов, альбомов и плейлистов, исключающий повторные запросы в сеть при навигации.
- **Адаптивная шапка окна (Window Header)**: Кастомный безрамочный заголовок окна (`decorations: false`) с кнопками управления окном (свернуть, развернуть, закрыть), жестко зафиксированными в правом верхнем углу, и гибкой строкой поиска, адаптирующейся от 140px до 440px.
- **Drag & Pull прокрутка слайдеров**: Удобное перетаскивание мышью и свайпы горизонтальных каруселей треков и альбомов.
- **Студийный кроссфейд**: Плавное логарифмическое затухание и нарастание громкости между песнями без пауз и щелчков (как в Spotify).
- **Интеграция с Discord RPC**: Отображение играющего трека, исполнителя, обложки и прогресса воспроизведения в статусе Discord.
- **Интеграция с треем Windows**: Фоновое проигрывание, мини-виджет управления и сворачивание в трей в один клик.

### 🔑 Быстрая авторизация через браузер

SoundCloud использует защиту DataDome WAF, блокирующую автоматический вход через сторонние приложения. Для моментальной и безопасной синхронизации используйте наше открытое браузерное расширение:

👉 **[Расширение freakcloud Sync (GitHub)](https://github.com/MinakowDev/freakcloud-extension)**

1. Установите расширение в Chrome, Edge, Brave или Яндекс.Браузер (через «Режим разработчика» → «Загрузить распакованное»).
2. Войдите на [soundcloud.com](https://soundcloud.com) в браузере.
3. Расширение автоматически передаст токен в десктопный плеер freakcloud по локальному сокету `127.0.0.1:49281` без участия сторонних серверов.

### 🛠 Стек технологий и архитектура

- **Фронтенд**: React 18, TypeScript, Vite, Vanilla CSS + Tailwind токены, Remix Icon.
- **Бэкенд**: Tauri v2, Rust, Tokio, Reqwest, Hyper (Loopback Audio Server), Discord RPC.
- **Рекомендации**: Гибридные — SoundCloud Track Stations (коллаборативная фильтрация) + клиентский Граф вкусов (поведенческая эвристика с экспоненциальным затуханием).
- **Архитектура**: Feature-Sliced Design на фронтенде (`entities`, `widgets`, `shared`, `pages`) и Clean Architecture в ядре Rust (`domain`, `infrastructure`, `interfaces`, `application`).

### 🚀 Запуск и сборка

#### Требования
- [Rust](https://www.rust-lang.org/) (актуальная стабильная версия)
- [Bun](https://bun.sh/) или [Node.js](https://nodejs.org/) (18+)

```bash
# Клонирование репозитория
git clone https://github.com/MinakowDev/freakcloud.git
cd freakcloud/freakcloud

# Установка зависимостей фронтенда
bun install

# Запуск приложения в режиме разработки
bun tauri dev

# Сборка финального установщика (.exe / .msi)
bun tauri build
```

---

## 📄 License

MIT License. Designed with precision for pure listening pleasure.
