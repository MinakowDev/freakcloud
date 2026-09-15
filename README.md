# freackcloud

<p align="center">
  <img src="public/logo.png" alt="freackcloud logo" width="96" height="96" />
</p>

<p align="center">
  <strong>An ultra-lightweight, high-performance desktop music player for SoundCloud.</strong><br>
  Engineered with Tauri 2, Rust, React, and a client-side behavioral Taste Graph.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?style=flat-square&logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-Tokio-orange?style=flat-square&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/RAM-~40MB-success?style=flat-square" alt="Lightweight RAM">
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/TailwindCSS-Cyber_Dark-38bdf8?style=flat-square&logo=tailwindcss" alt="Tailwind">
</p>

---

## ⚡ Ultra-Lightweight by Design

Unlike bulky Chromium/Electron-based players that easily consume 500MB–1GB of RAM and put unnecessary load on CPU, **freackcloud** is built on **Tauri v2** with a native **Rust** core:

- **Minimal Memory Footprint**: Typically runs at ~30–50 MB of RAM.
- **Zero Background Bloat**: Near-zero CPU usage when idling or playing music.
- **Instant Startup**: Native system webview rendering without bundling an entire browser.

---

## ✨ Features

- **Personal Wave & Infinite Flow**: Continuous music stream powered by SoundCloud Track Stations blended with a client-side **Taste Graph** (exponential time-decay, completion bonuses, skip penalties).
- **Smart Offline Cache**: Local audio caching with an embedded loopback audio server for instant offline playback.
- **Spotify-like Crossfade**: Smooth volume ramping and seamless transitions between tracks.
- **SoundCloud Sync**: Embedded OAuth authorization, synchronization of your liked tracks and personal profile.
- **System Tray Integration**: Background playback, tray context menu, and minimize-to-tray support.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Remix Icon |
| **Backend & Runtime** | Tauri v2, Rust, Tokio, Reqwest, Hyper (Loopback Audio Server) |
| **Recommendation Engine** | Hybrid: SoundCloud Track Stations + Client Taste Graph (Collaborative Filtering + Heuristic Ranking) |

---

## 📜 Architecture

- `src-tauri/src/domain/`: Core business models, traits, and ports (`SoundCloudGateway`, `AudioCacheGateway`).
- `src-tauri/src/infrastructure/`: SoundCloud API adapter, local audio cache file storage, and loopback streaming server.
- `src-tauri/src/interfaces/`: Tauri IPC commands and event emitters.
- `src/entities/`: Feature-Sliced Design domain entities (`track`, `player`, `session`).
- `src/widgets/`: Modular UI widgets (`queue-aside`, `wave-deck`, `player-dock`, `sidebar`, `header`).

---

## 📄 License

MIT License. Designed with precision for pure listening pleasure.
