# freackcloud

<p align="center">
  <img src="public/logo.png" alt="freackcloud logo" width="96" height="96" />
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
  <code>soundcloud</code> • <code>music-player</code> • <code>desktop</code> • <code>tauri</code> • <code>rust</code> • <code>react</code> • <code>typescript</code> • <code>offline-cache</code> • <code>audio-crossfade</code> • <code>taste-graph</code> • <code>lightweight</code>
</p>

---

<h2 id="english">🇬🇧 English</h2>

### ⚡ Ultra-Lightweight by Design
Unlike bulky Chromium/Electron-based players that consume 500MB–1GB of RAM and put unnecessary load on your CPU, **freackcloud** is built with **Tauri v2** and a native **Rust** Tokio core:

- **Minimal Memory Footprint**: Typically runs at ~30–50 MB of RAM.
- **Zero Background Bloat**: Near-zero CPU usage when idling or playing audio.
- **Instant Cold Start**: Native system webview rendering without bundling a whole browser.

### ✨ Features
- **Personal Wave & Infinite Flow**: Continuous music stream powered by SoundCloud Track Stations blended with a client-side **Taste Graph** (exponential time-decay, completion bonuses, skip penalties).
- **Smart Offline Cache**: Local audio caching with an embedded loopback audio server for instant zero-latency playback.
- **Spotify-like Crossfade**: Smooth volume ramping and seamless transitions between tracks.
- **SoundCloud Sync**: Embedded OAuth authorization, synchronization of your liked tracks and personal profile.
- **System Tray Integration**: Background playback, tray context menu, and minimize-to-tray support.

### 🛠 Tech Stack & Architecture
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Remix Icon.
- **Backend**: Tauri v2, Rust, Tokio, Reqwest, Hyper (Loopback Audio Server).
- **Recommendation Engine**: Hybrid — SoundCloud Track Stations (Collaborative Filtering) + Client Taste Graph (Behavioral Heuristics).
- **Architecture**: Modular Feature-Sliced Design (`entities`, `widgets`, `shared`) and Rust Clean Architecture (`domain`, `infrastructure`, `interfaces`).

---

<h2 id="russian">🇷🇺 Русский</h2>

### ⚡ Ультралегковесная архитектура
В отличие от тяжелых плееров на базе Electron и прожорливых вкладок браузера, потребляющих сотни мегабайт ОЗУ, **freackcloud** построен на **Tauri v2** и скомпилированном ядре **Rust**:

- **Минимум оперативной памяти**: Потребляет всего ~30–50 МБ ОЗУ при активном воспроизведении.
- **Нулевая фоновая нагрузка**: Менее 0.1% нагрузки на процессор во время простоя или воспроизведения.
- **Мгновенный холодный старт**: Нативный системный Webview без встраивания тяжелого браузера Chromium.

### ✨ Возможности
- **Бесконечный поток (SoundCloud Stations)**: Умная волна рекомендаций, основанная на реальных паттернах прослушиваний слушателей SoundCloud.
- **Обучаемый Граф Вкусов (Taste Graph)**: Локальная модель с экспоненциальным затуханием — запоминает дослушивания и лайки, отсекая треки со скипами.
- **Локальный оффлайн-кэш**: Скачивание треков на диск со встроенным локальным loopback-сервером на Hyper для мгновенного прослушивания без интернета.
- **Студийный кроссфейд**: Плавное логарифмическое затухание и нарастание громкости между песнями без пауз и щелчков (как в Spotify).
- **Интеграция с треем Windows**: Фоновое проигрывание, удобное меню трея и сворачивание в один клик.

### 🛠 Стек технологий и архитектура
- **Фронтенд**: React 18, TypeScript, Vite, Tailwind CSS, Remix Icon.
- **Бэкенд**: Tauri v2, Rust, Tokio, Reqwest, Hyper (Loopback Audio Server).
- **Рекомендации**: Гибридные — SoundCloud Track Stations (коллаборативная фильтрация) + клиентский Граф вкусов (поведенческая эвристика).
- **Архитектура**: Feature-Sliced Design на фронтенде и Clean Architecture в ядре Rust (`domain`, `infrastructure`, `interfaces`).

---

## 📄 License

MIT License. Designed with precision for pure listening pleasure.
