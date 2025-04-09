import { setupAutoLaunch } from '../src/main';
import AutoLaunch from 'auto-launch';
import { AppConfiguration } from '../src/types/configuration';

// Mock the auto-launch package
jest.mock('auto-launch');

describe('Auto Launch', () => {
  let mockAutoLaunchInstance: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup AutoLaunch mock implementation
    mockAutoLaunchInstance = {
      isEnabled: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
    };
    
    (AutoLaunch as jest.Mock).mockImplementation(() => mockAutoLaunchInstance);
  });
  
  // Helper to create a complete mock configuration
  function createMockConfig(launchOnStartup: boolean, startMinimized: boolean): AppConfiguration {
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      startup: {
        launchOnStartup,
        startMinimized
      },
      hostsFile: {
        createBackups: true,
        maxBackups: 10,
        autoReloadOnExternalChanges: true
      },
      ui: {
        groupEntriesByStatus: true,
        showConfirmationDialogs: true,
        maxEntriesInTrayMenu: 10
      },
      system: {
        flushDNSOnChange: false,
        alwaysUseElevatedPermissions: false
      }
    };
  }
  
  it('should enable auto-launch when setting is enabled but not currently enabled', async () => {
    // Mock app configuration
    const mockAppConfig = createMockConfig(true, true);
    
    // Mock isEnabled to return false (not currently enabled)
    mockAutoLaunchInstance.isEnabled.mockResolvedValue(false);
    
    // Call the function
    await setupAutoLaunch(mockAppConfig);
    
    // Check if AutoLaunch was constructed with correct params
    expect(AutoLaunch).toHaveBeenCalledWith({
      name: expect.any(String),
      path: expect.any(String),
      isHidden: true
    });
    
    // Check if enable was called
    expect(mockAutoLaunchInstance.enable).toHaveBeenCalled();
    // Check that disable was not called
    expect(mockAutoLaunchInstance.disable).not.toHaveBeenCalled();
  });
  
  it('should disable auto-launch when setting is disabled but currently enabled', async () => {
    // Mock app configuration
    const mockAppConfig = createMockConfig(false, false);
    
    // Mock isEnabled to return true (currently enabled)
    mockAutoLaunchInstance.isEnabled.mockResolvedValue(true);
    
    // Call the function
    await setupAutoLaunch(mockAppConfig);
    
    // Check if AutoLaunch was constructed with correct params
    expect(AutoLaunch).toHaveBeenCalledWith({
      name: expect.any(String),
      path: expect.any(String),
      isHidden: false
    });
    
    // Check that enable was not called
    expect(mockAutoLaunchInstance.enable).not.toHaveBeenCalled();
    // Check if disable was called
    expect(mockAutoLaunchInstance.disable).toHaveBeenCalled();
  });
  
  it('should do nothing when auto-launch setting matches current state', async () => {
    // Case 1: Both enabled
    let mockAppConfig = createMockConfig(true, true);
    
    // Mock isEnabled to return true (already enabled)
    mockAutoLaunchInstance.isEnabled.mockResolvedValue(true);
    
    // Call the function
    await setupAutoLaunch(mockAppConfig);
    
    // Check that neither enable nor disable was called
    expect(mockAutoLaunchInstance.enable).not.toHaveBeenCalled();
    expect(mockAutoLaunchInstance.disable).not.toHaveBeenCalled();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Case 2: Both disabled
    mockAppConfig = createMockConfig(false, false);
    
    // Mock isEnabled to return false (already disabled)
    mockAutoLaunchInstance.isEnabled.mockResolvedValue(false);
    
    // Call the function again
    await setupAutoLaunch(mockAppConfig);
    
    // Check that neither enable nor disable was called
    expect(mockAutoLaunchInstance.enable).not.toHaveBeenCalled();
    expect(mockAutoLaunchInstance.disable).not.toHaveBeenCalled();
  });
  
  it('should handle errors gracefully', async () => {
    // Mock app configuration
    const mockAppConfig = createMockConfig(true, true);
    
    // Mock isEnabled to throw an error
    const errorMsg = 'Auto-launch error';
    mockAutoLaunchInstance.isEnabled.mockRejectedValue(new Error(errorMsg));
    
    // Mock console.error
    const consoleSpy = jest.spyOn(console, 'error');
    
    // Call the function - should not throw
    await expect(setupAutoLaunch(mockAppConfig)).resolves.not.toThrow();
    
    // Check that the error was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to configure auto-launch:', 
      expect.objectContaining({
        message: errorMsg
      })
    );
    
    // Restore console.error
    consoleSpy.mockRestore();
  });
});