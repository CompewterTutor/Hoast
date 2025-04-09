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

## Tech Stack
- **Framework**: Electron with Electron Forge
- **Build Tools**: Vite, TypeScript
- **Target Platforms**: macOS, Windows, Linux
- **Key Dependencies**: electron, electron-forge, electron-squirrel-startup

## Development Environment
- Project initialized with Electron Forge
- TypeScript configuration set up
- Development tools configured (hot reloading via Vite)
- Basic file structure established
- Type declarations created for required modules

## Architecture Notes
- **Main Process**: Handles system tray integration, file operations, and permission elevation
  - System tray implementation with context menu in place
  - Main window hidden by default (tray-based app)
- **Renderer Process**: Will manage UI windows (preferences, settings)
- **Core Services** (to be implemented):
  - Hosts file parser/writer
  - Permission elevation handler
  - Configuration manager
  - File watcher

## Important Decisions
- Project name: Hoast
- Cross-platform from the start
- System tray-based interface for quick access
- Preservation of hosts file formatting is a priority
- Using TypeScript for improved type safety and developer experience
- Using Electron Forge with Vite for better development experience and faster builds

## Next Steps
- Implement hosts file parser service
- Set up testing framework
- Create preferences window UI