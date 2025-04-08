# HOAST

## Description
Hoast is a cross-platform Electron application that lives in the system tray (or Mac menu bar) and allows users to easily manage entries in the `/etc/hosts` file. It provides a convenient interface for enabling, disabling, and adding host entries without directly editing system files, handling permission elevation automatically.

## Overall Architecture
Hoast is built using Electron, allowing it to run on macOS, Windows, and Linux. The application consists of:

1. **Main Process**: Handles system tray integration, file operations, and permission elevation
2. **Renderer Process**: Manages any UI windows (preferences, settings)
3. **Core Services**:
   - Hosts file parser/writer
   - Permission elevation handler (using sudo-prompt or electron-sudo)
   - Configuration manager
   - File watcher (to detect external changes)

## Feature List
- **System Tray Integration**:
  - Accessible icon in system tray/menu bar
  - Dropdown menu with host entries

- **Host Entry Management**:
  - View all entries in `/etc/hosts`
  - Enable/disable entries via toggles
  - Add new entries
  - Group entries (future enhancement)
  - Preserve comments and formatting

- **System Integration**:
  - Elevate permissions to write to `/etc/hosts`
  - Launch on system startup (optional)
  - Support for DNS cache flushing

- **User Experience**:
  - Preferences/settings window
  - Backup/restore functionality
  - Error handling and notifications

## Entities
- **Host Entry**: An individual entry in the hosts file
  - IP address
  - Hostname
  - Is enabled/disabled (commented)
  - Associated comments

- **Host Group**: Collection of related host entries (future)
  - Name
  - List of host entries
  - Enable/disable as group

- **User Preferences**:
  - Launch on startup setting
  - UI preferences
  - Backup configuration

## Business Rules
1. Reading the hosts file requires no special permissions
2. Writing to the hosts file requires elevated permissions (sudo/admin)
3. The app must preserve all formatting, comments, and structure of the hosts file
4. Changes should be applied immediately and validate success
5. Multiple instances of the app should not conflict
6. External changes to the hosts file should be detected and reflected in the UI

## Success Metrics
- **Usability**: Users can modify hosts file entries in 2 clicks or less
- **Reliability**: 100% accuracy in parsing and writing hosts file without corruption
- **Performance**: Application starts in under 2 seconds and uses minimal system resources
- **Adoption**: Track number of downloads and active users
- **User Satisfaction**: Gather feedback through ratings and reviews

## Other Details
- **Target Platforms**: macOS, Windows, Linux
- **Distribution**: Packaged as `.dmg` (macOS), `.exe` (Windows), `.AppImage`/`.deb` (Linux)
- **Security**: Code signed and notarized for macOS (where applicable)
- **Future Enhancements**:
  - Profile support for switching between sets of hosts configurations
  - Hotkey support for quick toggling
  - Advanced web UI for more complex editing