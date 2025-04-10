import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { HostsFileWriter } from './services/hostsFileWriter';
import { ParsedHostsFile, HostEntry, HostGroup } from './types/hostsFile';
import { HostsFileParser } from './services/hostsFileParser';
import { HostsFileWatcher, HostsFileWatcherEvent } from './services/hostsFileWatcher';
import { ConfigurationManager } from './services/configurationManager';
import { GroupManager } from './services/groupManager';
import { AppConfiguration } from './types/configuration';
import AutoLaunch from 'auto-launch';

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
let groupManager: GroupManager = new GroupManager();
let appConfig: AppConfiguration;

// Flag to indicate whether the application is quitting
let willQuit = false;

export const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // Hide window initially as we're making a tray app
    icon: path.join(__dirname, '../assets/icons/icon.ico'), // Set app window icon
    title: 'Hoast - Preferences',
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Don't show the window when it's ready, we're using a tray app
  // mainWindow.webContents.openDevTools();
  
  // Only hide the window when it's closed if we're not quitting the app
  mainWindow.on('close', (event) => {
    if (!willQuit) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
    // Otherwise let the window close normally
    return true;
  });

  // Set appropriate window behavior
  mainWindow.setMenuBarVisibility(false); // Hide default menu bar
  
  // Center window on screen when shown
  mainWindow.on('show', () => {
    mainWindow?.center();
  });
};

export const createTray = () => {
  try {
    console.log("Creating tray icon...");
    // Choose appropriate icon based on platform
    if (process.platform === 'darwin') {
      // Use template image for macOS (supports dark/light mode)
      console.log("Using macOS specific tray icon");
      
      // Define icon paths - macOS needs special handling for menu bar icons
      const iconPaths = [
        path.join(__dirname, '../assets/icons/16x16.png'),
        path.resolve(app.getAppPath(), 'assets/icons/16x16.png'),
        path.join(__dirname, '../assets/icons/icon.png'),
        path.resolve(app.getAppPath(), 'assets/icons/icon.png'),
        path.join(__dirname, '../assets/icons/icon.icns'),
        path.resolve(app.getAppPath(), 'assets/icons/icon.icns')
      ];
      
      // Try to find a valid icon file
      let foundIcon = false;
      for (const iconPath of iconPaths) {
        if (fs.existsSync(iconPath)) {
          console.log(`Found icon at: ${iconPath}`);
          
          // Create a properly sized icon for the macOS menu bar
          const macIcon = nativeImage.createFromPath(iconPath);
          
          // Resize to optimal size for macOS status bar (16x16)
          const resizedIcon = macIcon.resize({
            width: 16,
            height: 16
          });
          
          // Set as template image (monochrome with transparency)
          resizedIcon.setTemplateImage(true);
          
          // Create the tray with the properly sized icon
          tray = new Tray(resizedIcon);
          foundIcon = true;
          break;
        }
      }
      
      if (!foundIcon) {
        console.log("Creating fallback icon");
        // Create a simple 16x16 icon if no icon file is found
        const emptyIcon = nativeImage.createEmpty();
        const smallIcon = emptyIcon.resize({ width: 16, height: 16 });
        smallIcon.setTemplateImage(true);
        tray = new Tray(smallIcon);
      }
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
    console.log("Tray icon created successfully");
  } catch (error) {
    console.error("Failed to create tray icon:", error);
    dialog.showErrorBox(
      'Tray Error',
      `Failed to initialize the application tray: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Update the tray menu to reflect current hosts file entries and groups
 */
async function updateTrayMenu(): Promise<void> {
  if (!tray || !parsedHostsFile) return;
  
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
  if (parsedHostsFile.entries && parsedHostsFile.entries.length > 0) {
    const maxDisplayEntries = appConfig?.ui?.maxEntriesInTrayMenu || 10;
    const shouldGroupByStatus = appConfig?.ui?.groupEntriesByStatus !== false;
    const groupsEnabled = appConfig?.groups?.enabled !== false;
    
    if (groupsEnabled) {
      // Load groups if needed
      await groupManager.loadGroups();
      const groups = groupManager.getGroups();

      // If no groups exist yet, use the basic status grouping
      if (groups.length === 0) {
        createStatusGroupedMenu(menuItems, maxDisplayEntries);
      } else {
        // Add groups to the menu
        for (const group of groups) {
          const groupEntries = groupManager.getEntriesInGroup(parsedHostsFile, group.id);
          
          if (groupEntries.length > 0) {
            // Create submenu for this group
            const groupSubmenu: Electron.MenuItemConstructorOptions[] = [];
            
            // Add group actions at the top of the submenu
            groupSubmenu.push(
              {
                label: group.enabled ? 'Disable Group' : 'Enable Group',
                click: async () => {
                  await toggleGroupWithUpdates(group.id);
                }
              },
              {
                label: 'Edit Group...',
                click: () => {
                  showEditGroupDialog(group);
                }
              },
              {
                label: 'Delete Group',
                click: async () => {
                  // Confirm deletion
                  if (appConfig?.ui?.showConfirmationDialogs !== false) {
                    const { response } = await dialog.showMessageBox({
                      type: 'question',
                      buttons: ['Cancel', 'Delete'],
                      defaultId: 0,
                      title: 'Confirm Group Deletion',
                      message: `Are you sure you want to delete the group "${group.name}"?\n\nThis will not delete any host entries, but they will be ungrouped.`
                    });
                    
                    if (response !== 1) return; // 1 = Delete button
                  }
                  
                  await deleteGroupWithUpdates(group.id);
                }
              },
              { type: 'separator' }
            );
            
            // Add entries in this group to the submenu
            groupEntries.forEach(entry => {
              const statusIcon = entry.enabled ? '✅' : '❌';
              groupSubmenu.push({
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
                    label: 'Remove from Group',
                    click: async () => {
                      await groupManager.removeEntriesFromGroup([entry]);
                      updateTrayMenu();
                    }
                  },
                  {
                    label: 'Remove Entry',
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
            if (groupEntries.length > maxDisplayEntries) {
              groupSubmenu.push({
                label: `... and ${groupEntries.length - maxDisplayEntries} more entries`,
                enabled: false
              });
            }
            
            // Add the group to the main menu
            // Create a colored dot emoji based on the group's color (or default to black)
            const colorDot = group.color ? '🔵' : '⚫'; // Use actual color in a real implementation
            const statusIcon = group.enabled ? '📂' : '📁';
            
            menuItems.push({
              label: `${statusIcon} ${group.name} (${groupEntries.length})`,
              submenu: groupSubmenu
            });
          }
        }
        
        // Add any ungrouped entries
        const allGroupedHostnames = new Set<string>();
        for (const group of groups) {
          const groupEntries = groupManager.getEntriesInGroup(parsedHostsFile, group.id);
          groupEntries.forEach(entry => {
            allGroupedHostnames.add(entry.hostname);
          });
        }
        
        // Find entries that aren't in any group
        const ungroupedEntries = parsedHostsFile.entries.filter(entry => 
          !allGroupedHostnames.has(entry.hostname)
        );
        
        if (ungroupedEntries.length > 0) {
          const ungroupedSubmenu: Electron.MenuItemConstructorOptions[] = [];
          
          // Add ability to create a new group for these entries
          ungroupedSubmenu.push(
            {
              label: 'Create Group for Ungrouped Entries...',
              click: () => {
                showAddGroupDialog(ungroupedEntries);
              }
            },
            { type: 'separator' }
          );
          
          // Add entries not in any group
          ungroupedEntries.slice(0, maxDisplayEntries).forEach(entry => {
            const statusIcon = entry.enabled ? '✅' : '❌';
            ungroupedSubmenu.push({
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
                  label: 'Add to Group',
                  submenu: await createAddToGroupSubmenu(entry)
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
          if (ungroupedEntries.length > maxDisplayEntries) {
            ungroupedSubmenu.push({
              label: `... and ${ungroupedEntries.length - maxDisplayEntries} more ungrouped entries`,
              enabled: false
            });
          }
          
          // Add the ungrouped section to the main menu
          menuItems.push({
            label: `📄 Ungrouped (${ungroupedEntries.length})`,
            submenu: ungroupedSubmenu
          });
        }
        
        // Add group management menu item
        menuItems.push(
          { type: 'separator' },
          {
            label: 'Group Management',
            submenu: [
              {
                label: 'Add New Group...',
                click: () => {
                  showAddGroupDialog();
                }
              },
              {
                label: 'Auto-Group by Patterns...',
                click: () => {
                  showAutoGroupDialog();
                }
              }
            ]
          }
        );
      }
    } else {
      // If groups are disabled, fall back to status grouping
      createStatusGroupedMenu(menuItems, maxDisplayEntries);
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
        willQuit = true; // Set the flag so we know we're truly quitting
        setTimeout(() => {
          app.quit(); // Give a small timeout for the flag to take effect
        }, 100);
      } 
    }
  );
  
  // Update the tray context menu
  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

/**
 * Create submenu for adding an entry to a group
 */
async function createAddToGroupSubmenu(entry: HostEntry): Promise<Electron.MenuItemConstructorOptions[]> {
  await groupManager.loadGroups();
  const groups = groupManager.getGroups();
  
  const submenu: Electron.MenuItemConstructorOptions[] = [];
  
  // Add "Create New Group..." option
  submenu.push({
    label: 'Create New Group...',
    click: () => {
      showAddGroupDialog([entry]);
    }
  });
  
  if (groups.length > 0) {
    submenu.push({ type: 'separator' });
    
    // Add existing groups
    for (const group of groups) {
      submenu.push({
        label: group.name,
        click: async () => {
          await groupManager.assignEntriesToGroup(group.id, [entry]);
          updateTrayMenu();
        }
      });
    }
  }
  
  return submenu;
}

/**
 * Helper function to create menu items grouped by status (enabled/disabled)
 */
function createStatusGroupedMenu(
  menuItems: Electron.MenuItemConstructorOptions[],
  maxDisplayEntries: number
): void {
  // Group entries by enabled/disabled status
  const enabledEntries = parsedHostsFile!.entries.filter(entry => entry.enabled);
  const disabledEntries = parsedHostsFile!.entries.filter(entry => !entry.enabled);
  
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

// Set flag when app is about to quit
app.on('before-quit', () => {
  console.log('Application is about to quit, setting willQuit flag');
  willQuit = true;
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
 * @param config Optional configuration to use instead of global appConfig (useful for testing)
 */
async function setupAutoLaunch(config?: AppConfiguration): Promise<void> {
  try {
    const actualConfig = config || appConfig;
    const appName = app.getName();
    const autoLauncher = new AutoLaunch({
      name: appName,
      path: process.execPath,
      isHidden: actualConfig.startup.startMinimized
    });

    // Check if auto-launch is enabled and configure accordingly
    const isEnabled = await autoLauncher.isEnabled();
    
    if (actualConfig.startup.launchOnStartup && !isEnabled) {
      // Enable auto-launch if it's enabled in config but not in the system
      await autoLauncher.enable();
      console.log(`Auto-launch enabled for ${appName}`);
    } else if (!actualConfig.startup.launchOnStartup && isEnabled) {
      // Disable auto-launch if it's disabled in config but enabled in the system
      await autoLauncher.disable();
      console.log(`Auto-launch disabled for ${appName}`);
    }
  } catch (error) {
    console.error('Failed to configure auto-launch:', error);
  }
}

// Export for testing
export { setupAutoLaunch };

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
  
  // Directory selection dialog
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Backup Directory'
    });
    
    return result;
  });

  // Group-related handlers
  ipcMain.handle('groups:get-all', async () => {
    try {
      await groupManager.loadGroups();
      return groupManager.getGroups();
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  ipcMain.handle('groups:create', async (_event, name: string, options: any) => {
    try {
      const group = await groupManager.createGroup(name, options);
      return { success: true, group };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  ipcMain.handle('groups:update', async (_event, groupId: string, updates: any) => {
    try {
      const group = await groupManager.updateGroup(groupId, updates);
      return { success: true, group };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  ipcMain.handle('groups:delete', async (_event, groupId: string) => {
    try {
      const deleted = await groupManager.deleteGroup(groupId);
      return { success: deleted };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  ipcMain.handle('groups:toggle', async (_event, groupId: string) => {
    try {
      const group = await groupManager.toggleGroup(groupId);
      return { success: true, group };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  ipcMain.handle('groups:assign-entries', async (_event, groupId: string, entries: any[]) => {
    try {
      await groupManager.assignEntriesToGroup(groupId, entries);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  ipcMain.handle('groups:remove-entries', async (_event, entries: any[]) => {
    try {
      await groupManager.removeEntriesFromGroup(entries);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  
  ipcMain.handle('groups:auto-group', async (_event, options: any) => {
    try {
      if (!parsedHostsFile) {
        parsedHostsFile = await hostsFileParser.parseHostsFile();
      }
      
      await groupManager.autoGroupEntries(parsedHostsFile, options);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

/**
 * Shows a dialog to add a new group
 * @param entries Optional entries to add to the new group
 */
async function showAddGroupDialog(entries?: HostEntry[]): Promise<void> {
  try {
    // Create an input dialog for the group name
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Add New Group',
      message: 'Enter a name for the new group:',
      buttons: ['Cancel', 'Create'],
      defaultId: 1,
      cancelId: 0,
      inputField: {
        placeholder: 'Group Name',
        defaultValue: 'New Group'
      }
    });
    
    // User canceled
    if (result.response === 0) {
      return;
    }
    
    const groupName = result.inputValue || 'New Group';
    
    // Create the new group
    const newGroup = await groupManager.createGroup(groupName, {
      description: `Created on ${new Date().toLocaleDateString()}`
    });
    
    // If entries were provided, assign them to the new group
    if (entries && entries.length > 0) {
      await groupManager.assignEntriesToGroup(newGroup.id, entries);
    }
    
    // Update the tray menu to show the new group
    updateTrayMenu();
    
    // Notify the user
    dialog.showMessageBox({
      type: 'info',
      title: 'Group Created',
      message: `Group "${groupName}" was successfully created${entries ? ` with ${entries.length} entries` : ''}.`
    });
    
  } catch (error) {
    console.error('Error creating group:', error);
    dialog.showErrorBox(
      'Error Creating Group',
      `Could not create group: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Shows a dialog to edit an existing group
 * @param group The group to edit
 */
async function showEditGroupDialog(group: HostGroup): Promise<void> {
  try {
    // Create a dialog with form inputs
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Edit Group',
      message: `Edit group "${group.name}"`,
      buttons: ['Cancel', 'Save Changes'],
      defaultId: 1,
      cancelId: 0,
      customItems: [
        { 
          id: 'name',
          type: 'input',
          label: 'Group Name',
          placeholder: 'Enter group name',
          value: group.name
        },
        { 
          id: 'description',
          type: 'input',
          label: 'Description (optional)',
          placeholder: 'Enter description',
          value: group.description || ''
        }
      ]
    });
    
    // User canceled
    if (result.response === 0) {
      return;
    }
    
    // Extract form values
    const formValues = result.values || {};
    const groupName = formValues['name'] as string || group.name;
    const groupDescription = formValues['description'] as string || undefined;
    
    // Update the group
    await groupManager.updateGroup(group.id, {
      name: groupName,
      description: groupDescription
    });
    
    // Update the tray menu to show the changes
    updateTrayMenu();
    
    // Notify the user
    dialog.showMessageBox({
      type: 'info',
      title: 'Group Updated',
      message: `Group "${groupName}" was successfully updated.`
    });
    
  } catch (error) {
    console.error('Error updating group:', error);
    dialog.showErrorBox(
      'Error Updating Group',
      `Could not update group: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Shows a dialog to configure auto-grouping of entries
 */
async function showAutoGroupDialog(): Promise<void> {
  try {
    if (!parsedHostsFile) {
      parsedHostsFile = await hostsFileParser.parseHostsFile();
    }
    
    // Create a dialog to configure auto-grouping
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Auto-Group Entries',
      message: 'Group entries based on hostname patterns',
      buttons: ['Cancel', 'Auto-Group'],
      defaultId: 1,
      cancelId: 0,
      checkboxLabel: 'Create "Ungrouped" group for entries that don\'t match any patterns',
      checkboxChecked: true,
      customItems: [
        {
          id: 'localGroup',
          type: 'checkbox',
          label: 'Create "Local" group for localhost entries',
          checked: true
        },
        {
          id: 'devGroup',
          type: 'checkbox',
          label: 'Create "Development" group for .dev, .test, .local domains',
          checked: true
        },
        {
          id: 'ipGroup',
          type: 'checkbox',
          label: 'Group by IP address ranges (127.0.0.x, 192.168.x.x, etc.)',
          checked: false
        }
      ]
    });
    
    // User canceled
    if (result.response === 0) {
      return;
    }
    
    // Extract options
    const createUngroupedGroup = result.checkboxChecked;
    const formValues = result.values || {};
    const createLocalGroup = formValues['localGroup'] === true;
    const createDevGroup = formValues['devGroup'] === true;
    const groupByIpRanges = formValues['ipGroup'] === true;
    
    // Build criteria for auto-grouping
    const criteria = [];
    
    if (createLocalGroup) {
      criteria.push({
        name: 'Local',
        description: 'localhost entries',
        filter: {
          hostnamePattern: /localhost|local$|^127\./i
        }
      });
    }
    
    if (createDevGroup) {
      criteria.push({
        name: 'Development',
        description: 'Development and testing domains',
        filter: {
          hostnamePattern: /\.(dev|test|local|localhost)$/i
        }
      });
    }
    
    if (groupByIpRanges) {
      // Add IP-based groups
      criteria.push(
        {
          name: 'Loopback',
          description: '127.0.0.x IP addresses',
          filter: {
            ipPattern: /^127\./
          }
        },
        {
          name: 'Private Network',
          description: '192.168.x.x and 10.x.x.x IP addresses',
          filter: {
            ipPattern: /^(192\.168\.|10\.)/
          }
        }
      );
    }
    
    // Perform the auto-grouping
    await groupManager.autoGroupEntries(parsedHostsFile, {
      criteria,
      createUngroupedGroup,
      saveImmediately: true
    });
    
    // Update the tray menu to show the new groups
    updateTrayMenu();
    
    // Notify the user
    dialog.showMessageBox({
      type: 'info',
      title: 'Auto-Grouping Complete',
      message: `Successfully grouped host entries.`
    });
    
  } catch (error) {
    console.error('Error auto-grouping entries:', error);
    dialog.showErrorBox(
      'Error Auto-Grouping',
      `Could not auto-group entries: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Toggles a group's enabled state and updates affected host entries
 * @param groupId ID of the group to toggle
 */
async function toggleGroupWithUpdates(groupId: string): Promise<void> {
  try {
    // Load groups if needed
    await groupManager.loadGroups();
    
    // Ensure hosts file is loaded
    if (!parsedHostsFile) {
      parsedHostsFile = await hostsFileParser.parseHostsFile();
    }
    
    // Get the group before toggling
    const groupBefore = groupManager.getGroupById(groupId);
    if (!groupBefore) {
      throw new Error(`Group with ID ${groupId} not found`);
    }
    
    // Toggle the group's enabled state
    const updatedGroup = await groupManager.toggleGroup(groupId);
    if (!updatedGroup) {
      throw new Error('Failed to toggle group');
    }
    
    // Get entries in this group
    const groupEntries = groupManager.getEntriesInGroup(parsedHostsFile, groupId);
    
    // If no entries, just update the UI
    if (groupEntries.length === 0) {
      updateTrayMenu();
      return;
    }
    
    // Confirm if there are entries to update
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Cancel', groupBefore.enabled ? 'Disable Entries' : 'Enable Entries'],
      defaultId: 1,
      cancelId: 0,
      title: 'Update Host Entries',
      message: `Do you want to ${groupBefore.enabled ? 'disable' : 'enable'} all ${groupEntries.length} entries in this group?`
    });
    
    if (response !== 1) {
      // User canceled, update UI but don't change entries
      updateTrayMenu();
      return;
    }
    
    // Update all entries to match the group's enabled state
    for (const entry of groupEntries) {
      // Skip entries that already have the desired state
      if (entry.enabled === updatedGroup.enabled) continue;
      
      // Toggle this entry
      await toggleHostEntryWithPermissions(parsedHostsFile, entry.lineNumber);
    }
    
    // Reload hosts file after changes
    parsedHostsFile = await hostsFileParser.parseHostsFile();
    
    // Update the UI
    updateTrayMenu();
    
    // Notify the user
    dialog.showMessageBox({
      type: 'info',
      title: 'Group Updated',
      message: `Successfully ${updatedGroup.enabled ? 'enabled' : 'disabled'} group "${updatedGroup.name}" and ${groupEntries.length} entries.`
    });
    
  } catch (error) {
    console.error('Error toggling group:', error);
    dialog.showErrorBox(
      'Error Toggling Group',
      `Could not toggle group: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Deletes a group and optionally its entries
 * @param groupId ID of the group to delete
 */
async function deleteGroupWithUpdates(groupId: string): Promise<void> {
  try {
    // Load groups if needed
    await groupManager.loadGroups();
    
    // Get the group before deletion
    const group = groupManager.getGroupById(groupId);
    if (!group) {
      throw new Error(`Group with ID ${groupId} not found`);
    }
    
    // Delete the group
    await groupManager.deleteGroup(groupId);
    
    // Update the UI
    updateTrayMenu();
    
    // Notify the user
    dialog.showMessageBox({
      type: 'info',
      title: 'Group Deleted',
      message: `Successfully deleted group "${group.name}".`
    });
    
  } catch (error) {
    console.error('Error deleting group:', error);
    dialog.showErrorBox(
      'Error Deleting Group',
      `Could not delete group: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Shows a dialog to add a new host entry
 * with optional group assignment
 */
async function showAddHostEntryDialog(): Promise<void> {
  try {
    // First, make sure groups are loaded
    await groupManager.loadGroups();
    const groups = groupManager.getGroups();
    
    // Create dropdown options for the groups
    const groupOptions = [
      { id: 'none', label: 'None (No group)' },
      ...groups.map(group => ({
        id: group.id,
        label: group.name
      }))
    ];
    
    // Create a dialog with form inputs
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Add New Host Entry',
      message: 'Add a new entry to your hosts file',
      buttons: ['Cancel', 'Add Entry'],
      defaultId: 1,
      cancelId: 0,
      customItems: [
        { 
          id: 'ip',
          type: 'input',
          label: 'IP Address',
          placeholder: '127.0.0.1',
          value: '127.0.0.1'
        },
        { 
          id: 'hostname',
          type: 'input',
          label: 'Hostname',
          placeholder: 'example.com'
        },
        {
          id: 'enabled',
          type: 'checkbox',
          label: 'Enabled',
          checked: true
        },
        {
          id: 'group',
          type: 'select',
          label: 'Assign to Group',
          options: groupOptions
        }
      ]
    });
    
    // User canceled
    if (result.response === 0) {
      return;
    }
    
    // Extract form values
    const formValues = result.values || {};
    const ip = formValues['ip'] as string || '127.0.0.1';
    const hostname = formValues['hostname'] as string;
    const enabled = formValues['enabled'] === true;
    const groupId = formValues['group'] as string;
    
    // Validate hostname
    if (!hostname || hostname.trim() === '') {
      dialog.showErrorBox(
        'Invalid Hostname',
        'A hostname is required.'
      );
      return;
    }
    
    // Create the host entry
    const newEntry: Omit<HostEntry, 'lineNumber' | 'raw'> = {
      ip,
      hostname: hostname.trim(),
      enabled,
      aliases: [],
      comment: ''
    };
    
    // Add the entry to the hosts file
    if (!parsedHostsFile) {
      parsedHostsFile = await hostsFileParser.parseHostsFile();
    }
    
    // Add the new entry with appropriate permissions
    await addHostEntryWithPermissions(parsedHostsFile, newEntry);
    
    // Reload hosts file after adding entry
    parsedHostsFile = await hostsFileParser.parseHostsFile();
    
    // Find the newly added entry
    const addedEntry = parsedHostsFile.entries.find(entry => 
      entry.hostname === newEntry.hostname && entry.ip === newEntry.ip
    );
    
    // If an entry was successfully added and a group was selected, assign the entry to the group
    if (addedEntry && groupId && groupId !== 'none') {
      await groupManager.assignEntriesToGroup(groupId, [addedEntry]);
    }
    
    // Update the tray menu to show the new entry
    updateTrayMenu();
    
  } catch (error) {
    console.error('Error adding host entry:', error);
    dialog.showErrorBox(
      'Error Adding Host Entry',
      `Could not add host entry: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
