// This file is run before each test file
// Add any global setup for tests here

// Mock Electron-related modules that might cause issues in a test environment
jest.mock('electron', () => {
  const setToolTipMock = jest.fn();
  const setContextMenuMock = jest.fn();
  
  return {
    app: {
      on: jest.fn(),
      whenReady: jest.fn().mockResolvedValue({}),
      quit: jest.fn(),
    },
    BrowserWindow: jest.fn().mockImplementation(() => ({
      loadURL: jest.fn(),
      loadFile: jest.fn(),
      on: jest.fn(),
      webContents: {
        openDevTools: jest.fn(),
      },
      setIcon: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
    })),
    Tray: jest.fn().mockImplementation(() => {
      return {
        setToolTip: setToolTipMock,
        setContextMenu: setContextMenuMock,
        on: jest.fn(),
        popUpContextMenu: jest.fn(),
        setImage: jest.fn(),
        setTemplateImage: jest.fn(),
      };
    }),
    Menu: {
      buildFromTemplate: jest.fn().mockReturnValue({}),
    },
    nativeImage: {
      createFromPath: jest.fn().mockReturnValue({
        setTemplateImage: jest.fn(),
      }),
    },
  };
});

// Mock path and other Node.js modules if needed
jest.mock('node:path', () => {
  const originalPath = jest.requireActual('path');
  return {
    ...originalPath,
    join: jest.fn().mockImplementation((...args) => originalPath.join(...args)),
  };
});

// Mock electron-squirrel-startup
jest.mock('electron-squirrel-startup', () => false);

// Define Vite environment variables for tests
// Use any type assertion for global to avoid TypeScript errors
(global as any).MAIN_WINDOW_VITE_DEV_SERVER_URL = undefined;
(global as any).MAIN_WINDOW_VITE_NAME = 'main_window';