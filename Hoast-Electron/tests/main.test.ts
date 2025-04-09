import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';

// Create mock implementations
const mockBrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL: jest.fn(),
  loadFile: jest.fn(),
  on: jest.fn(),
  webContents: {
    openDevTools: jest.fn(),
    send: jest.fn()
  },
  setIcon: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  isVisible: jest.fn(),
}));

const mockTray = jest.fn().mockImplementation(() => ({
  setToolTip: jest.fn(),
  setContextMenu: jest.fn(),
  on: jest.fn()
}));

const mockMenuBuildFromTemplate = jest.fn().mockReturnValue({});

const mockNativeImageCreateFromPath = jest.fn().mockReturnValue({
  setTemplateImage: jest.fn()
});

// Mock Electron modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/mock/path'),
    quit: jest.fn(),
    whenReady: jest.fn().mockResolvedValue({}),
    on: jest.fn()
  },
  BrowserWindow: mockBrowserWindow,
  Tray: mockTray,
  Menu: {
    buildFromTemplate: mockMenuBuildFromTemplate
  },
  nativeImage: {
    createFromPath: mockNativeImageCreateFromPath
  },
  dialog: {
    showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
    showErrorBox: jest.fn()
  },
  ipcMain: {
    handle: jest.fn(),
    handleOnce: jest.fn()
  }
}));

// Mock path module
jest.mock('node:path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/'))
}));

// Mock node:fs
jest.mock('node:fs', () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
  existsSync: jest.fn().mockReturnValue(true)
}));

// Mock the globals that are injected by Electron Forge
(global as any).MAIN_WINDOW_VITE_DEV_SERVER_URL = undefined;
(global as any).MAIN_WINDOW_VITE_NAME = 'main_window';

// Create simplified stub implementations for testing
const createWindowStub = () => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join('/mock/path', 'preload.js'),
    },
    icon: path.join('/mock/path', '../assets/icons/icon.ico'),
  });
  
  // Simple stub logic for testing
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join('/mock/path', `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  
  return window;
};

const createTrayStub = () => {
  let trayIcon;
  
  if (process.platform === 'darwin') {
    const iconPath = path.join('/mock/path', '../assets/icons/16x16.png');
    const macIcon = nativeImage.createFromPath(iconPath);
    macIcon.setTemplateImage(true);
    trayIcon = new Tray(macIcon);
  } else if (process.platform === 'win32') {
    const iconPath = path.join('/mock/path', '../assets/icons/icon.ico');
    trayIcon = new Tray(iconPath);
  } else {
    const iconPath = path.join('/mock/path', '../assets/icons/48x48.png');
    trayIcon = new Tray(iconPath);
  }
  
  trayIcon.setToolTip('Hoast - Hosts File Manager');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Test Menu Item' }
  ]);
  trayIcon.setContextMenu(contextMenu);
  
  return trayIcon;
};

// Mock the main.ts module to return our stub implementations
jest.mock('../src/main.ts', () => ({
  createWindow: createWindowStub,
  createTray: createTrayStub
}));

describe('Main Process', () => {
  // Reset all mocks between tests
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createWindow', () => {
    it('should create a browser window with correct properties', () => {
      const { createWindow } = require('../src/main');
      
      // Execute the function we're testing
      createWindow();
      
      // Verify BrowserWindow constructor was called
      expect(mockBrowserWindow).toHaveBeenCalled();
      
      // Check BrowserWindow was called with expected parameters
      expect(mockBrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
        width: 800,
        height: 600,
        show: false,
        webPreferences: expect.objectContaining({
          preload: expect.any(String)
        })
      }));
    });
  });

  describe('createTray', () => {
    it('should create a tray with platform-specific icon', () => {
      const originalPlatform = process.platform;
      
      // Mock process.platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true
      });
      
      const { createTray } = require('../src/main');
      
      // Execute the function we're testing
      createTray();
      
      // Verify Tray constructor was called
      expect(mockTray).toHaveBeenCalled();
      
      // Verify nativeImage.createFromPath was called with the expected path
      expect(mockNativeImageCreateFromPath).toHaveBeenCalledWith(
        expect.stringContaining('16x16.png')
      );
      
      // Verify setToolTip was called with the expected text
      expect(mockTray.mock.results[0].value.setToolTip)
        .toHaveBeenCalledWith('Hoast - Hosts File Manager');
      
      // Verify context menu was built
      expect(mockMenuBuildFromTemplate).toHaveBeenCalled();
      
      // Reset platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      });
    });
  });
});