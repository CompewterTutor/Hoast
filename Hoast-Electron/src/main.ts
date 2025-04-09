import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { HostsFileWriter } from './services/hostsFileWriter';
import { ParsedHostsFile, HostEntry } from './types/hostsFile';
import { HostsFileParser } from './services/hostsFileParser';
import { HostsFileWatcher, HostsFileWatcherEvent } from './services/hostsFileWatcher';
import { ConfigurationManager } from './services/configurationManager';
import { AppConfiguration } from './types/configuration';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Keep a global reference of objects to avoid garbage collection
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const hostsFileWriter = new HostsFileWriter();
const hostsFileParser = new HostsFileParser();
let hostsFileWatcher: HostsFileWatcher | null = null;
let parsedHostsFile: ParsedHostsFile | null = null;
let configManager: ConfigurationManager = new ConfigurationManager();
let appConfig: AppConfiguration;

export const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Hide window initially as we're making a tray app
    icon: path.join(__dirname, '../assets/icons/icon.ico'), // Set app window icon
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Don't show the window when it's ready, we're using a tray app
  // mainWindow.webContents.openDevTools();
  
  // Hide the window when it's closed instead of quitting the app
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow?.hide();
    return false;
  });
};

export const createTray = () => {
  // Choose appropriate icon based on platform
  if (process.platform === 'darwin') {
    // Use template image for macOS (supports dark/light mode)
    const iconPath = path.join(__dirname, '../assets/icons/16x16.png');
    const macIcon = nativeImage.createFromPath(iconPath);
    macIcon.setTemplateImage(true); // Template image support for macOS dark/light modes
    tray = new Tray(macIcon);
  } else if (process.platform === 'win32') {
    // Use ICO for Windows
    const iconPath = path.join(__dirname, '../assets/icons/icon.ico');
    tray = new Tray(iconPath);
  } else {
    // Use PNG for Linux and other platforms
    const iconPath = path.join(__dirname, '../assets/icons/48x48.png');
    tray = new Tray(iconPath);
  }

  tray.setToolTip('Hoast - Hosts File Manager');

  // Create the tray menu
  updateTrayMenu();

  // Add a click handler to show/hide the main window on click (macOS convention)
  if (process.platform === 'darwin') {
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      }
    });
  }
};

/**
 * Update the tray menu to reflect current hosts file entries
 */
function updateTrayMenu(): void {
  if (!tray) return;
  
  // Create the menu items array
  const menuItems: Electron.MenuItemConstructorOptions[] = [
    { 
      label: 'Hoast - Hosts File Manager',
      enabled: false, 
      type: 'normal' 
    },
    { 
      type: 'separator' 
    }
  ];
  
  // Add menu items for each host entry (limit to a reasonable number to avoid cluttering)
  if (parsedHostsFile?.entries && parsedHostsFile.entries.length > 0) {
    // Group entries based on user preference
    const maxDisplayEntries = appConfig?.ui?.maxEntriesInTrayMenu || 10;
    const shouldGroupByStatus = appConfig?.ui?.groupEntriesByStatus !== false;
    
    if (shouldGroupByStatus) {
      // Group entries by enabled/disabled status
      const enabledEntries = parsedHostsFile.entries.filter(entry => entry.enabled);
      const disabledEntries = parsedHostsFile.entries.filter(entry => !entry.enabled);
      
      // Add enabled entries
      if (enabledEntries.length > 0) {
        menuItems.push({ 
          label: 'Enabled Entries',
          enabled: false,
          type: 'normal'
        });
        
        enabledEntries.slice(0, maxDisplayEntries).forEach(entry => {
          menuItems.push({
            label: `✅ ${entry.hostname}`,
            submenu: [
              {
                label: `IP: ${entry.ip}`,
                enabled: false
              },
              { type: 'separator' },
              {
                label: 'Disable',
                click: async () => {
                  await toggleHostEntryWithPermissions(parsedHostsFile!, entry.lineNumber);
                  // Reload hosts file and update menu after toggle
                  parsedHostsFile = await hostsFileParser.parseHostsFile();
                  updateTrayMenu();
                }
              },
              {
                label: 'Remove',
                click: async () => {
                  // Only show confirmation if user has it enabled
                  if (appConfig?.ui?.showConfirmationDialogs !== false) {
                    const { response } = await dialog.showMessageBox({
                      type: 'question',
                      buttons: ['Cancel', 'Remove'],
                      defaultId: 0,
                      title: 'Confirm Removal',
                      message: `Are you sure you want to remove "${entry.hostname}" from your hosts file?`
                    });
                    
                    if (response !== 1) return; // 1 = Remove button
                  }
                  
                  await removeHostEntryWithPermissions(parsedHostsFile!, entry.lineNumber);
                  // Reload hosts file and update menu after removal
                  parsedHostsFile = await hostsFileParser.parseHostsFile();
                  updateTrayMenu();
                }
              }
            ]
          });
        });
        
        // Show how many more are hidden if we're limiting the display
        if (enabledEntries.length > maxDisplayEntries) {
          menuItems.push({
            label: `... and ${enabledEntries.length - maxDisplayEntries} more enabled entries`,
            enabled: false
          });
        }
        
        menuItems.push({ type: 'separator' });
      }
      
      // Add disabled entries
      if (disabledEntries.length > 0) {
        menuItems.push({ 
          label: 'Disabled Entries',
          enabled: false,
          type: 'normal'
        });
        
        disabledEntries.slice(0, maxDisplayEntries).forEach(entry => {
          menuItems.push({
            label: `❌ ${entry.hostname}`,
            submenu: [
              {
                label: `IP: ${entry.ip}`,
                enabled: false
              },
              { type: 'separator' },
              {
                label: 'Enable',
                click: async () => {
                  await toggleHostEntryWithPermissions(parsedHostsFile!, entry.lineNumber);
                  // Reload hosts file and update menu after toggle
                  parsedHostsFile = await hostsFileParser.parseHostsFile();
                  updateTrayMenu();
                }
              },
              {
                label: 'Remove',
                click: async () => {
                  // Only show confirmation if user has it enabled
                  if (appConfig?.ui?.showConfirmationDialogs !== false) {
                    const { response } = await dialog.showMessageBox({
                      type: 'question',
                      buttons: ['Cancel', 'Remove'],
                      defaultId: 0,
                      title: 'Confirm Removal',
                      message: `Are you sure you want to remove "${entry.hostname}" from your hosts file?`
                    });
                    
                    if (response !== 1) return; // 1 = Remove button
                  }
                  
                  await removeHostEntryWithPermissions(parsedHostsFile!, entry.lineNumber);
                  // Reload hosts file and update menu after removal
                  parsedHostsFile = await hostsFileParser.parseHostsFile();
                  updateTrayMenu();
                }
              }
            ]
          });
        });
        
        // Show how many more are hidden if we're limiting the display
        if (disabledEntries.length > maxDisplayEntries) {
          menuItems.push({
            label: `... and ${disabledEntries.length - maxDisplayEntries} more disabled entries`,
            enabled: false
          });
        }
      }
    } else {
      // Don't group, just show all entries in order
      const allEntries = parsedHostsFile.entries;
      
      allEntries.slice(0, maxDisplayEntries).forEach(entry => {
        const statusIcon = entry.enabled ? '✅' : '❌';
        menuItems.push({
          label: `${statusIcon} ${entry.hostname}`,
          submenu: [
            {
              label: `IP: ${entry.ip}`,
              enabled: false
            },
            { type: 'separator' },
            {
              label: entry.enabled ? 'Disable' : 'Enable',
              click: async () => {
                await toggleHostEntryWithPermissions(parsedHostsFile!, entry.lineNumber);
                // Reload hosts file and update menu after toggle
                parsedHostsFile = await hostsFileParser.parseHostsFile();
                updateTrayMenu();
              }
            },
            {
              label: 'Remove',
              click: async () => {
                // Only show confirmation if user has it enabled
                if (appConfig?.ui?.showConfirmationDialogs !== false) {
                  const { response } = await dialog.showMessageBox({
                    type: 'question',
                    buttons: ['Cancel', 'Remove'],
                    defaultId: 0,
                    title: 'Confirm Removal',
                    message: `Are you sure you want to remove "${entry.hostname}" from your hosts file?`
                  });
                  
                  if (response !== 1) return; // 1 = Remove button
                }
                
                await removeHostEntryWithPermissions(parsedHostsFile!, entry.lineNumber);
                // Reload hosts file and update menu after removal
                parsedHostsFile = await hostsFileParser.parseHostsFile();
                updateTrayMenu();
              }
            }
          ]
        });
      });
      
      // Show how many more are hidden if we're limiting the display
      if (allEntries.length > maxDisplayEntries) {
        menuItems.push({
          label: `... and ${allEntries.length - maxDisplayEntries} more entries`,
          enabled: false
        });
      }
    }
    
    menuItems.push({ type: 'separator' });
  }
  
  // Add standard menu items
  menuItems.push(
    { 
      label: 'Add New Entry...', 
      click: showAddHostEntryDialog
    },
    { 
      label: 'Refresh Hosts File', 
      click: async () => {
        try {
          parsedHostsFile = await hostsFileParser.parseHostsFile();
          updateTrayMenu();
          if (mainWindow) {
            mainWindow.webContents.send('hosts:file-changed', parsedHostsFile);
          }
        } catch (error) {
          console.error('Error refreshing hosts file:', error);
          dialog.showErrorBox(
            'Error Refreshing',
            `Could not refresh the hosts file: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } 
    },
    { 
      type: 'separator' 
    },
    { 
      label: 'Show Main Window', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      } 
    },
    { 
      label: 'Preferences...', 
      click: () => {
        // Show preferences window
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('menu:show-preferences');
        }
      } 
    },
    { 
      type: 'separator' 
    },
    { 
      label: 'Quit', 
      click: () => {
        app.quit();
      } 
    }
  );
  
  // Update the tray context menu
  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

/**
 * Show a dialog to add a new host entry
 */
async function showAddHostEntryDialog(): Promise<void> {
  if (!parsedHostsFile) return;
  
  // Create a custom input dialog using BrowserWindow
  const inputWindow = new BrowserWindow({
    width: 480,
    height: 380,
    title: 'Add New Host Entry',
    parent: mainWindow || undefined,
    modal: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load a simple form HTML
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">
    <title>Add New Host Entry</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
        padding: 20px;
        color: #333;
      }
      h2 {
        margin-top: 0;
        margin-bottom: 20px;
        font-size: 18px;
      }
      .form-group {
        margin-bottom: 15px;
      }
      label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
      }
      input[type="text"] {
        width: 100%;
        padding: 8px;
        box-sizing: border-box;
        border: 1px solid #ccc;
        border-radius: 4px;
      }
      .checkbox-group {
        margin-top: 10px;
      }
      .buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
      button {
        padding: 8px 16px;
        border-radius: 4px;
        border: none;
        cursor: pointer;
      }
      button.cancel {
        background-color: #f1f1f1;
      }
      button.submit {
        background-color: #0078d4;
        color: white;
      }
      .error {
        color: red;
        font-size: 14px;
        margin-top: 4px;
        display: none;
      }
    </style>
  </head>
  <body>
    <h2>Add New Host Entry</h2>
    <form id="hostEntryForm">
      <div class="form-group">
        <label for="ip">IP Address:</label>
        <input type="text" id="ip" name="ip" placeholder="e.g., 127.0.0.1" required>
        <div id="ipError" class="error">Please enter a valid IP address</div>
      </div>
      <div class="form-group">
        <label for="hostname">Hostname:</label>
        <input type="text" id="hostname" name="hostname" placeholder="e.g., example.local" required>
        <div id="hostnameError" class="error">Please enter a valid hostname</div>
      </div>
      <div class="form-group">
        <label for="aliases">Aliases (optional, space separated):</label>
        <input type="text" id="aliases" name="aliases" placeholder="e.g., www.example.local api.example.local">
        <div id="aliasesError" class="error">Invalid aliases format</div>
      </div>
      <div class="form-group">
        <label for="comment">Comment (optional):</label>
        <input type="text" id="comment" name="comment" placeholder="e.g., Development server">
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="enabled" name="enabled" checked>
        <label for="enabled">Enabled (unchecked will create commented entry)</label>
      </div>
      <div class="buttons">
        <button type="button" id="cancelButton" class="cancel">Cancel</button>
        <button type="submit" id="submitButton" class="submit">Add Entry</button>
      </div>
    </form>
    <script>
      const form = document.getElementById('hostEntryForm');
      const ipInput = document.getElementById('ip');
      const hostnameInput = document.getElementById('hostname');
      const aliasesInput = document.getElementById('aliases');
      const commentInput = document.getElementById('comment');
      const enabledCheckbox = document.getElementById('enabled');
      const cancelButton = document.getElementById('cancelButton');
      
      // IP validation regex
      function isValidIp(ip) {
        // IPv4
        const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        // Simple IPv6 regex (for UI validation)
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}::?){1,7}([0-9a-fA-F]{1,4})?$/;
        // localhost special case
        return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ip === 'localhost';
      }
      
      // Hostname validation regex
      function isValidHostname(hostname) {
        const regex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])*(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])*)*$/;
        return hostname.length <= 255 && regex.test(hostname);
      }
      
      cancelButton.addEventListener('click', () => {
        window.electronAPI.cancelAddEntry();
      });
      
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Validate inputs
        let isValid = true;
        
        // IP validation
        if (!ipInput.value || !isValidIp(ipInput.value)) {
          document.getElementById('ipError').style.display = 'block';
          isValid = false;
        } else {
          document.getElementById('ipError').style.display = 'none';
        }
        
        // Hostname validation
        if (!hostnameInput.value || !isValidHostname(hostnameInput.value)) {
          document.getElementById('hostnameError').style.display = 'block';
          isValid = false;
        } else {
          document.getElementById('hostnameError').style.display = 'none';
        }
        
        // Aliases validation (if provided)
        const aliases = aliasesInput.value.trim() ? aliasesInput.value.trim().split(/\s+/) : [];
        const hasInvalidAlias = aliases.some(alias => !isValidHostname(alias));
        if (hasInvalidAlias) {
          document.getElementById('aliasesError').style.display = 'block';
          isValid = false;
        } else {
          document.getElementById('aliasesError').style.display = 'none';
        }
        
        if (isValid) {
          // Submit the data
          window.electronAPI.submitNewEntry({
            ip: ipInput.value,
            hostname: hostnameInput.value,
            aliases: aliases,
            comment: commentInput.value ? '# ' + commentInput.value : undefined,
            enabled: enabledCheckbox.checked
          });
        }
      });
    </script>
  </body>
  </html>
  `;
  
  // Write HTML to a temporary file
  const tempDir = app.getPath('temp');
  const tempFilePath = path.join(tempDir, `add-host-entry-${Date.now()}.html`);
  await fs.promises.writeFile(tempFilePath, htmlContent, 'utf-8');
  
  // Load the temp file and delete it after loading
  await inputWindow.loadFile(tempFilePath);
  fs.promises.unlink(tempFilePath).catch(console.error);
  
  // Register IPC handlers for the form
  ipcMain.handleOnce('add-entry:submit', async (_event, entry: Omit<HostEntry, 'lineNumber' | 'raw'>) => {
    inputWindow.close();
    
    // Add the entry
    await addHostEntryWithPermissions(parsedHostsFile!, entry);
    
    // Refresh the hosts file
    parsedHostsFile = await hostsFileParser.parseHostsFile();
    updateTrayMenu();
  });
  
  ipcMain.handleOnce('add-entry:cancel', () => {
    inputWindow.close();
  });
  
  // Show the window
  inputWindow.show();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  // Load configuration first
  await initConfiguration();
  
  // Then create UI components
  createWindow();
  createTray();
  
  // Load hosts file
  await initHostsFile();
  
  // Register IPC handlers for hosts file operations
  registerIpcHandlers();
});

// Linux requires explicit setting of the app icon using different method
if (process.platform === 'linux') {
  // Use appropriate icon for Linux platform
  const iconPath = path.join(__dirname, '../assets/icons/512x512.png');
  if (mainWindow) {
    mainWindow.setIcon(nativeImage.createFromPath(iconPath));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

/**
 * Helper function to determine if we need to use elevated permissions
 * based on the current platform and user preferences
 */
function needsElevatedPermissions(): boolean {
  // Check user preferences if configured to always use elevated permissions
  if (appConfig?.system?.alwaysUseElevatedPermissions) {
    return true;
  }
  
  // Otherwise use platform-based default behavior
  return process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux';
}

/**
 * Helper function to show an error dialog when hosts file operations fail
 */
function showHostsFileError(error: Error): void {
  dialog.showErrorBox(
    'Hosts File Error',
    `Failed to modify the hosts file: ${error.message}\n\nYou may need to run the application with administrator/root privileges.`
  );
}

/**
 * Helper function to show a success message after hosts file operations
 */
function showHostsFileSuccess(message: string): void {
  dialog.showMessageBox({
    type: 'info',
    title: 'Success',
    message: message
  });
}

/**
 * Adds a new host entry with elevated permissions if needed
 */
async function addHostEntryWithPermissions(parsedFile: ParsedHostsFile, newEntry: Omit<HostEntry, 'lineNumber' | 'raw'>): Promise<void> {
  try {
    const useElevated = needsElevatedPermissions();
    const result = await hostsFileWriter.addHostEntry(parsedFile, newEntry, { 
      useElevatedPermissions: useElevated,
      createBackup: appConfig?.hostsFile?.createBackups ?? true
    });
    
    if (result.success) {
      showHostsFileSuccess(`Successfully added host entry: ${newEntry.hostname}`);
      
      // Check if we should flush DNS cache
      if (appConfig?.system?.flushDNSOnChange) {
        await flushDNSCache();
      }
    } else if (result.error) {
      showHostsFileError(result.error);
    }
  } catch (error) {
    showHostsFileError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Updates a host entry with elevated permissions if needed
 */
async function updateHostEntryWithPermissions(parsedFile: ParsedHostsFile, updatedEntry: HostEntry): Promise<void> {
  try {
    const useElevated = needsElevatedPermissions();
    const result = await hostsFileWriter.updateHostEntry(parsedFile, updatedEntry, { 
      useElevatedPermissions: useElevated,
      createBackup: appConfig?.hostsFile?.createBackups ?? true
    });
    
    if (result.success) {
      showHostsFileSuccess(`Successfully updated host entry: ${updatedEntry.hostname}`);
      
      // Check if we should flush DNS cache
      if (appConfig?.system?.flushDNSOnChange) {
        await flushDNSCache();
      }
    } else if (result.error) {
      showHostsFileError(result.error);
    }
  } catch (error) {
    showHostsFileError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Toggles a host entry with elevated permissions if needed
 */
async function toggleHostEntryWithPermissions(parsedFile: ParsedHostsFile, lineNumber: number): Promise<void> {
  try {
    const useElevated = needsElevatedPermissions();
    const result = await hostsFileWriter.toggleHostEntry(parsedFile, lineNumber, { 
      useElevatedPermissions: useElevated,
      createBackup: appConfig?.hostsFile?.createBackups ?? true
    });
    
    if (result.success) {
      showHostsFileSuccess(`Successfully toggled host entry`);
      
      // Check if we should flush DNS cache
      if (appConfig?.system?.flushDNSOnChange) {
        await flushDNSCache();
      }
    } else if (result.error) {
      showHostsFileError(result.error);
    }
  } catch (error) {
    showHostsFileError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Removes a host entry with elevated permissions if needed
 */
async function removeHostEntryWithPermissions(parsedFile: ParsedHostsFile, lineNumber: number): Promise<void> {
  try {
    const useElevated = needsElevatedPermissions();
    const result = await hostsFileWriter.removeHostEntry(parsedFile, lineNumber, { 
      useElevatedPermissions: useElevated,
      createBackup: appConfig?.hostsFile?.createBackups ?? true
    });
    
    if (result.success) {
      showHostsFileSuccess(`Successfully removed host entry`);
      
      // Check if we should flush DNS cache
      if (appConfig?.system?.flushDNSOnChange) {
        await flushDNSCache();
      }
    } else if (result.error) {
      showHostsFileError(result.error);
    }
  } catch (error) {
    showHostsFileError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Flushes the DNS cache based on the current platform
 */
async function flushDNSCache(): Promise<void> {
  try {
    let command: string;
    let args: string[];
    
    // Different commands based on platform
    if (process.platform === 'darwin') {
      // macOS
      command = 'sudo';
      args = ['dscacheutil', '-flushcache'];
      
      // Also need to restart mDNSResponder on macOS
      await hostsFileWriter.executeWithElevatedPrivileges(
        command, args, 'Flushing DNS cache'
      );
      
      await hostsFileWriter.executeWithElevatedPrivileges(
        'sudo', ['killall', '-HUP', 'mDNSResponder'], 'Restarting DNS service'
      );
      
    } else if (process.platform === 'win32') {
      // Windows
      command = 'ipconfig';
      args = ['/flushdns'];
      
      await hostsFileWriter.executeWithElevatedPrivileges(
        command, args, 'Flushing DNS cache'
      );
      
    } else if (process.platform === 'linux') {
      // Linux (various distros)
      // Try different service managers
      let success = false;
      
      // Try systemd first
      try {
        await hostsFileWriter.executeWithElevatedPrivileges(
          'sudo', ['systemctl', 'restart', 'nscd'], 'Restarting nscd'
        );
        success = true;
      } catch (e) {
        // nscd not available, try dnsmasq
        try {
          await hostsFileWriter.executeWithElevatedPrivileges(
            'sudo', ['systemctl', 'restart', 'dnsmasq'], 'Restarting dnsmasq'
          );
          success = true;
        } catch (e2) {
          // dnsmasq not available, try network-manager
          try {
            await hostsFileWriter.executeWithElevatedPrivileges(
              'sudo', ['systemctl', 'restart', 'NetworkManager'], 'Restarting NetworkManager'
            );
            success = true;
          } catch (e3) {
            // All attempts failed
            success = false;
          }
        }
      }
      
      if (!success) {
        throw new Error('Unable to find a compatible service to restart for DNS cache clearing');
      }
    } else {
      throw new Error(`DNS cache flushing not supported on platform: ${process.platform}`);
    }
    
    dialog.showMessageBox({
      type: 'info',
      title: 'DNS Cache Flushed',
      message: 'DNS cache has been successfully flushed.'
    });
    
  } catch (error) {
    dialog.showErrorBox(
      'DNS Flush Failed',
      `Failed to flush DNS cache: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Initialize hosts file loading and watching
 */
async function initHostsFile(): Promise<void> {
  try {
    // Load the hosts file
    parsedHostsFile = await hostsFileParser.parseHostsFile();
    
    // Start watching for changes
    if (!hostsFileWatcher) {
      hostsFileWatcher = new HostsFileWatcher(parsedHostsFile.filePath);
      
      // Watch for changes to reload and notify renderer
      hostsFileWatcher.on(HostsFileWatcherEvent.CHANGED, async () => {
        if (parsedHostsFile) {
          // Check if we should auto-reload on external changes
          if (appConfig?.hostsFile?.autoReloadOnExternalChanges !== false) {
            // Reload the file when it changes
            parsedHostsFile = await hostsFileParser.parseHostsFile();
            
            // Notify any open renderer windows
            if (mainWindow) {
              mainWindow.webContents.send('hosts:file-changed', parsedHostsFile);
            }
          }
        }
      });
      
      // Start watching
      hostsFileWatcher.startWatching();
    }
  } catch (error) {
    console.error('Failed to load hosts file:', error);
    dialog.showErrorBox(
      'Error Loading Hosts File',
      `Could not load the hosts file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Initialize configuration manager and load settings
 */
async function initConfiguration(): Promise<void> {
  try {
    // Load the configuration
    appConfig = await configManager.loadConfig();
    
    // Apply any version-specific updates
    await configManager.applyVersionUpdates();
    
    // Setup auto-launch if configured
    await setupAutoLaunch();
    
  } catch (error) {
    console.error('Failed to load configuration:', error);
    // Fall back to default configuration
    appConfig = configManager.getConfig();
  }
}

/**
 * Setup auto-launch based on configuration
 */
async function setupAutoLaunch(): Promise<void> {
  // This is a placeholder for actual auto-launch implementation
  // In a full implementation, we would use a package like 'auto-launch'
  // to configure the app to launch on startup
  console.log('Auto launch configured:', appConfig.startup.launchOnStartup);
}

/**
 * Register IPC handlers for communication with renderer process
 */
function registerIpcHandlers(): void {
  // Get hosts file data
  ipcMain.handle('hosts:get-file', async () => {
    if (!parsedHostsFile) {
      parsedHostsFile = await hostsFileParser.parseHostsFile();
    }
    return parsedHostsFile;
  });
  
  // Add new host entry
  ipcMain.handle('hosts:add-entry', async (_event, entry: Omit<HostEntry, 'lineNumber' | 'raw'>) => {
    if (!parsedHostsFile) {
      parsedHostsFile = await hostsFileParser.parseHostsFile();
    }
    
    try {
      const useElevated = needsElevatedPermissions();
      const result = await hostsFileWriter.addHostEntry(parsedHostsFile, entry, {
        useElevatedPermissions: useElevated,
        createBackup: appConfig?.hostsFile?.createBackups ?? true
      });
      
      if (result.success) {
        // Reload hosts file after successful operation
        parsedHostsFile = await hostsFileParser.parseHostsFile();
      }
      
      return { success: result.success, error: result.error?.message };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // Update host entry
  ipcMain.handle('hosts:update-entry', async (_event, entry: HostEntry) => {
    if (!parsedHostsFile) {
      parsedHostsFile = await hostsFileParser.parseHostsFile();
    }
    
    try {
      const useElevated = needsElevatedPermissions();
      const result = await hostsFileWriter.updateHostEntry(parsedHostsFile, entry, {
        useElevatedPermissions: useElevated,
        createBackup: appConfig?.hostsFile?.createBackups ?? true
      });
      
      if (result.success) {
        // Reload hosts file after successful operation
        parsedHostsFile = await hostsFileParser.parseHostsFile();
      }
      
      return { success: result.success, error: result.error?.message };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // Toggle host entry (enable/disable)
  ipcMain.handle('hosts:toggle-entry', async (_event, lineNumber: number) => {
    if (!parsedHostsFile) {
      parsedHostsFile = await hostsFileParser.parseHostsFile();
    }
    
    try {
      const useElevated = needsElevatedPermissions();
      const result = await hostsFileWriter.toggleHostEntry(parsedHostsFile, lineNumber, {
        useElevatedPermissions: useElevated,
        createBackup: appConfig?.hostsFile?.createBackups ?? true
      });
      
      if (result.success) {
        // Reload hosts file after successful operation
        parsedHostsFile = await hostsFileParser.parseHostsFile();
      }
      
      return { success: result.success, error: result.error?.message };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // Remove host entry
  ipcMain.handle('hosts:remove-entry', async (_event, lineNumber: number) => {
    if (!parsedHostsFile) {
      parsedHostsFile = await hostsFileParser.parseHostsFile();
    }
    
    try {
      const useElevated = needsElevatedPermissions();
      const result = await hostsFileWriter.removeHostEntry(parsedHostsFile, lineNumber, {
        useElevatedPermissions: useElevated,
        createBackup: appConfig?.hostsFile?.createBackups ?? true
      });
      
      if (result.success) {
        // Reload hosts file after successful operation
        parsedHostsFile = await hostsFileParser.parseHostsFile();
      }
      
      return { success: result.success, error: result.error?.message };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // Configuration related handlers
  ipcMain.handle('config:get', () => {
    return configManager.getConfig();
  });
  
  ipcMain.handle('config:update', async (_event, partialConfig: Partial<AppConfiguration>) => {
    try {
      appConfig = await configManager.updateConfig(partialConfig);
      
      // Apply any changes that require immediate action
      if ('startup' in partialConfig) {
        await setupAutoLaunch();
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  ipcMain.handle('config:reset', async () => {
    try {
      appConfig = await configManager.resetToDefaults();
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  // DNS cache flushing
  ipcMain.handle('system:flush-dns', async () => {
    try {
      await flushDNSCache();
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}
