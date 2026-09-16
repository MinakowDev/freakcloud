# freakcloud ☁️⚡

<p align="center">
  <img src="public/logo.png" alt="freakcloud logo" width="96" height="96" />
</p>

<p align="center">
  <strong>The ultra-lightweight, high-performance desktop music player for SoundCloud.</strong><br>
  Быстрый и невесомый десктопный плеер для SoundCloud на Rust и Tauri v2.
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
> **⚡ Quick 1-Click Authorization / Авторизация в один клик**  
> Connect your SoundCloud account instantly without manual token copying using our companion browser extension:  
> Мгновенный вход в свой аккаунт SoundCloud без ручного ввода токенов через наше браузерное расширение:  
> 👉 **[freakcloud-extension](https://github.com/MinakowDev/freakcloud-extension)**

<p align="center">
  <img src="docs/assets/main_page.png" alt="freakcloud UI preview" width="850" />
</p>

---

<h2 id="english">🇬🇧 English</h2>

### ⚡ Why freakcloud?

SoundCloud in a browser tab or Electron wrapper burns **500 MB – 1.5 GB of RAM**, lags background games, and drains battery life. 

**freakcloud** re-engineers the experience with **Rust** and **Tauri v2**:
- **Consumes ~40 MB RAM** — up to 20x lighter than web tabs or Electron apps.
- **Near-zero CPU usage** — runs silently in the background without affecting your FPS or workflow.
- **Instant cold start** — launches in milliseconds using your system's native webview.

---

### ✨ Key Features

- **🌊 Intelligent Infinite Stream**: Powered by SoundCloud Stations and tuned to your habits. The more you listen, the better the mix. Automatically queues upcoming tracks so the music never stops.
- **💾 Offline Playback**: Cache favorite tracks directly to disk. Enjoy instant playback with zero buffering, even when your internet goes down.
- **🔁 Queue with History**: Jump straight back to songs you listened to earlier with a single click, without breaking your current queue.
- **📁 Playlists & Unified Library**: Create and edit custom playlists with instant SoundCloud track search, dynamic cover collages, and organized views for your likes, albums, and artists.
- **🌐 Interactive Taste Graph**: Real-time 2D visualization of your music taste. Explore how your favorite artists and genres connect, boost or mute influences, and see your listening stats.
- **🎧 Studio-Grade Crossfade**: Seamless transitions between tracks with smooth logarithmic volume ramping — no sudden silence or harsh cuts.
- **🎮 Discord Rich Presence**: Show off what you are playing in Discord with live track titles, artist names, album art, and elapsed time.
- **📌 System Tray Mini-Control**: Tuck freakcloud into your taskbar tray. Control playback anytime without keeping the main window open.

---

### 🔑 1-Click SoundCloud Authorization

SoundCloud uses DataDome WAF protections that block automated desktop logins. To sign in effortlessly:

👉 **[freakcloud Sync Extension (GitHub)](https://github.com/MinakowDev/freakcloud-extension)**

1. Install the extension in any Chromium browser (Chrome, Edge, Brave).
2. Log into [soundcloud.com](https://soundcloud.com).
3. The extension securely transfers your session directly to the desktop app via `127.0.0.1:49281`.

---

### 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Vanilla CSS tokens, Remix Icon.
- **Backend**: Tauri v2, Rust, Tokio, Reqwest, Hyper (Loopback Audio Server), Discord RPC.
- **Architecture**: Modular Feature-Sliced Design (`entities`, `widgets`, `shared`, `pages`) + Clean Architecture in Rust.

---

### 🚀 Getting Started

#### Prerequisites
- [Rust](https://www.rust-lang.org/) (latest stable)
- [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/) (v18+)

```bash
# Clone the repository
git clone https://github.com/MinakowDev/freakcloud.git
cd freakcloud/freakcloud

# Install frontend dependencies
bun install

# Run in development mode
bun tauri dev

# Build production executable (.exe / .msi)
bun tauri build
```

---

<h2 id="russian">🇷🇺 Русский</h2>

### ⚡ Почему freakcloud?

SoundCloud во вкладке браузера или Electron-обертке отъедает **от 500 МБ до 1.5 ГБ оперативной памяти**, нагружает систему в играх и тратит заряд батареи.

**freakcloud** создан на **Rust** и **Tauri v2** для максимальной скорости и легкости:
- **Потребляет всего ~40 МБ ОЗУ** — в 15–20 раз легче браузера или Electron.
- **Нулевая фоновая нагрузка** — музыка играет в фоне, не просаживая FPS в играх и не замедляя работу.
- **Мгновенный старт** — плеер открывается за доли секунды благодаря нативному системному Webview.

---

### ✨ Главные возможности

- **🌊 Умный бесконечный поток**: Персональная волна на основе станций SoundCloud, адаптированная под ваши вкусы. Музыка играет непрерывно и заранее подгружает свежие треки.
- **💾 Офлайн-кэш**: Скачивайте любимые треки на локальный диск. Музыка играет мгновенно без сетевых буферизаций и доступна даже без интернета.
- **🔁 Очередь с историей**: Удобный возврат к любой прослушанной песне в один клик без сброса текущего плейлиста.
- **📁 Свои плейлисты и медиатека**: Создавайте собственные плейлисты с динамическими обложками, добавляйте треки через быстрый поиск по SoundCloud, управляйте лайками, альбомами и артистами в единой библиотеке.
- **🌐 Интерактивный Граф вкусов**: Наглядная 2D-визуализация ваших музыкальных предпочтений. Узнайте, как связаны ваши любимые жанры и артисты, усиливайте или скрывайте исполнителей.
- **🎧 Бесшовный кроссфейд**: Плавный переход между треками с мягким затуханием и нарастанием громкости (как в Spotify).
- **🎮 Статус в Discord**: Автоматически показывает играющий трек, автора, обложку и таймлайн в вашем профиле Discord.
- **📌 Управление из трея**: Сворачивайте плеер рядом с часами Windows и переключайте треки, не открывая главное окно.

---

### 🔑 Вход в аккаунт в 1 клик

SoundCloud защищён капчей DataDome, блокирующей прямой вход через сторонние приложения. Для моментальной авторизации:

👉 **[Расширение freakcloud Sync (GitHub)](https://github.com/MinakowDev/freakcloud-extension)**

1. Установите расширение в Chrome, Edge, Brave или Яндекс.Браузер.
2. Войдите на [soundcloud.com](https://soundcloud.com).
3. Расширение безопасно передаст авторизацию напрямую в десктопное приложение через локальный порт `127.0.0.1:49281`.

---

### 🛠 Стек технологий

- **Фронтенд**: React 18, TypeScript, Vite, Vanilla CSS токены, Remix Icon.
- **Бэкенд**: Tauri v2, Rust, Tokio, Reqwest, Hyper (Loopback Audio Server), Discord RPC.
- **Архитектура**: Feature-Sliced Design на фронтенде + Clean Architecture в ядре Rust.

---

### 🚀 Запуск и сборка

#### Требования
- [Rust](https://www.rust-lang.org/) (актуальная версия)
- [Bun](https://bun.sh/) или [Node.js](https://nodejs.org/) (18+)

```bash
# Клонирование репозитория
git clone https://github.com/MinakowDev/freakcloud.git
cd freakcloud/freakcloud

# Установка зависимостей
bun install

# Запуск в режиме разработки
bun tauri dev

# Сборка установщика для Windows (.exe / .msi)
bun tauri build
```

---

## 📄 License

MIT License. Designed for pure listening pleasure.
