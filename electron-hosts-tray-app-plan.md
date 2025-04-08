# 🖥️ Electron Hosts Tray App - Development Plan

## 🧠 Phase 1: Requirements & Planning

**Goal**:  
Create a cross-platform Electron app that lives in the system tray (or Mac menu bar) and allows users to manage entries in the `/etc/hosts` file.

**Core Features**:
- Tray/MenuBar icon
- View `/etc/hosts` entries
- Enable/disable entries
- Add new entries
- Write changes to `/etc/hosts` with permission elevation

---

## 🏗️ Phase 2: Project Setup

- Initialize an Electron project (Electron Forge, Vite + Electron, or similar)
- Set up hot reloading and dev tools
- Add a basic tray icon and test with static menu items

---

## 🧪 Phase 3: Basic Functionality

### ✅ Read `/etc/hosts`
- Parse contents into structured data
- Detect commented/uncommented entries
- Watch file for changes (optional)

### ✅ Display in tray menu
- List entries with checkboxes or toggles
- Add “Refresh” option

### ✅ Enable/disable entries
- Comment/uncomment lines when toggled
- Track original format and preserve comments/spacing

---

## 🔐 Phase 4: Permission Handling

### 🔒 Writing to `/etc/hosts`
- Use `sudo-prompt` or `electron-sudo` to prompt for permission
- Optionally: use helper script with elevated permissions

### 🛑 Handle Errors
- Catch and report permission failures
- Inform user if save fails

---

## 💅 Phase 5: UI Improvements

- Add a preferences/settings window:
  - Start on login
  - Backup/restore `/etc/hosts`
  - Default profile selection (optional)

- Enhance tray UI:
  - Submenus for grouped entries
  - “Enable All / Disable All”
  - Status indicators (icons/emojis)

---

## 📦 Phase 6: Packaging & Distribution

- Use `electron-builder`, `electron-forge`, or `electron-packager`
- Create `.dmg`, `.AppImage`, `.exe`, etc.
- Add support for auto-launch on startup
- Sign and notarize for macOS (optional but recommended)

---

## 🧹 Bonus Ideas

- DNS flush support (`sudo dscacheutil -flushcache` on macOS)
- Entry groups/profiles
- Hotkey to toggle specific entries
- Web UI for advanced editing
- Tray notifications when changes are made

---

## 📛 Project Naming

Candidate: **Hux** or **Hoast**  
(Be aware of naming conflicts—see naming analysis for more details.)

---
