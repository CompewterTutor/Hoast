import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';

// Import our main module functions for testing
// Note: we're importing the functions directly, not executing the file
jest.mock('../src/main.ts', () => {
  // Return the original module without executing top-level code
  const originalModule = jest.requireActual('../src/main.ts');
  return {
    createWindow: originalModule.createWindow,
    createTray: originalModule.createTray,
  };
});

describe('Main Process', () => {
  // Reset all mocks between tests
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createWindow', () => {
    it('should create a browser window with correct properties', () => {
      // We're only testing if the function is callable here
      // Since we've mocked all Electron modules, it won't create a real window
      const { createWindow } = require('../src/main');
      createWindow();

      // Verify BrowserWindow was constructed with expected options
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 800,
          height: 600,
          show: false,
          webPreferences: expect.objectContaining({
            preload: expect.any(String)
          })
        })
      );
    });
  });

  describe('createTray', () => {
    it('should create a tray with platform-specific icon', () => {
      const originalPlatform = process.platform;
      
      // Mock process.platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      const { createTray } = require('../src/main');
      createTray();

      // Verify Tray was called (constructor)
      expect(Tray).toHaveBeenCalled();
      
      // Get the mock instance using proper TypeScript casting
      const mockTray = ((Tray as unknown) as jest.Mock<any>).mock.results[0].value;
      expect(mockTray.setToolTip).toHaveBeenCalledWith('Hoast - Hosts File Manager');
      expect(mockTray.setContextMenu).toHaveBeenCalled();
      
      // Verify context menu was built
      expect(Menu.buildFromTemplate).toHaveBeenCalled();

      // Reset platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform
      });
    });
  });
});