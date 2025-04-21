# Project Memory - Hoast

## Project Overview
Hoast is a cross-platform Electron application that lives in the system tray/menu bar and provides an easy interface to manage entries in the `/etc/hosts` file. The application handles permission elevation automatically and preserves the file's formatting and comments.

## Current Project State
- Project structure initialized with documentation files
- README.md created with project overview, features, and development instructions
- BRIEF.md details the project architecture and requirements
- TODO.md outlines development phases and tasks
- Basic Electron application initialized with Electron Forge
- Core application structure set up with main and renderer processes
- System tray functionality implemented with a basic menu
- TypeScript type declarations added for dependencies
- Application icons implemented for all platforms (macOS, Windows, Linux)
- Testing framework set up with Jest
- Hosts file parser service implemented with type definitions
  - Can read and parse hosts files into structured data
  - Detects enabled/disabled (commented) entries
  - Preserves formatting and comments
  - Comprehensive tests implemented for all functionality
- File watcher service implemented
  - Detects external changes to the hosts file
  - Uses chokidar for efficient file watching
  - Debounces rapid changes to prevent multiple events
  - Integrated with the hosts file parser service
  - Provides event-based notifications for application-wide sync
  - Includes comprehensive tests for the functionality
- Hosts file writer service implemented
  - Converts structured data back to text format with formatting preserved
  - Provides methods for writing changes to the hosts file
  - Supports common operations (add, update, remove, toggle entries)
  - Includes backup functionality for safety
  - Emits events for success and error cases
  - Includes comprehensive tests for all functionality
  - Backup files now stored in user directory (~/.hoast/backups) to prevent permission issues
- Permission elevation handling implemented
  - Uses sudo-prompt for cross-platform permission elevation
  - Creates temporary files for operations requiring elevated permissions
  - Platform-specific command execution
  - Error handling for permission failures
  - Robust icon handling to prevent errors in production builds
  - Fixed app name validation to meet sudo-prompt requirements
- Enhanced tray menu functionality implemented
  - Dynamic menu items for host entries
  - Visual indicators for enabled/disabled entries (✅/❌)
  - Organized grouping of enabled and disabled entries
  - Entry-specific context menus with enable/disable and remove options
  - Add New Entry functionality with form validation
  - Fixed IPC communication for Add New Entry functionality to properly pass form data
  - Refresh functionality to reload the hosts file
  - Platform-specific optimizations (icons, behavior)
  - Confirmation dialogs for destructive actions
  - Success and error notifications
- Configuration manager implemented
  - Manages application settings and preferences
  - Stores configuration in the user data directory
  - Supports loading, saving, and resetting configuration
  - Handles defaults and version updates
  - Uses event emitter for config change notifications
  - Supports partial configuration updates
  - Includes comprehensive tests for all functionality
- Auto-launch functionality implemented
  - Uses auto-launch package for cross-platform startup management
  - Configures the app to start on system login based on user preferences
  - Respects the startMinimized setting to control visibility on startup
  - Updates auto-launch settings when user preferences change
  - Handles permission requirements for setting up auto-launch
  - Includes comprehensive tests for the functionality
- Preferences window implemented
  - Complete UI for managing all application settings
  - Organized into tabs for different categories of settings (General, Hosts File, UI, System)
  - Form validation for user inputs
  - Save, cancel, and reset to defaults functionality 
  - Persistent storage of preferences using the configuration manager
  - Clean, modern UI with appropriate styling
  - Direct integration with main process through IPC communication
  - DNS cache flushing functionality
  - Backup directory selection via dialog

## Tech Stack
- **Framework**: Electron with Electron Forge
- **Build Tools**: Vite, TypeScript
- **Target Platforms**: macOS, Windows, Linux
- **Key Dependencies**: electron, electron-forge, electron-squirrel-startup, chokidar, sudo-prompt, auto-launch

## Development Environment
- Project initialized with Electron Forge
- TypeScript configuration set up
- Development tools configured (hot reloading via Vite)
- Basic file structure established
- Type declarations created for required modules

## Architecture Notes
- **Main Process**: Handles system tray integration, file operations, and permission elevation
  - System tray implementation with context menu in place
  - Dynamic tray menu with host entries and actions
  - Main window hidden by default (tray-based app)
- **Renderer Process**: Manages UI windows (preferences, settings)
  - Preferences window implemented with tabbed interface
  - Form controls for all configuration options
  - IPC communication with main process for configuration changes
- **Core Services**:
  - Hosts file parser service (implemented)
    - Reads and parses hosts file
    - Converts to structured data with types
    - Identifies enabled/disabled entries
    - Preserves comments and formatting
  - File watcher service (implemented)
    - Monitors hosts file for external changes
    - Uses chokidar for efficient cross-platform watching
    - Updates application state when file changes
    - Uses debouncing to prevent multiple rapid events
  - Hosts file writer service (implemented)
    - Converts structured data back to text
    - Writes changes to hosts file
    - Handles operations like adding, updating, removing entries
    - Creates backups before writing changes
    - Preserves formatting and comments
    - Now stores backups in user directory (~/.hoast/backups) instead of system locations
  - Permission elevation handler (implemented)
    - Uses sudo-prompt for cross-platform elevation
    - Platform-specific command execution
    - Temporary file creation for elevated operations
    - Robust icon handling to prevent errors when icon path is invalid
    - Fixed app name validation to meet sudo-prompt requirements
  - Configuration manager (implemented)
    - Manages user preferences and application settings
    - Handles loading, saving, and updating configuration
    - Stores data in the user data directory
    - Provides defaults and version migration
    - Uses events to notify of configuration changes
  - Auto-launch functionality (implemented)
    - Manages application startup with system boot
    - Uses auto-launch package for cross-platform compatibility
    - Ties into user preferences for configurable behavior
    - Handles different startup modes (hidden vs. visible)

## Important Decisions
- Project name: Hoast
- Cross-platform from the start
- System tray-based interface for quick access
- Preservation of hosts file formatting is a priority
- Using TypeScript for improved type safety and developer experience
- Using Electron Forge with Vite for better development experience and faster builds
- Using chokidar for file watching due to its reliability across platforms
- Using sudo-prompt for permission elevation due to its cross-platform support
- Using auto-launch for system startup integration due to its cross-platform support
- Tabbed preferences window for better organization of settings
- Store backup files in user directory (~/.hoast/backups) to prevent permission issues
- Robust icon handling for sudo-prompt dialog to prevent production build errors

## Next Steps
- Improve UI for group management
- Add notification system for changes
- Comprehensive testing on all target platforms
- Set up build process with electron-builder