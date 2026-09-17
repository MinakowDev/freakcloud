# freakcloud

<p align="center">
  <img src="public/logo.png" alt="freakcloud logo" width="80" height="80" />
</p>

<p align="center">
  <strong>Ultra-lightweight, zero-bloat desktop player for SoundCloud.</strong><br>
  Built with Rust and Tauri v2. Runs on ~50 MB RAM with 0.0% idle CPU.
</p>

<p align="center">
  <a href="https://github.com/MinakowDev/freakcloud/releases/latest"><img src="https://img.shields.io/github/v/release/MinakowDev/freakcloud?style=flat-square&color=white" alt="Release"></a>
  <img src="https://img.shields.io/badge/Tauri-v2-blue?style=flat-square&logo=tauri" alt="Tauri v2">
  <img src="https://img.shields.io/badge/Rust-Tokio-orange?style=flat-square&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/RAM-~50MB-success?style=flat-square" alt="RAM ~50MB">
  <img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="https://github.com/MinakowDev/freakcloud/releases/latest">Download Release (.exe / .msi)</a> •
  <a href="https://minakowdev.github.io/freakcloud/">Website & Screenshots</a> •
  <a href="https://github.com/MinakowDev/freakcloud-extension">Browser Extension</a> •
  <a href="#-русский">Русский</a>
</p>

<p align="center">
  <img src="docs/assets/main_page.png" alt="freakcloud Desktop Preview" width="880" />
</p>

---

## Benchmark: freakcloud vs The Rest

<p align="center">
  <img src="docs/assets/benchmark.svg" alt="freakcloud performance benchmark" width="850" />
</p>

### Architectural Comparison

| Metric / Feature | Browser Tab (Chrome) | Electron Aggregators (Dotify / Mimose) | **freakcloud** |
| :--- | :---: | :---: | :---: |
| **Active Memory (RAM)** | ~800–1200 MB | ~500–800 MB | **~50 MB** *(11 MB private)* |
| **Idle CPU Usage** | 2–5% | 3–7% | **0.0%** *(Kinetic Sleep)* |
| **Installer Size** | — | ~80–120 MB | **3.3 MB** |
| **Audio Engine** | Web Audio API | Chromium / Node | **Native Tokio Loopback** |
| **Offline Disk Cache** | ❌ None | ⚠️ Limited / Paid | **✅ Local disk storage** |
| **Taste Graph 2.0** | ❌ None | ❌ None | **✅ 2D Physics Engine** |
| **Monetization** | Ads | Paid plans ($ / Mimose+) | **100% Free & Open Source (MIT)** |

---

## Overview

| Feature | Description |
| :--- | :--- |
| **Smart Infinite Wave** | Infinite music flow based on SoundCloud Stations, tuned to your listen-throughs and likes. |
| **Offline Cache** | Downloads favorite tracks to your local disk for instant, zero-buffering playback without internet. |
| **Queue with History** | Rewind to previously played tracks in one click without resetting your current radio stream. |
| **Taste Graph 2.0** | Studio 2D physics map of your musical preferences with artist clusters and zero-CPU sleep mode. |
| **Custom Playlists** | Organize tracks with dynamic 2x2 cover collages and instant SoundCloud in-app search. |
| **Studio Crossfade** | Seamless logarithmic volume ramping between tracks with no silence or clicks. |
| **Discord RPC & Tray** | Live playback status in Discord and a background system tray mini-controller. |

---

## Instant 1-Click Login

SoundCloud blocks automated desktop sign-ins via DataDome WAF. Log in effortlessly with our companion extension:

👉 **[freakcloud Sync Extension](https://github.com/MinakowDev/freakcloud-extension)**

1. Install the extension in Chrome, Edge, Brave, or Yandex.
2. Log into [soundcloud.com](https://soundcloud.com).
3. The extension detects your session and securely connects your desktop player in 1 click.

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/MinakowDev/freakcloud.git
cd freakcloud/freakcloud

# Install dependencies & run dev server
bun install
bun tauri dev

# Build release executable
bun tauri build
```

---

<h2 id="-русский">🇷🇺 Русский</h2>

### Почему freakcloud?

Вкладка SoundCloud в браузере или плеер на базе Electron отъедает **до 1 ГБ оперативной памяти**, нагружает процессор и просаживает FPS в играх. 

**freakcloud** написан на **Rust** с нативным ядром **Tauri v2**:
- **~50 МБ ОЗУ** вместо 800+ МБ у браузера;
- **0.0% CPU в простое** благодаря алгоритму Kinetic Energy Sleep;
- **Размер инсталлятора — всего 3.3 МБ**;
- **100% Free & Open Source (MIT)**: без рекламы, платных подписок и тяжелого Electron.

### Быстрое сравнение

| Возможность | Обычный браузер | Electron-комбайны | **freakcloud** |
| :--- | :---: | :---: | :---: |
| **ОЗУ в фоне** | 800+ МБ | 500–800 МБ | **~50 МБ** |
| **Нагрузка CPU** | 2–5% | 3–7% | **0.0%** |
| **Офлайн-кэш** | ❌ Нет | ⚠️ Платный / баги | **✅ На локальный диск** |
| **Граф вкусов** | ❌ Нет | ❌ Нет | **✅ 2D-симуляция вкусов** |
| **Управление** | Вкладка | Окно | **Трей Windows + Discord RPC** |

### Скачать

Готовые официальные сборки доступны в [GitHub Releases](https://github.com/MinakowDev/freakcloud/releases/latest):
- **`freakcloud_x64-setup.exe`** — установщик Windows
- **`freakcloud_x64.msi`** — Windows Installer пакет
- **`freakcloud_x64_portable.zip`** — портативная версия

---

## License

[MIT License](LICENSE) • Built for pure listening pleasure.
