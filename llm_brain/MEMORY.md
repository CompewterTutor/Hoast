# Project Memory - Hoast

## Project Overview
Hoast is a cross-platform Electron application that lives in the system tray/menu bar and provides an easy interface to manage entries in the `/etc/hosts` file. The application handles permission elevation automatically and preserves the file's formatting and comments.

## Current Project State
- Project structure initialized with documentation files
- README.md created with project overview, features, and development instructions
- BRIEF.md details the project architecture and requirements
- TODO.md outlines development phases and tasks

## Tech Stack
- **Framework**: Electron
- **Target Platforms**: macOS, Windows, Linux
- **Key Dependencies**: (To be determined during implementation)

## Development Environment
- Project in initial planning/documentation phase
- Development environment not yet set up

## Architecture Notes
- **Main Process**: Will handle system tray integration, file operations, and permission elevation
- **Renderer Process**: Will manage UI windows (preferences, settings)
- **Core Services**:
  - Hosts file parser/writer
  - Permission elevation handler
  - Configuration manager
  - File watcher

## Important Decisions
- Project name: Hoast
- Cross-platform from the start
- System tray-based interface for quick access
- Preservation of hosts file formatting is a priority

## Next Steps
- Initialize Electron project
- Set up development environment
- Implement basic tray icon functionality