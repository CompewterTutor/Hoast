/**
 * Types for application configuration and preferences
 */

/**
 * Application startup preferences
 */
export interface StartupPreferences {
  /** Whether to launch the app on system startup */
  launchOnStartup: boolean;
  /** Whether to start minimized to tray */
  startMinimized: boolean;
}

/**
 * Hosts file operation preferences
 */
export interface HostsFilePreferences {
  /** Whether to create backups before modifying hosts file */
  createBackups: boolean;
  /** Directory to store backups in (if not specified, uses app data directory) */
  backupDirectory?: string;
  /** Maximum number of backup files to keep */
  maxBackups: number;
  /** Whether to reload immediately after external changes */
  autoReloadOnExternalChanges: boolean;
}

/**
 * Group-related preferences
 */
export interface GroupPreferences {
  /** Whether to enable host entry grouping feature */
  enabled: boolean;
  /** Whether to expand all groups by default in the tray menu */
  expandGroupsByDefault: boolean;
  /** Whether to automatically assign entries to groups based on hostname patterns */
  autoGroupByPatterns: boolean;
}

/**
 * UI display preferences
 */
export interface UIPreferences {
  /** Whether to group host entries by status (enabled/disabled) */
  groupEntriesByStatus: boolean;
  /** Whether to show confirmation dialogs for destructive actions */
  showConfirmationDialogs: boolean;
  /** Maximum number of entries to show in the tray menu */
  maxEntriesInTrayMenu: number;
}

/**
 * System integration preferences
 */
export interface SystemPreferences {
  /** Whether to flush DNS cache after hosts file changes */
  flushDNSOnChange: boolean;
  /** Whether to run with elevated permissions */
  alwaysUseElevatedPermissions: boolean;
}

/**
 * Complete application configuration
 */
export interface AppConfiguration {
  /** Application version when the config was last updated */
  version: string;
  /** When the configuration was last updated */
  lastUpdated: string;
  /** Startup preferences */
  startup: StartupPreferences;
  /** Hosts file operation preferences */
  hostsFile: HostsFilePreferences;
  /** Group-related preferences */
  groups: GroupPreferences;
  /** UI display preferences */
  ui: UIPreferences;
  /** System integration preferences */
  system: SystemPreferences;
}