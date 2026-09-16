# ==============================================================================
# Freakcloud Makefile (Bun + Tauri v2)
# ==============================================================================

BUN := bun
TAURI := $(BUN) tauri

.PHONY: help install dev kill clean lint check \
        build build-win build-win-debug \
        android-init android-dev build-android build-android-debug \
        build-macos build-macos-debug \
        build-linux build-linux-debug

# ------------------------------------------------------------------------------
# Help
# ------------------------------------------------------------------------------
help:
	@echo "======================================================================="
	@echo " Freakcloud Build & Dev Commands (using $(BUN))"
	@echo "======================================================================="
	@echo "  make dev                 - Run app in desktop development mode"
	@echo "  make kill                - Stop running freakcloud.exe process (fixes OS lock error 5)"
	@echo "  make lint                - Run oxlint linter across frontend code"
	@echo "  make check               - Typecheck (tsc) + Cargo check"
	@echo "  make clean               - Clean dist and cargo target directory"
	@echo ""
	@echo " [Windows]"
	@echo "  make build / build-win   - Build Windows production release (NSIS / MSI)"
	@echo "  make build-win-debug     - Build Windows debug version (faster compilation)"
	@echo ""
	@echo " [Android]"
	@echo "  make android-init        - Initialize Android project template in src-tauri"
	@echo "  make android-dev         - Run app on connected Android device/emulator"
	@echo "  make build-android       - Build production Android APK / AAB"
	@echo "  make build-android-debug - Build debug Android APK"
	@echo ""
	@echo " [macOS]"
	@echo "  make build-macos         - Build macOS app bundle (requires macOS host or toolchain)"
	@echo "  make build-macos-debug   - Build macOS debug bundle"
	@echo ""
	@echo " [Linux]"
	@echo "  make build-linux         - Build Linux release (AppImage / deb)"
	@echo "  make build-linux-debug   - Build Linux debug version"
	@echo "======================================================================="

# ------------------------------------------------------------------------------
# General / Utility
# ------------------------------------------------------------------------------
install:
	$(BUN) install

dev:
	$(TAURI) dev

# Kill running freakcloud instance on Windows to release file lock on freakcloud.exe
kill:
	-cmd.exe /c "taskkill /F /IM freakcloud.exe" 2>nul || true

clean:
	-cmd.exe /c "rmdir /s /q dist" 2>nul || true
	cd src-tauri && cargo clean

lint:
	npx --yes oxlint

check:
	$(BUN) run tsc --noEmit
	cd src-tauri && cargo check

# ------------------------------------------------------------------------------
# Windows Builds
# ------------------------------------------------------------------------------
build: build-win

build-win: kill
	$(TAURI) build

build-win-debug: kill
	$(TAURI) build --debug

# ------------------------------------------------------------------------------
# Android Builds
# ------------------------------------------------------------------------------
android-init:
	$(TAURI) android init

android-dev:
	$(TAURI) android dev

build-android:
	$(TAURI) android build

build-android-debug:
	$(TAURI) android build --debug

# ------------------------------------------------------------------------------
# macOS Builds (Run on macOS or with Darwin cross-compiler)
# ------------------------------------------------------------------------------
build-macos:
	$(TAURI) build --target universal-apple-darwin || $(TAURI) build --target x86_64-apple-darwin

build-macos-debug:
	$(TAURI) build --debug --target universal-apple-darwin || $(TAURI) build --debug --target x86_64-apple-darwin

# ------------------------------------------------------------------------------
# Linux Builds
# ------------------------------------------------------------------------------
build-linux:
	$(TAURI) build --target x86_64-unknown-linux-gnu

build-linux-debug:
	$(TAURI) build --debug --target x86_64-unknown-linux-gnu
