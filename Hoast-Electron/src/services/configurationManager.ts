import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { AppConfiguration } from '../types/configuration';

/**
 * Configuration manager events
 */
export enum ConfigManagerEvent {
  /** Emitted when configuration is loaded */
  LOADED = 'loaded',
  /** Emitted when configuration is saved */
  SAVED = 'saved',
  /** Emitted when configuration is changed */
  CHANGED = 'changed',
  /** Emitted when an error occurs */
  ERROR = 'error'
}

/**
 * Manages application configuration and user preferences
 */
export class ConfigurationManager extends EventEmitter {
  /** Path to the configuration file */
  private configFilePath: string;
  /** Current configuration */
  private config: AppConfiguration;
  /** Whether the configuration has been loaded */
  private isLoaded: boolean = false;
  /** Default configuration values */
  private static readonly DEFAULT_CONFIG: AppConfiguration = {
    version: app.getVersion(),
    lastUpdated: new Date().toISOString(),
    startup: {
      launchOnStartup: false,
      startMinimized: true,
    },
    hostsFile: {
      createBackups: true,
      maxBackups: 10,
      autoReloadOnExternalChanges: true,
    },
    groups: {
      enabled: true,
      expandGroupsByDefault: false,
      autoGroupByPatterns: true,
    },
    ui: {
      groupEntriesByStatus: true,
      showConfirmationDialogs: true,
      maxEntriesInTrayMenu: 10,
    },
    system: {
      flushDNSOnChange: false,
      alwaysUseElevatedPermissions: false,
    }
  };

  /**
   * Creates a new configuration manager
   * @param configFilename Optional custom filename for the config file
   */
  constructor(configFilename: string = 'config.json') {
    super();
    this.configFilePath = path.join(app.getPath('userData'), configFilename);
    this.config = this.deepCopy(ConfigurationManager.DEFAULT_CONFIG);
  }

  /**
   * Loads the configuration from disk
   * @returns Promise that resolves with the loaded configuration
   */
  async loadConfig(): Promise<AppConfiguration> {
    try {
      // Check if config file exists
      if (fs.existsSync(this.configFilePath)) {
        let fileContent: string;
        try {
          fileContent = await fs.promises.readFile(this.configFilePath, 'utf-8');
        } catch (readError) {
          this.emit(ConfigManagerEvent.ERROR, readError);
          this.config = this.deepCopy(ConfigurationManager.DEFAULT_CONFIG);
          this.isLoaded = true;
          return this.config;
        }
        
        // Try to parse JSON, but fallback to defaults if it fails
        let loadedConfig: Partial<AppConfiguration>;
        try {
          loadedConfig = JSON.parse(fileContent);
        } catch (parseError) {
          // JSON parsing failed, emit error but continue with defaults
          this.emit(ConfigManagerEvent.ERROR, parseError);
          this.config = this.deepCopy(ConfigurationManager.DEFAULT_CONFIG);
          this.isLoaded = true;
          return this.config;
        }
        
        // Merge with defaults to ensure all properties exist
        this.config = this.mergeWithDefaults(loadedConfig);
        this.isLoaded = true;
        this.emit(ConfigManagerEvent.LOADED, this.config);
        return this.config;
      } else {
        // Config file doesn't exist, create with defaults
        this.config = this.deepCopy(ConfigurationManager.DEFAULT_CONFIG);
        this.isLoaded = true;
        await this.saveConfig();
        return this.config;
      }
    } catch (error) {
      this.emit(ConfigManagerEvent.ERROR, error);
      // Fall back to default config
      this.config = this.deepCopy(ConfigurationManager.DEFAULT_CONFIG);
      this.isLoaded = true;
      return this.config;
    }
  }

  /**
   * Saves the current configuration to disk
   * @returns Promise that resolves when the configuration is saved
   */
  async saveConfig(): Promise<void> {
    try {
      // Update the lastUpdated timestamp
      this.config.lastUpdated = new Date().toISOString();
      
      // Ensure the directory exists
      const configDir = path.dirname(this.configFilePath);
      await fs.promises.mkdir(configDir, { recursive: true });
      
      // Write the config file
      await fs.promises.writeFile(
        this.configFilePath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
      
      this.emit(ConfigManagerEvent.SAVED, this.config);
    } catch (error) {
      this.emit(ConfigManagerEvent.ERROR, error);
      throw error;
    }
  }

  /**
   * Updates specific configuration values
   * @param partialConfig Partial configuration to update
   * @param saveImmediately Whether to save the changes to disk immediately
   * @returns Promise that resolves when the update is complete
   */
  async updateConfig(
    partialConfig: Partial<AppConfiguration>,
    saveImmediately: boolean = true
  ): Promise<AppConfiguration> {
    // Make sure config is loaded
    if (!this.isLoaded) {
      await this.loadConfig();
    }
    
    // Deep merge the partial config with the current config
    this.config = this.deepMerge(this.config, partialConfig);
    
    // Emit change event
    this.emit(ConfigManagerEvent.CHANGED, this.config);
    
    // Save if requested
    if (saveImmediately) {
      await this.saveConfig();
    }
    
    return this.config;
  }

  /**
   * Gets the current configuration
   * @returns The current configuration
   */
  getConfig(): AppConfiguration {
    // Create a deep copy to prevent external modifications
    return this.deepCopy(this.config);
  }

  /**
   * Resets the configuration to defaults
   * @param saveImmediately Whether to save the changes to disk immediately
   * @returns Promise that resolves when the reset is complete
   */
  async resetToDefaults(saveImmediately: boolean = true): Promise<AppConfiguration> {
    this.config = this.deepCopy(ConfigurationManager.DEFAULT_CONFIG);
    this.emit(ConfigManagerEvent.CHANGED, this.config);
    
    if (saveImmediately) {
      await this.saveConfig();
    }
    
    return this.config;
  }

  /**
   * Apply app version updates to configuration
   * This should be called when the app is updated to ensure configuration
   * is compatible with the new version
   */
  async applyVersionUpdates(): Promise<void> {
    const currentVersion = app.getVersion();
    if (this.config.version !== currentVersion) {
      // Version has changed, perform any necessary migrations
      
      // Currently, we just update the version
      this.config.version = currentVersion;
      await this.saveConfig();
    }
  }

  /**
   * Get the configuration file path
   * @returns Path to the configuration file
   */
  getConfigFilePath(): string {
    return this.configFilePath;
  }

  /**
   * Merges loaded config with default values to ensure all required properties exist
   * @param loaded The loaded configuration
   * @returns Merged configuration
   */
  private mergeWithDefaults(loaded: Partial<AppConfiguration>): AppConfiguration {
    // Start with a copy of the defaults
    const defaults = this.deepCopy(ConfigurationManager.DEFAULT_CONFIG);
    
    // Return a deep merge of defaults with loaded values
    return this.deepMerge(defaults, loaded);
  }

  /**
   * Create a deep copy of an object
   * @param obj The object to copy
   * @returns A deep copy of the object
   */
  private deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
  }

  /**
   * Deep merge two objects
   * @param target Target object
   * @param source Source object to merge into target
   * @returns Merged object
   */
  private deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const output = { ...target } as { [key: string]: any };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        const sourceValue = source[key as keyof typeof source];
        const targetValue = target[key as keyof typeof target];
        
        if (this.isObject(sourceValue)) {
          if (!(key in target)) {
            output[key] = this.deepCopy(sourceValue);
          } else {
            output[key] = this.deepMerge(
              targetValue as Record<string, any>, 
              sourceValue as Record<string, any>
            );
          }
        } else {
          output[key] = sourceValue;
        }
      });
    }

    return output as T;
  }

  /**
   * Checks if a value is an object
   * @param item The item to check
   * @returns Whether the item is an object
   */
  private isObject(item: any): item is Record<string, any> {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}