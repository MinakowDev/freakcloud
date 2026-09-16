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
> For instant zero-friction login, install our companion browser extension:  
> Для моментального и безопасного входа без ручного ввода токенов установите наше браузерное расширение:  
> 👉 **[freakcloud-extension](https://github.com/MinakowDev/freakcloud-extension)**

---

<h2 id="english">🇬🇧 English</h2>

### ⚡ Ultra-Lightweight by Design

Unlike bulky Chromium/Electron-based players that consume 500MB–1GB of RAM and put unnecessary load on your CPU, **freakcloud** is built with **Tauri v2** and a native **Rust** Tokio core:

- **Minimal Memory Footprint**: Typically runs at ~30–50 MB of RAM.
- **Zero Background Bloat**: Near-zero CPU usage when idling or playing audio.
- **Instant Cold Start**: Native system webview rendering without bundling an entire browser.

### ✨ Features

- **Personal Wave & Infinite Flow**: Continuous music stream powered by SoundCloud Track Stations blended with a client-side **Taste Graph** (exponential time-decay, completion bonuses, skip penalties, 3.0x local likes multiplier).
- **Interactive Taste Graph**: Studio CAD-style 2D physics simulation of your musical identity with zoom & pan, micro-genre clustering, node boosting/damping, mute/blacklist controls, and a compact preview of tracks listened to per taste node.
- **Smart Offline Cache**: Local audio caching with an embedded loopback audio server for instant zero-latency playback.
- **4-Segment Media Library**: Clean separation between SoundCloud likes, internal Freakcloud likes (instant, offline-capable), Saved offline tracks, and custom playlists with a glass spring glider.
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
- **Recommendation Engine**: Hybrid — SoundCloud Track Stations (Collaborative Filtering) + Client Taste Graph (Behavioral Heuristics).
- **Architecture**: Modular Feature-Sliced Design (`entities`, `widgets`, `shared`) and Rust Clean Architecture (`domain`, `infrastructure`, `interfaces`).

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

- **Бесконечный поток (SoundCloud Stations)**: Умная персональная волна рекомендаций, основанная на реальных паттернах прослушиваний слушателей SoundCloud и локальных лайках.
- **Интерактивный Граф Вкусов (Taste Graph)**: Живая физическая 2D-симуляция ваших музыкальных предпочтений с зумом и перемещением, кластеризацией микрожанров, бустом/снижением влияния, чёрным списком и просмотром до 3 прослушанных треков по каждой вершине.
- **4-секционная медиатека**: Чёткое разделение между лайками с SoundCloud, локальными лайками Freakcloud (мгновенные, работают офлайн), оффлайн-сохранёнками и плейлистами с плавным стеклянным слайдером.
- **Локальный оффлайн-кэш**: Скачивание треков на диск со встроенным локальным loopback-сервером на Hyper для мгновенного прослушивания без задержек.
- **Студийный кроссфейд**: Плавное логарифмическое затухание и нарастание громкости между песнями без пауз и щелчков (как в Spotify).
- **Интеграция с Discord RPC**: Отображение играющего трека, исполнителя, обложки и статуса воспроизведения в профиле Discord.
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
- **Архитектура**: Feature-Sliced Design на фронтенде и Clean Architecture в ядре Rust (`domain`, `infrastructure`, `interfaces`).

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

# Сборка финального установщика (.exe / msi)
bun tauri build
```

---

## 📄 License

MIT License. Designed with precision for pure listening pleasure.
