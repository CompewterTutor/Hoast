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
- Permission elevation handling implemented
  - Uses sudo-prompt for cross-platform permission elevation
  - Creates temporary files for operations requiring elevated permissions
  - Platform-specific command execution
  - Error handling for permission failures
- Enhanced tray menu functionality implemented
  - Dynamic menu items for host entries
  - Visual indicators for enabled/disabled entries (✅/❌)
  - Organized grouping of enabled and disabled entries
  - Entry-specific context menus with enable/disable and remove options
  - Add New Entry functionality with form validation
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

## Tech Stack
- **Framework**: Electron with Electron Forge
- **Build Tools**: Vite, TypeScript
- **Target Platforms**: macOS, Windows, Linux
- **Key Dependencies**: electron, electron-forge, electron-squirrel-startup, chokidar, sudo-prompt

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
- **Renderer Process**: Will manage UI windows (preferences, settings)
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
  - Permission elevation handler (implemented)
    - Uses sudo-prompt for cross-platform elevation
    - Platform-specific command execution
    - Temporary file creation for elevated operations
  - Configuration manager (implemented)
    - Manages user preferences and application settings
    - Handles loading, saving, and updating configuration
    - Stores data in the user data directory
    - Provides defaults and version migration
    - Uses events to notify of configuration changes

## Important Decisions
- Project name: Hoast
- Cross-platform from the start
- System tray-based interface for quick access
- Preservation of hosts file formatting is a priority
- Using TypeScript for improved type safety and developer experience
- Using Electron Forge with Vite for better development experience and faster builds
- Using chokidar for file watching due to its reliability across platforms
- Using sudo-prompt for permission elevation due to its cross-platform support

## Next Steps
- Create preferences/settings window
- Add support for DNS cache flushing
- Implement auto-launch on system startup
- Add host entry grouping functionality