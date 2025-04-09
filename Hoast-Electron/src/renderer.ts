/**
 * This file handles the renderer process logic for the Hoast application.
 * It manages the preferences UI, event handling, and IPC communication with the main process.
 */

import './index.css';
import { AppConfiguration } from './types/configuration';

// Type definitions for our electronAPI provided by the preload script
declare global {
  interface Window {
    electronAPI: {
      // Configuration management
      getConfig: () => Promise<AppConfiguration>;
      updateConfig: (config: Partial<AppConfiguration>) => Promise<{ success: boolean; error?: string }>;
      resetConfig: () => Promise<{ success: boolean; error?: string }>;
      
      // System operations
      flushDNSCache: () => Promise<{ success: boolean; error?: string }>;
      
      // Event listeners
      onShowPreferences: (callback: () => void) => () => void;
      onHostsFileChanged: (callback: (parsedFile: any) => void) => () => void;

      // Directory selection
      selectDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
    };
  }
}

// Store the current configuration
let currentConfig: AppConfiguration;

/**
 * Load configuration and initialize UI
 */
async function loadConfiguration(): Promise<void> {
  try {
    currentConfig = await window.electronAPI.getConfig();
    updateFormWithConfig(currentConfig);
    console.log('Configuration loaded', currentConfig);
  } catch (error) {
    console.error('Failed to load configuration:', error);
    showError('Failed to load configuration. Please try again.');
  }
}

/**
 * Update form fields with the current configuration values
 */
function updateFormWithConfig(config: AppConfiguration): void {
  // General tab
  setCheckboxValue('launchOnStartup', config.startup.launchOnStartup);
  setCheckboxValue('startMinimized', config.startup.startMinimized);
  
  // Hosts File tab
  setCheckboxValue('createBackups', config.hostsFile.createBackups);
  setInputValue('backupDirectory', config.hostsFile.backupDirectory || '');
  setInputValue('maxBackups', config.hostsFile.maxBackups.toString());
  setCheckboxValue('autoReloadOnExternalChanges', config.hostsFile.autoReloadOnExternalChanges);
  
  // UI tab
  setCheckboxValue('groupEntriesByStatus', config.ui.groupEntriesByStatus);
  setCheckboxValue('showConfirmationDialogs', config.ui.showConfirmationDialogs);
  setInputValue('maxEntriesInTrayMenu', config.ui.maxEntriesInTrayMenu.toString());
  
  // System tab
  setCheckboxValue('flushDNSOnChange', config.system.flushDNSOnChange);
  setCheckboxValue('alwaysUseElevatedPermissions', config.system.alwaysUseElevatedPermissions);
}

/**
 * Read form values and build configuration object
 */
function getConfigFromForm(): Partial<AppConfiguration> {
  const config: Partial<AppConfiguration> = {
    startup: {
      launchOnStartup: getCheckboxValue('launchOnStartup'),
      startMinimized: getCheckboxValue('startMinimized')
    },
    hostsFile: {
      createBackups: getCheckboxValue('createBackups'),
      backupDirectory: getInputValue('backupDirectory') || undefined,
      maxBackups: parseInt(getInputValue('maxBackups'), 10),
      autoReloadOnExternalChanges: getCheckboxValue('autoReloadOnExternalChanges')
    },
    ui: {
      groupEntriesByStatus: getCheckboxValue('groupEntriesByStatus'),
      showConfirmationDialogs: getCheckboxValue('showConfirmationDialogs'),
      maxEntriesInTrayMenu: parseInt(getInputValue('maxEntriesInTrayMenu'), 10),
    },
    system: {
      flushDNSOnChange: getCheckboxValue('flushDNSOnChange'),
      alwaysUseElevatedPermissions: getCheckboxValue('alwaysUseElevatedPermissions')
    }
  };
  
  return config;
}

/**
 * Save the form configuration to the main process
 */
async function saveConfiguration(): Promise<void> {
  try {
    const updatedConfig = getConfigFromForm();
    
    // Validate configuration
    if (isNaN(updatedConfig.hostsFile!.maxBackups)) {
      showError('Max backups must be a valid number');
      return;
    }
    
    if (isNaN(updatedConfig.ui!.maxEntriesInTrayMenu)) {
      showError('Max entries in tray menu must be a valid number');
      return;
    }
    
    const result = await window.electronAPI.updateConfig(updatedConfig);
    
    if (result.success) {
      // Reload the config to make sure we have the latest values
      currentConfig = await window.electronAPI.getConfig();
      showSuccess('Preferences saved successfully');
    } else {
      showError(`Failed to save preferences: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error saving configuration:', error);
    showError('Failed to save preferences. Please try again.');
  }
}

/**
 * Reset configuration to defaults
 */
async function resetToDefaults(): Promise<void> {
  if (confirm('Are you sure you want to reset all preferences to default values?')) {
    try {
      const result = await window.electronAPI.resetConfig();
      
      if (result.success) {
        // Reload configuration and update form
        currentConfig = await window.electronAPI.getConfig();
        updateFormWithConfig(currentConfig);
        showSuccess('Preferences reset to defaults');
      } else {
        showError(`Failed to reset preferences: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error resetting configuration:', error);
      showError('Failed to reset preferences. Please try again.');
    }
  }
}

/**
 * Flush DNS cache
 */
async function flushDNS(): Promise<void> {
  try {
    const flushButton = document.getElementById('flushDNSButton') as HTMLButtonElement;
    if (flushButton) {
      flushButton.disabled = true;
      flushButton.textContent = 'Flushing...';
    }
    
    const result = await window.electronAPI.flushDNSCache();
    
    if (flushButton) {
      flushButton.disabled = false;
      flushButton.textContent = 'Flush DNS Cache Now';
    }
    
    if (result.success) {
      showSuccess('DNS cache flushed successfully');
    } else {
      showError(`Failed to flush DNS cache: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error flushing DNS:', error);
    showError('Failed to flush DNS cache. Please try again.');
    
    const flushButton = document.getElementById('flushDNSButton') as HTMLButtonElement;
    if (flushButton) {
      flushButton.disabled = false;
      flushButton.textContent = 'Flush DNS Cache Now';
    }
  }
}

/**
 * Show file picker for backup directory
 */
async function selectBackupDirectory(): Promise<void> {
  try {
    const result = await window.electronAPI.selectDirectory();
    if (result && !result.canceled && result.filePaths && result.filePaths[0]) {
      // Update the input field with selected directory
      setInputValue('backupDirectory', result.filePaths[0]);
    }
  } catch (error) {
    console.error('Error selecting directory:', error);
    showError('Failed to select directory. Please try again.');
  }
}

/**
 * Initialize tab navigation
 */
function initTabs(): void {
  const tabButtons = document.querySelectorAll('.tab-button');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
      });
      
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      // Add active class to clicked tab and its content
      button.classList.add('active');
      const tabName = button.getAttribute('data-tab');
      if (tabName) {
        const tabContent = document.getElementById(`${tabName}-tab`);
        if (tabContent) {
          tabContent.classList.add('active');
        }
      }
    });
  });
}

/**
 * Initialize event listeners
 */
function initEventListeners(): void {
  // Save button
  const saveButton = document.getElementById('saveButton');
  if (saveButton) {
    saveButton.addEventListener('click', saveConfiguration);
  }
  
  // Cancel button
  const cancelButton = document.getElementById('cancelButton');
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      // Reload the original configuration to revert unsaved changes
      updateFormWithConfig(currentConfig);
    });
  }
  
  // Reset to defaults button
  const resetButton = document.getElementById('resetToDefaults');
  if (resetButton) {
    resetButton.addEventListener('click', resetToDefaults);
  }
  
  // Flush DNS button
  const flushDNSButton = document.getElementById('flushDNSButton');
  if (flushDNSButton) {
    flushDNSButton.addEventListener('click', flushDNS);
  }
  
  // Select backup directory button
  const selectBackupDirButton = document.getElementById('selectBackupDir');
  if (selectBackupDirButton) {
    selectBackupDirButton.addEventListener('click', selectBackupDirectory);
  }
  
  // Listen for show preferences event from main process
  const unregisterShowPreferences = window.electronAPI.onShowPreferences(() => {
    console.log('Show preferences event received');
    // Make sure we have the latest config when the preferences window is shown
    loadConfiguration();
  });
  
  // Clean up event listeners on unload
  window.addEventListener('unload', () => {
    unregisterShowPreferences();
  });
}

/**
 * Helper functions for form handling
 */
function getCheckboxValue(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.checked : false;
}

function setCheckboxValue(id: string, value: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) {
    el.checked = value;
  }
}

function getInputValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.value : '';
}

function setInputValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) {
    el.value = value;
  }
}

/**
 * Display notification messages
 */
function showSuccess(message: string): void {
  // Simple implementation - can be enhanced with actual UI toast/notification
  console.log('Success:', message);
  alert(message);
}

function showError(message: string): void {
  // Simple implementation - can be enhanced with actual UI error display
  console.error('Error:', message);
  alert(`Error: ${message}`);
}

/**
 * Initialize the app when the DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Preferences window initialized');
  
  initTabs();
  initEventListeners();
  await loadConfiguration();
});
