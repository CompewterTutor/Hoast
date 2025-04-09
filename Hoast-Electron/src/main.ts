import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Keep a global reference of objects to avoid garbage collection
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Hide window initially as we're making a tray app
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

const createTray = () => {
  // Create a default tray icon (we'll replace this with a custom icon later)
  const icon = nativeImage.createEmpty(); // Placeholder for now
  
  // On macOS, the tray icon should be template image (for dark/light mode)
  if (process.platform === 'darwin') {
    // This will be replaced with a proper icon later
  }

  tray = new Tray(icon);
  tray.setToolTip('Hoast - Hosts File Manager');

  // Create the tray menu
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Host Entries', 
      enabled: false, 
      type: 'normal' 
    },
    { 
      type: 'separator' 
    },
    { 
      label: 'Add New Entry...', 
      click: () => {
        // We'll implement this later
        console.log('Add new entry clicked');
      } 
    },
    { 
      label: 'Refresh Hosts File', 
      click: () => {
        // We'll implement this later
        console.log('Refresh clicked');
      } 
    },
    { 
      type: 'separator' 
    },
    { 
      label: 'Preferences...', 
      click: () => {
        // Show preferences window (to be implemented)
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
    },
  ]);

  tray.setContextMenu(contextMenu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();
  createTray();
});

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
