# Hoast

<p align="center">
  <img src="resources/logo.png" alt="Hoast Logo" width="120" height="120">
</p>

> A simple, cross-platform system tray application to manage your hosts file without the hassle

Hoast is an Electron-based application that lives in your system tray (or menu bar on macOS), allowing you to easily view, enable, disable, and add entries to your `/etc/hosts` file without directly editing system files.

## Features

- **💻 Cross-Platform**: Works seamlessly on macOS, Windows, and Linux
- **🔄 Real-Time Management**: Enable or disable host entries with a single click
- **➕ Easy Addition**: Add new host entries without editing files manually
- **🔒 Permission Handling**: Automatically requests elevated permissions when needed
- **⚙️ Formatting Preservation**: Keeps your hosts file formatted and commented exactly as you had it
- **🔍 External Change Detection**: Instantly notices when the hosts file is modified outside the app
- **🚀 Quick Access**: Always accessible from your system tray or menu bar

## Installation

### macOS
Download the latest `.dmg` file from the [releases page](https://github.com/yourusername/hoast/releases) and drag the application to your Applications folder.

### Windows
Download and run the installer (`.exe`) from the [releases page](https://github.com/yourusername/hoast/releases).

### Linux
Download the appropriate package for your distribution (`.AppImage` or `.deb`) from the [releases page](https://github.com/yourusername/hoast/releases).

## Usage

1. Launch Hoast (it will appear in your system tray/menu bar)
2. Click the icon to see all your hosts file entries
3. Toggle entries on/off with a single click
4. Add new entries using the "Add Entry" option
5. Access preferences to customize your experience

## Screenshots

<p align="center">
  <img src="resources/screenshot-mac.png" alt="Hoast on macOS" width="400">
  <img src="resources/screenshot-win.png" alt="Hoast on Windows" width="400">
</p>

## Development

### Prerequisites
- Node.js (>= 14.x)
- npm or yarn

### Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/hoast.git

# Navigate to project directory
cd hoast

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Building
```bash
# Build for current platform
npm run build

# Package for distribution
npm run package
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- The Electron project for making cross-platform desktop apps easy
- All contributors and testers who have helped make Hoast better

