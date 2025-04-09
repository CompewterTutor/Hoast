import * as path from 'node:path';
import { ConfigurationManager, ConfigManagerEvent } from '../src/services/configurationManager';
import { AppConfiguration } from '../src/types/configuration';

// Mock fs module
jest.mock('node:fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  },
  existsSync: jest.fn(),
}));

// Import fs after mocking
const fs = jest.requireMock('node:fs');

// Mock electron
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/mock/user/data'),
    getVersion: jest.fn().mockReturnValue('1.0.0'),
  },
}));

// Create a test-specific version of ConfigurationManager
class TestConfigManager extends ConfigurationManager {
  constructor(configFilename = 'config.json') {
    super(configFilename);
    // Override the configFilePath after the parent constructor is called
    Object.defineProperty(this, 'configFilePath', {
      value: `/mock/user/data/${configFilename}`,
      writable: true,
    });
  }
}

describe('ConfigurationManager', () => {
  // Mock configuration data
  const mockConfigData: AppConfiguration = {
    version: '1.0.0',
    lastUpdated: '2025-04-09T00:00:00.000Z',
    startup: {
      launchOnStartup: true,
      startMinimized: false,
    },
    hostsFile: {
      createBackups: true,
      maxBackups: 5,
      autoReloadOnExternalChanges: true,
    },
    ui: {
      groupEntriesByStatus: false,
      showConfirmationDialogs: true,
      maxEntriesInTrayMenu: 15,
    },
    system: {
      flushDNSOnChange: true,
      alwaysUseElevatedPermissions: false,
    }
  };

  const mockConfigFilePath = '/mock/user/data/config.json';
  const mockCustomConfigFilePath = '/mock/user/data/custom-config.json';

  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Mock fs.promises.readFile
    fs.promises.readFile.mockResolvedValue(JSON.stringify(mockConfigData));
    
    // Mock fs.promises.writeFile
    fs.promises.writeFile.mockResolvedValue(undefined);
    
    // Mock fs.promises.mkdir
    fs.promises.mkdir.mockResolvedValue(undefined);
    
    // Mock fs.existsSync
    fs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with default values', () => {
    const configManager = new TestConfigManager();
    const config = configManager.getConfig();
    
    expect(config).toBeDefined();
    expect(config.version).toBe('1.0.0');
    expect(config.startup.launchOnStartup).toBe(false);
    expect(config.startup.startMinimized).toBe(true);
    expect(config.hostsFile.createBackups).toBe(true);
    expect(config.hostsFile.maxBackups).toBe(10);
    expect(config.ui.groupEntriesByStatus).toBe(true);
    expect(config.ui.maxEntriesInTrayMenu).toBe(10);
  });

  it('should load configuration from disk', async () => {
    const configManager = new TestConfigManager();
    const loadedConfig = await configManager.loadConfig();
    
    expect(fs.existsSync).toHaveBeenCalledWith(mockConfigFilePath);
    expect(fs.promises.readFile).toHaveBeenCalledWith(mockConfigFilePath, 'utf-8');
    expect(loadedConfig).toEqual(mockConfigData);
  });

  it('should create default configuration if file does not exist', async () => {
    // Mock that file doesn't exist
    fs.existsSync.mockReturnValue(false);
    
    const configManager = new TestConfigManager();
    const configSpy = jest.spyOn(configManager, 'saveConfig');
    
    await configManager.loadConfig();
    
    expect(configSpy).toHaveBeenCalled();
  });

  it('should handle file read errors gracefully', async () => {
    // Mock read error
    fs.promises.readFile.mockRejectedValue(new Error('Read error'));
    
    const configManager = new TestConfigManager();
    const errorHandler = jest.fn();
    configManager.on(ConfigManagerEvent.ERROR, errorHandler);
    
    const config = await configManager.loadConfig();
    
    expect(errorHandler).toHaveBeenCalled();
    expect(config).toBeDefined(); // Should fall back to defaults
    expect(config.version).toBe('1.0.0');
  });

  it('should handle JSON parsing errors gracefully', async () => {
    // Mock invalid JSON
    fs.promises.readFile.mockResolvedValue('invalid json');
    
    const configManager = new TestConfigManager();
    const errorHandler = jest.fn();
    configManager.on(ConfigManagerEvent.ERROR, errorHandler);
    
    const config = await configManager.loadConfig();
    
    expect(errorHandler).toHaveBeenCalled();
    expect(config).toBeDefined(); // Should fall back to defaults
    expect(config.version).toBe('1.0.0');
  });

  it('should save configuration to disk', async () => {
    const configManager = new TestConfigManager();
    await configManager.loadConfig();
    await configManager.saveConfig();
    
    expect(fs.promises.mkdir).toHaveBeenCalled();
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      mockConfigFilePath,
      expect.any(String),
      'utf-8'
    );
  });

  it('should handle save errors', async () => {
    // Mock write error
    fs.promises.writeFile.mockRejectedValue(new Error('Write error'));
    
    const configManager = new TestConfigManager();
    const errorHandler = jest.fn();
    configManager.on(ConfigManagerEvent.ERROR, errorHandler);
    
    await expect(configManager.saveConfig()).rejects.toThrow('Write error');
    expect(errorHandler).toHaveBeenCalled();
  });

  it('should update configuration values', async () => {
    const configManager = new TestConfigManager();
    await configManager.loadConfig();
    
    const partialConfig = {
      startup: {
        launchOnStartup: true,
        startMinimized: false,
      },
      ui: {
        maxEntriesInTrayMenu: 20,
        groupEntriesByStatus: true,
        showConfirmationDialogs: true
      },
    };
    
    const updatedConfig = await configManager.updateConfig(partialConfig);
    
    expect(updatedConfig.startup.launchOnStartup).toBe(true);
    expect(updatedConfig.ui.maxEntriesInTrayMenu).toBe(20);
    // Should preserve other values
    expect(updatedConfig.hostsFile.createBackups).toBe(mockConfigData.hostsFile.createBackups);
    
    // Should save by default
    expect(fs.promises.writeFile).toHaveBeenCalled();
  });

  it('should update without saving if specified', async () => {
    const configManager = new TestConfigManager();
    await configManager.loadConfig();
    
    const partialConfig = {
      ui: {
        maxEntriesInTrayMenu: 25,
        groupEntriesByStatus: true,
        showConfirmationDialogs: true
      },
    };
    
    await configManager.updateConfig(partialConfig, false);
    
    // Should not save
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });

  it('should emit change events when updating', async () => {
    const configManager = new TestConfigManager();
    await configManager.loadConfig();
    
    const changeHandler = jest.fn();
    configManager.on(ConfigManagerEvent.CHANGED, changeHandler);
    
    await configManager.updateConfig({
      ui: { 
        maxEntriesInTrayMenu: 30,
        groupEntriesByStatus: true,
        showConfirmationDialogs: true
      }
    }, false);
    
    expect(changeHandler).toHaveBeenCalled();
  });

  it('should reset to defaults', async () => {
    const configManager = new TestConfigManager();
    await configManager.loadConfig();
    
    // First update to non-default values
    await configManager.updateConfig({
      startup: { 
        launchOnStartup: true,
        startMinimized: false
      },
      ui: { 
        maxEntriesInTrayMenu: 30,
        groupEntriesByStatus: true,
        showConfirmationDialogs: true 
      },
    }, false);
    
    // Then reset
    const resetConfig = await configManager.resetToDefaults();
    
    expect(resetConfig.startup.launchOnStartup).toBe(false);
    expect(resetConfig.ui.maxEntriesInTrayMenu).toBe(10);
    
    // Should save by default
    expect(fs.promises.writeFile).toHaveBeenCalled();
  });

  it('should emit change events when resetting', async () => {
    const configManager = new TestConfigManager();
    await configManager.loadConfig();
    
    const changeHandler = jest.fn();
    configManager.on(ConfigManagerEvent.CHANGED, changeHandler);
    
    await configManager.resetToDefaults(false);
    
    expect(changeHandler).toHaveBeenCalled();
  });

  it('should apply version updates', async () => {
    // Create a mock electron app.getVersion that will be used by the ConfigurationManager
    const mockElectron = jest.requireMock('electron');
    mockElectron.app.getVersion.mockReturnValue('1.0.0');
    
    const configManager = new TestConfigManager();
    await configManager.loadConfig();
    
    // Set an old version in the internal config
    await configManager.updateConfig({ version: '0.9.0' }, false);
    
    await configManager.applyVersionUpdates();
    
    // Should update the version to match the app version
    const updatedConfig = configManager.getConfig();
    expect(updatedConfig.version).toBe('1.0.0');
    
    // Should save the changes
    expect(fs.promises.writeFile).toHaveBeenCalled();
  });

  it('should correctly get config file path', () => {
    const configManager = new TestConfigManager('custom-config.json');
    expect(configManager.getConfigFilePath()).toBe('/mock/user/data/custom-config.json');
  });

  it('should correctly merge with defaults', async () => {
    // Create a partial config with only some properties
    const partialConfig = {
      startup: {
        launchOnStartup: true,
        startMinimized: false,
      },
      // Missing hostsFile and ui sections
      system: {
        flushDNSOnChange: true,
        alwaysUseElevatedPermissions: false,
      },
    };
    
    // Mock read to return partial config
    fs.promises.readFile.mockResolvedValue(JSON.stringify(partialConfig));
    
    const configManager = new TestConfigManager();
    const loadedConfig = await configManager.loadConfig();
    
    // Should have merged with defaults
    expect(loadedConfig.startup.launchOnStartup).toBe(true); // From partial
    expect(loadedConfig.hostsFile).toBeDefined(); // From defaults
    expect(loadedConfig.hostsFile.createBackups).toBe(true); // From defaults
    expect(loadedConfig.system.flushDNSOnChange).toBe(true); // From partial
    expect(loadedConfig.system.alwaysUseElevatedPermissions).toBe(false); // From partial
  });
});