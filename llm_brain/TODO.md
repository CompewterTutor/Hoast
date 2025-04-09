# Hoast - Development TODO List

## Phase 1: Project Setup
- [x] Initialize Electron project (using Electron Forge ) 
- [x] Set up development environment (hot reloading, dev tools)
- [x] Configure project structure (main/renderer processes)
- [x] Create basic tray/menubar icon implementation
- [x] Add application icons for all platforms
- [x] Set up testing framework

## Phase 2: Core Functionality
- [x] Create hosts file parser service
  - [x] Read and parse `/etc/hosts` file
  - [x] Convert to structured data
  - [x] Detect commented/uncommented entries
  - [x] Preserve formatting and comments
- [x] Implement file watcher for external changes
- [x] Create hosts file writer service
  - [x] Convert structured data back to text
  - [x] Write to file with proper formatting
  - [x] Handle permission elevation
- [x] Set up configuration manager for app settings

## Phase 3: UI Implementation
- [x] Design and implement tray/menubar interface
  - [x] Create dynamic menu with host entries
  - [x] Implement enable/disable toggles
  - [x] Add "Add New Entry" functionality
  - [x] Add "Refresh" option
- [ ] Create preferences/settings window
  - [ ] Launch on startup option
  - [ ] Backup/restore functionality
  - [ ] UI preferences

## Phase 4: System Integration
- [x] Implement permission elevation for writing to `/etc/hosts`
  - [x] Research and integrate sudo-prompt or electron-sudo
  - [x] Add error handling for permission failures
- [ ] Add support for DNS cache flushing
- [ ] Implement auto-launch on system startup
- [x] Handle external file changes

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