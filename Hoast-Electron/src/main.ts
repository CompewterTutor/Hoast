import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { HostsFileWriter } from './services/hostsFileWriter';
import { ParsedHostsFile, HostEntry } from './types/hostsFile';
import { HostsFileParser } from './services/hostsFileParser';
import { HostsFileWatcher, HostsFileWatcherEvent } from './services/hostsFileWatcher';

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
    macIcon.setTemplateImage(true);
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
};

/**
 * Update the tray menu to reflect current hosts file entries
 */
function updateTrayMenu(): void {
  if (!tray || !parsedHostsFile) return;
  
  // Create the menu items array
  const menuItems: Electron.MenuItemConstructorOptions[] = [
    { 
      label: 'Host Entries', 
      enabled: false, 
      type: 'normal' 
    },
    { 
      type: 'separator' 
    }
  ];
  
  // Add menu items for each host entry (limit to 10 to avoid cluttering)
  const hostEntries = parsedHostsFile.entries.slice(0, 10);
  
  if (hostEntries.length > 0) {
    hostEntries.forEach(entry => {
      // Create a submenu for each host entry
      menuItems.push({
        label: `${entry.enabled ? '✓' : '✗'} ${entry.hostname}`,
        submenu: [
          {
            label: entry.enabled ? 'Disable' : 'Enable',
            click: async () => {
              await toggleHostEntryWithPermissions(parsedHostsFile!, entry.lineNumber);
              // Update menu after toggle
              updateTrayMenu();
            }
          },
          {
            label: 'Remove',
            click: async () => {
              // Ask for confirmation
              const { response } = await dialog.showMessageBox({
                type: 'question',
                buttons: ['Cancel', 'Remove'],
                defaultId: 0,
                title: 'Confirm Removal',
                message: `Are you sure you want to remove "${entry.hostname}" from your hosts file?`
              });
              
              if (response === 1) { // 1 = Remove button
                await removeHostEntryWithPermissions(parsedHostsFile!, entry.lineNumber);
                // Update menu after removal
                updateTrayMenu();
              }
            }
          }
        ]
      });
    });
    
    menuItems.push({ type: 'separator' });
  }
  
  // Add standard menu items
  menuItems.push(
    { 
      label: 'Add New Entry...', 
      click: async () => {
        // Show dialog to add new entry
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('menu:add-new-entry');
        } else {
          // Simple prompt if window not available
          showAddHostEntryDialog();
        }
      } 
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
      label: 'Preferences...', 
      click: () => {
        // Show preferences window
        if (mainWindow) {
          mainWindow.show();
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
 * Show a simple dialog to add a new host entry
 */
async function showAddHostEntryDialog(): Promise<void> {
  if (!parsedHostsFile) return;
  
  // Show a dialog to enter details
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Add Host Entry',
    message: 'Add a new hosts file entry',
    detail: 'Would you like to add a new entry to your hosts file?',
    buttons: ['Cancel', 'Add Entry'],
    defaultId: 1
  });
  
  if (result.response !== 1) return;
  
  // Open the main window and send a message to show the add entry form
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send('menu:add-new-entry');
  } else {
    // Fallback if window isn't available - we'd need to create a custom dialog
    // For now, just show an error that the main window is needed
    dialog.showErrorBox(
      'Cannot Add Entry',
      'The main application window is needed to add entries. Please restart the application if you don\'t see it.'
    );
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  createWindow();
  createTray();
  
  // Load hosts file on startup
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
  // In a real app, we would check the user preferences first
  // For now, we'll just return true for platforms that typically need elevation
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
      createBackup: true
    });
    
    if (result.success) {
      showHostsFileSuccess(`Successfully added host entry: ${newEntry.hostname}`);
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
      createBackup: true
    });
    
    if (result.success) {
      showHostsFileSuccess(`Successfully updated host entry: ${updatedEntry.hostname}`);
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
      createBackup: true
    });
    
    if (result.success) {
      showHostsFileSuccess(`Successfully toggled host entry`);
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
      createBackup: true
    });
    
    if (result.success) {
      showHostsFileSuccess(`Successfully removed host entry`);
    } else if (result.error) {
      showHostsFileError(result.error);
    }
  } catch (error) {
    showHostsFileError(error instanceof Error ? error : new Error(String(error)));
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
          // Reload the file when it changes
          parsedHostsFile = await hostsFileParser.parseHostsFile();
          
          // Notify any open renderer windows
          if (mainWindow) {
            mainWindow.webContents.send('hosts:file-changed', parsedHostsFile);
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
        createBackup: true
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
        createBackup: true
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
        createBackup: true
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
        createBackup: true
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
}
