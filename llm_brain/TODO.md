# Hoast - Development TODO List

## Phase 1: Project Setup
- [ ] Initialize Electron project (using Electron Forge or Vite + Electron)
- [ ] Set up development environment (hot reloading, dev tools)
- [ ] Configure project structure (main/renderer processes)
- [ ] Create basic tray/menubar icon implementation
- [ ] Set up testing framework

## Phase 2: Core Functionality
- [ ] Create hosts file parser service
  - [ ] Read and parse `/etc/hosts` file
  - [ ] Convert to structured data
  - [ ] Detect commented/uncommented entries
  - [ ] Preserve formatting and comments
- [ ] Implement file watcher for external changes
- [ ] Create hosts file writer service
  - [ ] Convert structured data back to text
  - [ ] Write to file with proper formatting
  - [ ] Handle permission elevation
- [ ] Set up configuration manager for app settings

## Phase 3: UI Implementation
- [ ] Design and implement tray/menubar interface
  - [ ] Create dynamic menu with host entries
  - [ ] Implement enable/disable toggles
  - [ ] Add "Add New Entry" functionality
  - [ ] Add "Refresh" option
- [ ] Create preferences/settings window
  - [ ] Launch on startup option
  - [ ] Backup/restore functionality
  - [ ] UI preferences

## Phase 4: System Integration
- [ ] Implement permission elevation for writing to `/etc/hosts`
  - [ ] Research and integrate sudo-prompt or electron-sudo
  - [ ] Add error handling for permission failures
- [ ] Add support for DNS cache flushing
- [ ] Implement auto-launch on system startup
- [ ] Handle external file changes

## Phase 5: Enhanced Features
- [ ] Add host entry grouping functionality
  - [ ] Group creation and management
  - [ ] Group enable/disable
  - [ ] UI for group management
- [ ] Implement backup and restore functionality
- [ ] Add notification system for changes

## Phase 6: Testing & Refinement
- [ ] Comprehensive testing on all target platforms
  - [ ] macOS testing
  - [ ] Windows testing
  - [ ] Linux testing
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] UX refinements based on testing

## Phase 7: Packaging & Distribution
- [ ] Set up build process with electron-builder
- [ ] Create installers for all platforms
  - [ ] macOS (.dmg)
  - [ ] Windows (.exe)
  - [ ] Linux (.AppImage, .deb)
- [ ] Code signing and notarization (for macOS)
- [ ] Prepare documentation

## Future Enhancements
- [ ] Profile support for switching between sets of hosts configurations
- [ ] Hotkey support for quick toggling
- [ ] Advanced web UI for more complex editing